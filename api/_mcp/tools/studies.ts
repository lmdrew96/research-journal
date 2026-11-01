import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  readData,
  writeData,
  getActiveProject,
  getActiveProjectOrNull,
  type McpContext,
  liveThemes,
} from '../store.js';
import type {
  Decision,
  DecisionStatus,
  DesignItem,
  DesignItemFields,
  DesignItemKind,
  Hypothesis,
  HypothesisStatus,
  Project,
  Study,
  StudyStatus,
} from '../../../src/types/index.js';
import { ok, okEmpty, err, notFound } from '../envelope.js';
import { FIELD_DISCIPLINE } from '../field-discipline.js';
import { pruneConnectionsTo } from '../../_connections.js';
import {
  DESIGN_FIELDS_BY_KIND,
  DESIGN_ITEM_KINDS,
  DESIGN_SECTION_LABELS,
  LINK_TARGETS,
  LINK_TARGET_KINDS,
  SINGLETON_KINDS,
  VARIABLE_ROLES,
  chainsOfKind,
  currentHypothesisId,
  designChains,
  designItemIdsOf,
  designItemLabel,
  findDesignItem,
  linksFrom,
  normalizeDesignFields,
  procedureTotal,
  replaceLinks,
  repointConnections,
  effectiveStatus,
  fillableFields,
  moveOpenDecisions,
  openDecisionsOn,
  sectionStatus,
  withDecisionSettled,
} from '../../_design-items.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) or with journal_add_project.';

const STUDY_STATUS = z.enum([
  'planned',
  'in_progress',
  'collecting',
  'analyzing',
  'complete',
  'abandoned',
]);
const HYPOTHESIS_STATUS = z.enum(['active', 'superseded', 'retired']);
const DECISION_STATUS = z.enum(['open', 'settled', 'superseded']);
const PROVENANCE = z.enum(['nae', 'coru', 'convergent', 'external']);
const DESIGN_KIND = z.enum(DESIGN_ITEM_KINDS as [DesignItemKind, ...DesignItemKind[]]);
const DESIGN_STATUS = z.enum(['open', 'settled']);

/**
 * Every design field, all optional. Which ones a kind accepts is checked in
 * the handler against DESIGN_FIELDS_BY_KIND, so the error can name them.
 * On update, '' or null clears a field.
 */
const DESIGN_FIELDS_INPUT = z
  .object({
    text: z.string().nullable(),
    name: z.string().nullable(),
    population: z.string().nullable(),
    proficiency: z.string().nullable(),
    languages: z.string().nullable(),
    inclusion: z.string().nullable(),
    exclusion: z.string().nullable(),
    targetN: z.number().nonnegative().nullable(),
    measures: z.string().nullable(),
    scoring: z.string().nullable(),
    minutes: z.number().nonnegative().nullable(),
    role: z.enum(VARIABLE_ROLES as [string, ...string[]]).nullable(),
  })
  .partial();

const DESIGN_FIELDS_HELP =
  'Fields by kind — framework: text. participants: population, proficiency, languages, ' +
  'inclusion, exclusion, targetN, text (notes). material: name, text (count, level, how chosen). ' +
  'measure: name (the instrument), measures (what it measures), scoring, text (notes). ' +
  'step: name, minutes, text. variable: name, role (predictor | outcome | moderator | ' +
  'covariate), text. cleaning: text. analysis: text. Long-form text is markdown.';

const DESIGN_LINKS_INPUT = z
  .object({
    articleIds: z.array(z.string()).describe('Library article ids — sources for framework, material, measure'),
    hypothesisIds: z.array(z.string()).describe('Hypothesis ids on this study — what a variable or the analysis tests'),
    measureIds: z.array(z.string()).describe('Measure design-item ids on this study — what produces a variable, or what cleaning applies to'),
  })
  .partial();

const DESIGN_LINKS_HELP =
  'Links, each list replacing that kind of link wholesale. framework/material/measure: ' +
  'articleIds. variable: measureIds (produced by) and hypothesisIds (tests). cleaning: ' +
  'measureIds. analysis: hypothesisIds. Stored as connections from the item.';

/**
 * Shared with write.ts in spirit — kept in each file like the status enums.
 * The "originated with, not wrote down" line is the distinction that makes the
 * field worth having, so it is spelled out in every tool that sets it.
 */
const PROVENANCE_FIELD =
  "Who the idea ORIGINATED with — not who wrote it down. 'nae', 'coru', 'convergent' (both " +
  "arrived at it independently) or 'external' (a paper, a professor, a conversation " +
  'elsewhere). Leave unset when you do not know: unset means "not recorded", and guessing ' +
  'defeats the point. Nuance beyond the four values goes in a note or decision rationale.';

/**
 * Field descriptions shared between the add and update tools for each object,
 * so a field cannot be described one way at creation and another at edit.
 *
 * A decision is three fields with three jobs — what was chosen, what was not,
 * and why — and the failure mode is writing all three into `decision`. Each one
 * names the others so that is harder to do by accident.
 */
const STUDY_FIELD = {
  title: 'Study title. One line.',
  description:
    'Short framing of what the study is and what it is for. Aim for two to four sentences. ' +
    'The method does not go here — variables, instruments and the analysis plan belong in ' +
    '`design`.',
  design:
    'ARCHIVED. The design as one markdown block, from before it was split into sections. Kept ' +
    'as a read-only snapshot in the app. Do not put new design content here: use ' +
    'journal_add_design_item for each section (framework, participants, materials, measures, ' +
    'procedure steps, variables, response cleaning, analysis).',
  statement:
    'The hypothesis itself — a claim that could turn out to be false. One sentence. Why you ' +
    'hold it, and what would change your mind, belong in a decision rationale.',
  decision:
    'WHAT was chosen, or the open question if this is not settled yet. State it in one line. ' +
    'Do not fold the reasoning or the rejected options in here — they have their own fields.',
  rationale:
    'WHY. This is the field that carries the value: the reasoning that will be impossible to ' +
    'reconstruct in six months. Long-form is fine.',
  alternativesRejected:
    'WHAT WAS NOT chosen, and — briefly — what ruled it out. Recording the road not taken is ' +
    'what stops the same option being reconsidered from scratch later.',
} as const;

/**
 * Studies live on the project as an optional array, absent rather than []
 * when there are none — see Project.studies. Reads go through here; writes
 * go through mutableStudies, which materializes the array so mutations reach
 * the object writeData persists.
 */
function studiesOf(project: Project): Study[] {
  return project.studies ?? [];
}

function mutableStudies(project: Project): Study[] {
  return (project.studies ??= []);
}

/** Drops `studies` again when the last one goes, keeping the blob byte-comparable. */
function pruneStudies(project: Project): void {
  if (project.studies && project.studies.length === 0) delete project.studies;
}

function questionExists(project: Project, questionId: string): boolean {
  return liveThemes(project).some((t) => t.questions.some((q) => q.id === questionId));
}

function findStudy(project: Project, studyId: string): Study | undefined {
  return studiesOf(project).find((s) => s.id === studyId);
}

/**
 * Hypotheses and decisions are addressed by their own id, without a study id —
 * the caller is holding an id out of a previous tool response and shouldn't
 * have to remember which study it came from. Ids are uuids, so the scan is
 * unambiguous.
 */
function findHypothesis(
  project: Project,
  hypothesisId: string,
): { study: Study; hypothesis: Hypothesis } | undefined {
  for (const study of studiesOf(project)) {
    const hypothesis = study.hypotheses.find((h) => h.id === hypothesisId);
    if (hypothesis) return { study, hypothesis };
  }
  return undefined;
}

function findDecision(
  project: Project,
  decisionId: string,
): { study: Study; decision: Decision } | undefined {
  for (const study of studiesOf(project)) {
    const decision = study.decisions.find((d) => d.id === decisionId);
    if (decision) return { study, decision };
  }
  return undefined;
}

/**
 * Moves a hypothesis's whole revision chain to `position` among the chains,
 * clamped. Undefined leaves the order alone.
 *
 * Display order everywhere is the order of chain HEADS (src/lib/revision-chains.ts),
 * and the current version of a revised hypothesis is never the head — so moving
 * just that row, as this used to, changed nothing on screen. The chain moves as
 * a unit instead, exactly like moveHypothesis in the app, and its rows keep their
 * relative order.
 */
function moveChainTo(study: Study, hypothesisId: string, position: number | undefined): void {
  if (position === undefined) return;
  const items = study.hypotheses;
  const pointedAt = new Set(items.map((h) => h.supersededBy).filter((id): id is string => !!id));
  const chains = items.filter((h) => !pointedAt.has(h.id)).map((head) => chainFrom(items, head));

  const from = chains.findIndex((chain) => chain.some((h) => h.id === hypothesisId));
  if (from === -1) return;
  const [moved] = chains.splice(from, 1);
  chains.splice(Math.max(0, Math.min(position, chains.length)), 0, moved);

  // Rows no chain reaches (a cycle) are kept at the end, and a row two heads
  // reach is kept once — a move must never add or drop a hypothesis.
  const seen = new Set<string>();
  const ordered: Hypothesis[] = [];
  for (const h of [...chains.flat(), ...items]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    ordered.push(h);
  }
  items.splice(0, items.length, ...ordered);
}

/** Question text for a hypothesis's questionId, so responses aren't bare ids. */
function questionTextFor(project: Project, questionId: string | null): string | null {
  if (!questionId) return null;
  for (const t of liveThemes(project)) {
    const q = t.questions.find((q) => q.id === questionId);
    if (q) return q.q;
  }
  return null;
}

/**
 * Walks a supersede chain oldest → newest.
 *
 * Pointers run forward (v1.supersededBy = v2.id), so the head of a chain is
 * the row nothing points at. The `seen` guard means a cycle — which the schema
 * permits and a bad write could create — truncates instead of hanging.
 */
function chainFrom<T extends { id: string; supersededBy: string | null }>(
  items: T[],
  head: T,
): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const chain: T[] = [head];
  const seen = new Set([head.id]);
  let current = head;
  while (current.supersededBy) {
    const next = byId.get(current.supersededBy);
    if (!next || seen.has(next.id)) break;
    chain.push(next);
    seen.add(next.id);
    current = next;
  }
  return chain;
}

type DesignFieldsInput = z.infer<typeof DESIGN_FIELDS_INPUT>;
type DesignLinksInput = z.infer<typeof DESIGN_LINKS_INPUT>;

/** Keys supplied that the kind doesn't carry, for an error that names the right ones. */
function strayFieldKeys(kind: DesignItemKind, fields: DesignFieldsInput | undefined): string[] {
  const allowed = new Set<string>(DESIGN_FIELDS_BY_KIND[kind]);
  return Object.keys(fields ?? {}).filter((k) => !allowed.has(k));
}

/** Merges a patch into stored fields: a key set to null or '' is cleared. */
function mergeDesignFields(kind: DesignItemKind, base: DesignItemFields, patch: DesignFieldsInput): DesignItemFields {
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  return normalizeDesignFields(kind, merged);
}

const LINK_KEY_TYPE = {
  articleIds: 'article',
  hypothesisIds: 'hypothesis',
  measureIds: 'design_item',
} as const;

/**
 * Checks a links input against what the kind may link to and what exists.
 * Returns an error message, or null when every id is good.
 */
function checkDesignLinks(
  project: Project,
  study: Study,
  kind: DesignItemKind,
  links: DesignLinksInput | undefined,
): string | null {
  for (const [key, ids] of Object.entries(links ?? {}) as [keyof typeof LINK_KEY_TYPE, string[] | undefined][]) {
    if (!ids) continue;
    const toType = LINK_KEY_TYPE[key];
    if (!LINK_TARGETS[kind].includes(toType)) {
      return `A ${kind} can't take \`${key}\`. It links to: ${LINK_TARGETS[kind].join(', ') || 'nothing'}.`;
    }
    for (const id of ids) {
      const exists =
        toType === 'article'
          ? project.library.some((a) => a.id === id)
          : toType === 'hypothesis'
            ? study.hypotheses.some((h) => h.id === id)
            : (study.designItems ?? []).some(
                (d) => d.id === id && (LINK_TARGET_KINDS[kind] ?? []).includes(d.kind),
              );
      if (!exists) return `\`${key}\`: ${id} is not ${toType === 'article' ? 'in the library' : 'on this study'}.`;
    }
  }
  return null;
}

/** A decision may be attached only to a current design item on its own study. */
function checkDecisionItem(study: Study, designItemId: string | null | undefined): string | null {
  if (!designItemId) return null;
  const item = (study.designItems ?? []).find((d) => d.id === designItemId);
  if (!item) return `Design item ${designItemId} is not on "${study.title}".`;
  if (item.supersededBy) return `${designItemId} is an earlier version (replaced by ${item.supersededBy}). Attach to the current one.`;
  return null;
}

const DESIGN_ITEM_ID_FIELD =
  'The design item this decision is about — the cue list for "how many cues?". An open ' +
  'decision keeps its item showing as open; settling it settles the item once nothing else is ' +
  'open on it. Must be a current item on the same study.';

function applyDesignLinks(project: Project, itemId: string, links: DesignLinksInput | undefined): void {
  const now = new Date().toISOString();
  let list = project.connections ?? [];
  for (const [key, ids] of Object.entries(links ?? {}) as [keyof typeof LINK_KEY_TYPE, string[] | undefined][]) {
    if (!ids) continue;
    list = replaceLinks(list, itemId, LINK_KEY_TYPE[key], ids, () => randomUUID(), now);
  }
  if (list.length > 0) project.connections = list;
  else delete project.connections;
}

/** The design as Coru reads it: sections in order, current versions, links resolved. */
function describeDesign(study: Study, project: Project) {
  const titleOf = (id: string) => project.library.find((a) => a.id === id)?.title ?? null;
  const hypothesisOf = (id: string) => {
    const h = study.hypotheses.find((x) => x.id === currentHypothesisId(study, id));
    return h ? { id: h.id, label: h.label, statement: h.statement } : null;
  };
  const sections = DESIGN_ITEM_KINDS.map((kind) => {
    const items = chainsOfKind(study, kind).map(({ current, history }) => ({
      id: current.id,
      fields: current.fields,
      // What the app shows: open while any open decision is attached.
      status: effectiveStatus(study, current),
      openDecisions: openDecisionsOn(study, current.id).map((d) => ({ id: d.id, decision: d.decision })),
      provenance: current.provenance ?? null,
      versions: history.length,
      links: {
        articles: linksFrom(project, current.id, 'article')
          .map((c) => ({ id: c.toId, title: titleOf(c.toId) }))
          .filter((a) => a.title),
        hypotheses: linksFrom(project, current.id, 'hypothesis')
          .map((c) => hypothesisOf(c.toId))
          .filter(Boolean),
        measures: linksFrom(project, current.id, 'design_item')
          .map((c) => (study.designItems ?? []).find((d) => d.id === c.toId))
          .filter((d): d is DesignItem => !!d)
          .map((d) => ({ id: d.id, name: d.fields.name ?? null })),
      },
    }));
    return { kind, title: DESIGN_SECTION_LABELS[kind], status: sectionStatus(study, kind), items };
  }).filter((sec) => sec.items.length > 0);
  const { minutes, unTimed } = procedureTotal(study);
  return {
    sections,
    procedure: {
      totalMinutes: minutes,
      untimedSteps: unTimed,
      targetSessionMinutes: study.targetSessionMinutes ?? null,
    },
  };
}

function summarize(study: Study) {
  return {
    id: study.id,
    title: study.title,
    status: study.status,
    description: study.description,
    provenance: study.provenance ?? null,
    activeHypotheses: study.hypotheses.filter((h) => h.status === 'active').length,
    openDecisions: study.decisions.filter((d) => d.status === 'open').length,
    designItems: designChains(study.designItems ?? []).length,
    linkedQuestions: study.linkedQuestions.length,
    createdAt: study.createdAt,
    updatedAt: study.updatedAt,
  };
}

function detail(study: Study, project: Project) {
  return {
    ...study,
    hypotheses: study.hypotheses.map((h) => ({
      ...h,
      questionText: questionTextFor(project, h.questionId),
    })),
    linkedQuestionsDetail: study.linkedQuestions.map((id) => ({
      id,
      q: questionTextFor(project, id),
    })),
    designDetail: describeDesign(study, project),
  };
}

export function registerStudyTools(server: McpServer, ctx: McpContext): void {
  // --- journal_add_study ---
  server.registerTool(
    'journal_add_study',
    {
      title: 'Add Study',
      description:
        'Creates a study — original research being designed, as opposed to a paper someone ' +
        'else wrote. Studies sit alongside the article library, not under a question, and ' +
        'link to questions many-to-many. The design is added afterwards, one section at a ' +
        'time, with journal_add_design_item; hypotheses and decisions are separate objects. ' +
        'Returns the new study ID. ' +
        FIELD_DISCIPLINE,
      inputSchema: z.object({
        title: z.string().min(1).describe(STUDY_FIELD.title),
        description: z.string().default('').describe(STUDY_FIELD.description),
        design: z.string().default('').describe(STUDY_FIELD.design),
        status: STUDY_STATUS.default('planned').describe('Study status'),
        provenance: PROVENANCE.optional().describe(PROVENANCE_FIELD),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, description, design, status, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const now = new Date().toISOString();

      const study: Study = {
        id: randomUUID(),
        title,
        status: status as StudyStatus,
        description,
        design,
        ...(provenance ? { provenance } : {}),
        linkedQuestions: [],
        hypotheses: [],
        decisions: [],
        createdAt: now,
        updatedAt: now,
      };
      mutableStudies(project).push(study);
      await writeData(ctx.userId, data);

      return ok(project, `Created study "${title}" (${study.id}).`, { studyId: study.id, study });
    }
  );

  // --- journal_get_studies ---
  server.registerTool(
    'journal_get_studies',
    {
      title: 'Get Studies',
      description:
        'Lists every study in the active project with counts of active hypotheses and open ' +
        'decisions. Use journal_get_study for the full contents of one.',
      inputSchema: z.object({
        status: STUDY_STATUS.optional().describe('Only studies with this status'),
        provenance: PROVENANCE.optional().describe(
          'Only studies with this provenance. Unrecorded ones are never matched. To find ' +
            'hypotheses or decisions by origin, read journal_get_study — each row carries it.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ status, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { studies: [] });

      const studies = studiesOf(project)
        .filter((s) => !status || s.status === status)
        .filter((s) => !provenance || s.provenance === provenance)
        .map(summarize);

      if (studies.length === 0) {
        return ok(
          project,
          status || provenance
            ? 'No studies match that filter.'
            : 'No studies yet — create one with journal_add_study.',
          { studies: [] },
        );
      }

      return ok(
        project,
        `${studies.length} stud${studies.length === 1 ? 'y' : 'ies'}:\n\n` +
          JSON.stringify(studies, null, 2),
        { studies },
      );
    }
  );

  // --- journal_get_study ---
  server.registerTool(
    'journal_get_study',
    {
      title: 'Get Study',
      description:
        'Full detail for one study: every hypothesis and decision (superseded ones included, ' +
        'each carrying the id of what replaced it), linked questions with their text, and ' +
        '`designDetail` — the design by section (current versions, fields, links resolved) ' +
        'with the procedure total against the target session length. `designItems` holds every ' +
        'version raw; `design` is the archived text from before sections.',
      inputSchema: z.object({
        studyId: z.string().describe('The study ID'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ studyId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);

      const described = detail(study, project);
      return ok(project, `Study "${study.title}":\n\n${JSON.stringify(described, null, 2)}`, {
        study: described,
      });
    }
  );

  // --- journal_update_study ---
  server.registerTool(
    'journal_update_study',
    {
      title: 'Update Study',
      description:
        'Updates a study. Only provided fields change; each replaces the existing value ' +
        'wholesale. Hypotheses, decisions and design items are edited with their own tools.',
      inputSchema: z.object({
        studyId: z.string().describe('The study ID'),
        title: z.string().min(1).optional().describe(STUDY_FIELD.title),
        description: z.string().optional().describe(STUDY_FIELD.description),
        design: z.string().optional().describe(STUDY_FIELD.design),
        targetSessionMinutes: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe('Target length of one session in minutes — the procedure total is held against it. null clears it.'),
        status: STUDY_STATUS.optional().describe('New status'),
        provenance: PROVENANCE.nullable()
          .optional()
          .describe(`${PROVENANCE_FIELD} Pass null to clear.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, title, description, design, targetSessionMinutes, status, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);

      const changed: string[] = [];
      if (targetSessionMinutes !== undefined) {
        // Deleted rather than nulled so the blob stays byte-comparable.
        if (targetSessionMinutes === null) delete study.targetSessionMinutes;
        else study.targetSessionMinutes = targetSessionMinutes;
        changed.push('targetSessionMinutes');
      }
      if (title !== undefined) {
        study.title = title;
        changed.push('title');
      }
      if (description !== undefined) {
        study.description = description;
        changed.push('description');
      }
      if (design !== undefined) {
        study.design = design;
        changed.push('design');
      }
      if (status !== undefined) {
        study.status = status as StudyStatus;
        changed.push('status');
      }
      if (provenance !== undefined) {
        // Deleted rather than nulled so the blob stays byte-comparable.
        if (provenance === null) delete study.provenance;
        else study.provenance = provenance;
        changed.push('provenance');
      }

      if (changed.length === 0) {
        return ok(project, 'No fields provided to update.', { changed: [] });
      }

      study.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(project, `Updated study ${studyId} — changed: ${changed.join(', ')}.`, {
        changed,
      });
    }
  );

  // --- journal_delete_study ---
  server.registerTool(
    'journal_delete_study',
    {
      title: 'Delete Study',
      description:
        'Permanently removes a study AND every hypothesis, decision and design item on it. Linked ' +
        'questions themselves are untouched — only the links go. This is irreversible.',
      inputSchema: z.object({
        studyId: z.string().describe('The study ID to delete'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ studyId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const studies = studiesOf(project);
      const index = studies.findIndex((s) => s.id === studyId);
      if (index === -1) return notFound('Study', studyId, project);

      const [removed] = studies.splice(index, 1);
      pruneStudies(project);
      pruneConnectionsTo(
        project,
        new Set([studyId, ...removed.hypotheses.map((h) => h.id), ...designItemIdsOf(removed)]),
      );
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Deleted study "${removed.title}" along with ${removed.hypotheses.length} ` +
          `hypothes${removed.hypotheses.length === 1 ? 'is' : 'es'} and ` +
          `${removed.decisions.length} decision(s).`,
        {
          deletedStudyId: studyId,
          deletedHypotheses: removed.hypotheses.length,
          deletedDecisions: removed.decisions.length,
        },
      );
    }
  );

  // --- journal_link_study_question ---
  server.registerTool(
    'journal_link_study_question',
    {
      title: 'Link Study to Question',
      description:
        'Links or unlinks a study and a research question. Mirrors journal_link_question for ' +
        'articles: pass linked=true to link, linked=false to unlink. The link is what makes a ' +
        'question show both the literature about it and the research being done on it.',
      inputSchema: z.object({
        studyId: z.string().describe('The study ID'),
        questionId: z.string().describe('The research question ID'),
        linked: z.boolean().describe('true to link, false to unlink'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, questionId, linked }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);
      // A link to a question that doesn't exist is invisible in the app and
      // survives every later edit — same reasoning as journal entry links.
      if (linked && !questionExists(project, questionId)) {
        return notFound('Question', questionId, project);
      }

      const already = study.linkedQuestions.includes(questionId);
      if (linked && already) {
        return ok(project, `Study ${studyId} is already linked to question ${questionId}.`, {
          linkedQuestions: study.linkedQuestions,
        });
      }
      if (!linked && !already) {
        return ok(project, `Study ${studyId} was not linked to question ${questionId}.`, {
          linkedQuestions: study.linkedQuestions,
        });
      }

      study.linkedQuestions = linked
        ? [...study.linkedQuestions, questionId]
        : study.linkedQuestions.filter((id) => id !== questionId);
      study.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(
        project,
        `${linked ? 'Linked' : 'Unlinked'} study "${study.title}" ` +
          `${linked ? 'to' : 'from'} question ${questionId}.`,
        { linkedQuestions: study.linkedQuestions },
      );
    }
  );

  // --- journal_add_hypothesis ---
  server.registerTool(
    'journal_add_hypothesis',
    {
      title: 'Add Hypothesis',
      description:
        'Adds a hypothesis to a study. To REVISE an existing hypothesis use ' +
        'journal_supersede_hypothesis instead — that keeps the revision chain intact, where ' +
        'adding a second hypothesis just leaves two active claims. Returns the new ID. ' +
        FIELD_DISCIPLINE,
      inputSchema: z.object({
        studyId: z.string().describe('The study this hypothesis belongs to'),
        statement: z.string().min(1).describe(STUDY_FIELD.statement),
        label: z.string().nullable().default(null).describe("Display label, e.g. 'H1'"),
        questionId: z
          .string()
          .nullable()
          .default(null)
          .describe('The research question this hypothesis operationalizes'),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Where it appears among the study\'s hypotheses as displayed (0 = first); appends ' +
              'when omitted. Revised hypotheses count once — a revision chain is one entry.',
          ),
        provenance: PROVENANCE.optional().describe(PROVENANCE_FIELD),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, statement, label, questionId, position, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);
      if (questionId && !questionExists(project, questionId)) {
        return notFound('Question', questionId, project);
      }

      const now = new Date().toISOString();
      const hypothesis: Hypothesis = {
        id: randomUUID(),
        label,
        statement,
        status: 'active',
        supersededBy: null,
        questionId,
        ...(provenance ? { provenance } : {}),
        createdAt: now,
        updatedAt: now,
      };
      study.hypotheses.push(hypothesis);
      moveChainTo(study, hypothesis.id, position);
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Added ${label ?? 'hypothesis'} to "${study.title}" (${hypothesis.id}):\n\n> ${statement}`,
        { hypothesisId: hypothesis.id, studyId },
      );
    }
  );

  // --- journal_update_hypothesis ---
  server.registerTool(
    'journal_update_hypothesis',
    {
      title: 'Update Hypothesis',
      description:
        'Edits a hypothesis in place. Use this to fix a typo, relabel, refile against a ' +
        'different question, or retire it. Do NOT use it to revise the claim — that is what ' +
        'journal_supersede_hypothesis is for, and editing in place erases the history.',
      inputSchema: z.object({
        hypothesisId: z.string().describe('The hypothesis ID'),
        statement: z
          .string()
          .min(1)
          .optional()
          .describe(
            `${STUDY_FIELD.statement} Use this only to CORRECT a statement — to revise a ` +
              'hypothesis you have changed your mind about, use journal_supersede_hypothesis, ' +
              'which keeps the revision chain.',
          ),
        label: z.string().nullable().optional().describe('New label, or null to clear'),
        status: HYPOTHESIS_STATUS.optional().describe('New status'),
        questionId: z
          .string()
          .nullable()
          .optional()
          .describe('New linked question, or null to unlink'),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'New place among the study\'s hypotheses as displayed (0 = first). Moves the ' +
              'whole revision chain, so any version of the hypothesis can be passed.',
          ),
        provenance: PROVENANCE.nullable()
          .optional()
          .describe(`${PROVENANCE_FIELD} Pass null to clear.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ hypothesisId, statement, label, status, questionId, position, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findHypothesis(project, hypothesisId);
      if (!found) return notFound('Hypothesis', hypothesisId, project);
      if (questionId && !questionExists(project, questionId)) {
        return notFound('Question', questionId, project);
      }
      const { study, hypothesis } = found;

      const changed: string[] = [];
      if (statement !== undefined) {
        hypothesis.statement = statement;
        changed.push('statement');
      }
      if (label !== undefined) {
        hypothesis.label = label;
        changed.push('label');
      }
      if (status !== undefined) {
        hypothesis.status = status as HypothesisStatus;
        changed.push('status');
      }
      if (questionId !== undefined) {
        hypothesis.questionId = questionId;
        changed.push(questionId === null ? 'unlinked question' : 'questionId');
      }
      if (provenance !== undefined) {
        if (provenance === null) delete hypothesis.provenance;
        else hypothesis.provenance = provenance;
        changed.push('provenance');
      }
      if (position !== undefined) {
        moveChainTo(study, hypothesis.id, position);
        changed.push('position');
      }

      if (changed.length === 0) {
        return ok(project, 'No fields provided to update.', { changed: [] });
      }

      const now = new Date().toISOString();
      hypothesis.updatedAt = now;
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(project, `Updated hypothesis ${hypothesisId} — changed: ${changed.join(', ')}.`, {
        changed,
        studyId: study.id,
      });
    }
  );

  // --- journal_supersede_hypothesis ---
  server.registerTool(
    'journal_supersede_hypothesis',
    {
      title: 'Supersede Hypothesis',
      description:
        'Replaces a hypothesis with a revised version in ONE call: creates the new hypothesis ' +
        'carrying the old one\'s label and question forward, marks the old one superseded, and ' +
        'points it at the new one. Pass `rationale` and the reason is recorded as a settled ' +
        'decision on the same study, which is what makes the chain self-documenting. ' +
        'Always prefer this over add + update — a half-finished two-step revision leaves two ' +
        'active claims and no history.',
      inputSchema: z.object({
        hypothesisId: z.string().describe('The hypothesis being replaced'),
        newStatement: z.string().min(1).describe(`The revised hypothesis. ${STUDY_FIELD.statement}`),
        rationale: z
          .string()
          .optional()
          .describe(
            'WHY it was revised — what you learned that the earlier statement got wrong. ' +
              'Recorded as a settled decision on the study, and it is what makes the revision ' +
              'chain readable later; a chain of statements with no reasons between them says ' +
              'that you changed your mind but not what changed it.',
          ),
        provenance: PROVENANCE.optional().describe(
          'Normally OMIT this: the new version carries the old one\'s provenance forward, ' +
            'because revising a claim does not change who had the idea. Pass it only when the ' +
            'revision is substantial enough that the claim now originates with someone else. ' +
            PROVENANCE_FIELD,
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ hypothesisId, newStatement, rationale, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findHypothesis(project, hypothesisId);
      if (!found) return notFound('Hypothesis', hypothesisId, project);
      const { study, hypothesis } = found;

      if (hypothesis.supersededBy) {
        return err(
          `Hypothesis ${hypothesisId} was already superseded by ${hypothesis.supersededBy}. ` +
            'Supersede the newest hypothesis in the chain instead — call journal_get_study to see it.',
          project,
        );
      }

      const now = new Date().toISOString();
      const replacement: Hypothesis = {
        id: randomUUID(),
        // Carried forward: the claim was revised, not renumbered or refiled.
        label: hypothesis.label,
        statement: newStatement,
        status: 'active',
        supersededBy: null,
        questionId: hypothesis.questionId,
        // Carried forward unless explicitly overridden — see the input description.
        ...((provenance ?? hypothesis.provenance)
          ? { provenance: provenance ?? hypothesis.provenance }
          : {}),
        createdAt: now,
        updatedAt: now,
      };

      hypothesis.status = 'superseded';
      hypothesis.supersededBy = replacement.id;
      hypothesis.updatedAt = now;

      // Insert directly after the row it replaces, so the array order reads as
      // the chain does rather than scattering revisions to the end.
      study.hypotheses.splice(study.hypotheses.indexOf(hypothesis) + 1, 0, replacement);

      let decisionId: string | null = null;
      if (rationale) {
        const decision: Decision = {
          id: randomUUID(),
          decision: `Revised ${hypothesis.label ?? 'hypothesis'}: ${newStatement}`,
          alternativesRejected: hypothesis.statement,
          rationale,
          status: 'settled',
          supersededBy: null,
          // Points at the NEW hypothesis — the decision is about what now stands.
          hypothesisId: replacement.id,
          createdAt: now,
          updatedAt: now,
        };
        study.decisions.push(decision);
        decisionId = decision.id;
      }

      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Superseded ${hypothesis.label ?? 'hypothesis'} in "${study.title}".\n\n` +
          `Was:\n> ${hypothesis.statement}\n\nNow (${replacement.id}):\n> ${newStatement}` +
          (rationale ? `\n\nRationale recorded as decision ${decisionId}:\n> ${rationale}` : ''),
        {
          studyId: study.id,
          supersededHypothesisId: hypothesis.id,
          newHypothesisId: replacement.id,
          decisionId,
        },
      );
    }
  );

  // --- journal_delete_hypothesis ---
  server.registerTool(
    'journal_delete_hypothesis',
    {
      title: 'Delete Hypothesis',
      description:
        'Permanently removes a hypothesis. Any chain pointer or decision aimed at it is ' +
        'cleared rather than left dangling, so deleting a link in a revision chain breaks the ' +
        'chain there. To retire a claim while keeping its history, set status=retired with ' +
        'journal_update_hypothesis instead. This is irreversible.',
      inputSchema: z.object({
        hypothesisId: z.string().describe('The hypothesis ID to delete'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ hypothesisId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findHypothesis(project, hypothesisId);
      if (!found) return notFound('Hypothesis', hypothesisId, project);
      const { study, hypothesis } = found;

      study.hypotheses = study.hypotheses.filter((h) => h.id !== hypothesisId);
      pruneConnectionsTo(project, new Set([hypothesisId]));
      // Mirrors ON DELETE SET NULL on both foreign keys that can name it.
      let cleared = 0;
      for (const h of study.hypotheses) {
        if (h.supersededBy === hypothesisId) {
          h.supersededBy = null;
          cleared++;
        }
      }
      for (const d of study.decisions) {
        if (d.hypothesisId === hypothesisId) {
          d.hypothesisId = null;
          cleared++;
        }
      }

      study.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Deleted ${hypothesis.label ?? 'hypothesis'} from "${study.title}":\n\n` +
          `> ${hypothesis.statement}` +
          (cleared > 0 ? `\n\nCleared ${cleared} reference(s) that pointed at it.` : ''),
        { deletedHypothesisId: hypothesisId, studyId: study.id, clearedReferences: cleared },
      );
    }
  );

  // --- journal_add_decision ---
  server.registerTool(
    'journal_add_decision',
    {
      title: 'Add Decision',
      description:
        'Records a design decision on a study — what was chosen, what was not, and WHY. ' +
        "Leave status at 'open' for something still undecided; journal_get_open_decisions is " +
        'the "what have I not settled yet" list. Returns the new ID. ' +
        'Those are three fields with three jobs — do not write all three into `decision`. ' +
        FIELD_DISCIPLINE,
      inputSchema: z.object({
        studyId: z.string().describe('The study this decision belongs to'),
        decision: z.string().min(1).describe(STUDY_FIELD.decision),
        rationale: z.string().nullable().default(null).describe(STUDY_FIELD.rationale),
        alternativesRejected: z
          .string()
          .nullable()
          .default(null)
          .describe(STUDY_FIELD.alternativesRejected),
        status: DECISION_STATUS.default('open').describe('Decision status'),
        hypothesisId: z
          .string()
          .nullable()
          .default(null)
          .describe('Set when the decision concerns one hypothesis rather than the study at large'),
        designItemId: z.string().nullable().default(null).describe(DESIGN_ITEM_ID_FIELD),
        provenance: PROVENANCE.optional().describe(PROVENANCE_FIELD),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, decision, rationale, alternativesRejected, status, hypothesisId, designItemId, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);
      if (hypothesisId && !study.hypotheses.some((h) => h.id === hypothesisId)) {
        return notFound('Hypothesis', hypothesisId, project);
      }
      const itemError = checkDecisionItem(study, designItemId);
      if (itemError) return err(itemError, project);

      const now = new Date().toISOString();
      const row: Decision = {
        id: randomUUID(),
        decision,
        alternativesRejected,
        rationale,
        status: status as DecisionStatus,
        supersededBy: null,
        hypothesisId,
        ...(designItemId ? { designItemId } : {}),
        ...(provenance ? { provenance } : {}),
        createdAt: now,
        updatedAt: now,
      };
      study.decisions.push(row);
      // Recorded as already settled: its item settles too, as if settled later.
      if (row.status === 'settled' && designItemId) {
        Object.assign(study, withDecisionSettled(study, row.id, {}, now) ?? {});
      }
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(project, `Recorded ${status} decision on "${study.title}" (${row.id}):\n\n> ${decision}`, {
        decisionId: row.id,
        studyId,
      });
    }
  );

  // --- journal_update_decision ---
  server.registerTool(
    'journal_update_decision',
    {
      title: 'Update Decision',
      description:
        'Edits a decision in place — typically to settle an open one by adding the rationale ' +
        "and setting status='settled'. Settling a decision attached to a design item settles the " +
        'item once nothing else is open on it; pass `fillItemField` to also write the decision ' +
        'text (what was chosen) into one of the item\'s fields. To REVERSE a settled decision use ' +
        'journal_supersede_decision, which keeps the reversal on the record.',
      inputSchema: z.object({
        decisionId: z.string().describe('The decision ID'),
        decision: z.string().min(1).optional().describe(STUDY_FIELD.decision),
        rationale: z.string().nullable().optional().describe(STUDY_FIELD.rationale),
        alternativesRejected: z
          .string()
          .nullable()
          .optional()
          .describe(STUDY_FIELD.alternativesRejected),
        status: DECISION_STATUS.optional().describe('New status'),
        hypothesisId: z
          .string()
          .nullable()
          .optional()
          .describe('New linked hypothesis, or null to unlink'),
        designItemId: z.string().nullable().optional().describe(`${DESIGN_ITEM_ID_FIELD} null detaches it.`),
        fillItemField: z
          .enum(['text', 'name', 'population', 'proficiency', 'languages', 'inclusion', 'exclusion', 'targetN', 'measures', 'scoring', 'minutes'])
          .optional()
          .describe(
            "Only with status='settled' on a decision attached to a design item: write the decision " +
              'text into this field of the item (a number field takes a number). Say what was chosen ' +
              'in `decision`, e.g. "24", for targetN.',
          ),
        provenance: PROVENANCE.nullable()
          .optional()
          .describe(`${PROVENANCE_FIELD} Pass null to clear.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ decisionId, decision, rationale, alternativesRejected, status, hypothesisId, designItemId, fillItemField, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDecision(project, decisionId);
      if (!found) return notFound('Decision', decisionId, project);
      const { study, decision: row } = found;
      if (hypothesisId && !study.hypotheses.some((h) => h.id === hypothesisId)) {
        return notFound('Hypothesis', hypothesisId, project);
      }
      const itemError = checkDecisionItem(study, designItemId);
      if (itemError) return err(itemError, project);
      if (fillItemField && status !== 'settled') {
        return err("fillItemField only applies when settling — pass status='settled' too.", project);
      }

      const changed: string[] = [];
      if (decision !== undefined) {
        row.decision = decision;
        changed.push('decision');
      }
      if (rationale !== undefined) {
        row.rationale = rationale;
        changed.push('rationale');
      }
      if (alternativesRejected !== undefined) {
        row.alternativesRejected = alternativesRejected;
        changed.push('alternativesRejected');
      }
      if (status !== undefined) {
        row.status = status as DecisionStatus;
        changed.push('status');
      }
      if (hypothesisId !== undefined) {
        row.hypothesisId = hypothesisId;
        changed.push(hypothesisId === null ? 'unlinked hypothesis' : 'hypothesisId');
      }
      if (designItemId !== undefined) {
        if (designItemId === null) delete row.designItemId;
        else row.designItemId = designItemId;
        changed.push(designItemId === null ? 'detached design item' : 'designItemId');
      }
      if (provenance !== undefined) {
        if (provenance === null) delete row.provenance;
        else row.provenance = provenance;
        changed.push('provenance');
      }

      if (changed.length === 0) {
        return ok(project, 'No fields provided to update.', { changed: [] });
      }

      const now = new Date().toISOString();
      row.updatedAt = now;
      if (status === 'settled' && row.designItemId) {
        const item = (study.designItems ?? []).find((d) => d.id === row.designItemId);
        if (fillItemField && item && !fillableFields(item.kind).includes(fillItemField)) {
          return err(`A ${item.kind} has no ${fillItemField}. It takes: ${fillableFields(item.kind).join(', ')}.`, project);
        }
        const settled = withDecisionSettled(study, row.id, { fillField: fillItemField }, now);
        if (!settled) return err(`Couldn't write "${row.decision}" into ${fillItemField} — it takes a number.`, project);
        Object.assign(study, settled);
        changed.push('design item settled');
      } else if (fillItemField) {
        return err('fillItemField needs a decision attached to a design item.', project);
      }
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(project, `Updated decision ${decisionId} — changed: ${changed.join(', ')}.`, {
        changed,
        studyId: study.id,
      });
    }
  );

  // --- journal_supersede_decision ---
  server.registerTool(
    'journal_supersede_decision',
    {
      title: 'Supersede Decision',
      description:
        'Reverses a decision in ONE call: records the new decision, marks the old one ' +
        'superseded, and points it at the replacement. The old decision becomes the rejected ' +
        'alternative unless you pass your own. Use this rather than editing in place — ' +
        'the reversal and its reason are the record worth keeping.',
      inputSchema: z.object({
        decisionId: z.string().describe('The decision being reversed'),
        newDecision: z.string().min(1).describe(`What is being decided instead. ${STUDY_FIELD.decision}`),
        rationale: z
          .string()
          .optional()
          .describe(
            'WHY the earlier decision was reversed — what you learned that made it wrong. This ' +
              'is the reason the reversal is worth recording at all; without it the chain shows ' +
              'that you changed course but not what changed it.',
          ),
        alternativesRejected: z
          .string()
          .optional()
          .describe(
            'What was rejected in making this call. Defaults to the superseded decision text, ' +
              'which is usually right — the thing you just moved away from is the alternative.',
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ decisionId, newDecision, rationale, alternativesRejected }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDecision(project, decisionId);
      if (!found) return notFound('Decision', decisionId, project);
      const { study, decision: previous } = found;

      if (previous.supersededBy) {
        return err(
          `Decision ${decisionId} was already superseded by ${previous.supersededBy}. ` +
            'Supersede the newest decision in the chain instead — call journal_get_study to see it.',
          project,
        );
      }

      const now = new Date().toISOString();
      const replacement: Decision = {
        id: randomUUID(),
        decision: newDecision,
        alternativesRejected: alternativesRejected ?? previous.decision,
        rationale: rationale ?? null,
        status: 'settled',
        supersededBy: null,
        hypothesisId: previous.hypothesisId,
        ...(previous.designItemId ? { designItemId: previous.designItemId } : {}),
        createdAt: now,
        updatedAt: now,
      };

      previous.status = 'superseded';
      previous.supersededBy = replacement.id;
      previous.updatedAt = now;

      study.decisions.splice(study.decisions.indexOf(previous) + 1, 0, replacement);
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Superseded a decision on "${study.title}".\n\n` +
          `Was:\n> ${previous.decision}\n\nNow (${replacement.id}):\n> ${newDecision}` +
          (rationale ? `\n\nBecause:\n> ${rationale}` : ''),
        {
          studyId: study.id,
          supersededDecisionId: previous.id,
          newDecisionId: replacement.id,
        },
      );
    }
  );

  // --- journal_get_open_decisions ---
  server.registerTool(
    'journal_get_open_decisions',
    {
      title: 'Get Open Decisions',
      description:
        'Every decision still open — the "what have I not settled yet" list. Scoped to one ' +
        'study when studyId is given, otherwise across every study in the active project.',
      inputSchema: z.object({
        studyId: z.string().optional().describe('Limit to one study'),
        provenance: PROVENANCE.optional().describe(
          'Only decisions with this provenance. Unrecorded ones are never matched.',
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ studyId, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { decisions: [] });
      if (studyId && !findStudy(project, studyId)) {
        return notFound('Study', studyId, project);
      }

      const decisions = studiesOf(project)
        .filter((s) => !studyId || s.id === studyId)
        .flatMap((s) =>
          s.decisions
            .filter((d) => d.status === 'open')
            .filter((d) => !provenance || d.provenance === provenance)
            .map((d) => {
              const item = d.designItemId ? (s.designItems ?? []).find((i) => i.id === d.designItemId) : undefined;
              return {
                ...d,
                studyId: s.id,
                studyTitle: s.title,
                ...(item ? { designItem: designItemLabel(item) } : {}),
              };
            }),
        );

      if (decisions.length === 0) {
        return ok(
          project,
          studyId ? 'Nothing open on that study.' : 'No open decisions.',
          { decisions: [] },
        );
      }

      return ok(
        project,
        `${decisions.length} open decision(s):\n\n${JSON.stringify(decisions, null, 2)}`,
        { decisions },
      );
    }
  );

  // --- journal_delete_decision ---
  server.registerTool(
    'journal_delete_decision',
    {
      title: 'Delete Decision',
      description:
        'Permanently removes a decision. Any chain pointer aimed at it is cleared rather than ' +
        'left dangling. This is irreversible.',
      inputSchema: z.object({
        decisionId: z.string().describe('The decision ID to delete'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ decisionId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDecision(project, decisionId);
      if (!found) return notFound('Decision', decisionId, project);
      const { study, decision: removed } = found;

      study.decisions = study.decisions.filter((d) => d.id !== decisionId);
      let cleared = 0;
      for (const d of study.decisions) {
        if (d.supersededBy === decisionId) {
          d.supersededBy = null;
          cleared++;
        }
      }

      study.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Deleted decision from "${study.title}":\n\n> ${removed.decision}` +
          (cleared > 0 ? `\n\nCleared ${cleared} reference(s) that pointed at it.` : ''),
        { deletedDecisionId: decisionId, studyId: study.id, clearedReferences: cleared },
      );
    }
  );

  // --- journal_get_hypothesis_chain ---
  server.registerTool(
    'journal_get_hypothesis_chain',
    {
      title: 'Get Hypothesis Revision Chain',
      description:
        'The full revision history of one hypothesis, oldest to newest. Each version carries ' +
        '`revisedBecause` — why it replaced the one before it, null on the first. Accepts any ' +
        'hypothesis in the chain and walks to both ends. This is how you read what a claim ' +
        'used to say and why it changed.',
      inputSchema: z.object({
        hypothesisId: z.string().describe('Any hypothesis in the chain'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ hypothesisId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findHypothesis(project, hypothesisId);
      if (!found) return notFound('Hypothesis', hypothesisId, project);
      const { study, hypothesis } = found;

      // Walk back to the head first — the caller may be holding any link.
      let head = hypothesis;
      const seen = new Set([head.id]);
      for (;;) {
        const prior = study.hypotheses.find((h) => h.supersededBy === head.id);
        if (!prior || seen.has(prior.id)) break;
        seen.add(prior.id);
        head = prior;
      }

      const chain = chainFrom(study.hypotheses, head).map((h, i) => ({
        version: i + 1,
        id: h.id,
        statement: h.statement,
        status: h.status,
        updatedAt: h.updatedAt,
        // Why THIS version replaced the one before it. supersedeHypothesis
        // files the rationale against the new row, so the decision pointing at
        // h is the reason h exists. Null on v1, which replaced nothing.
        revisedBecause:
          study.decisions.find((d) => d.hypothesisId === h.id && d.rationale)?.rationale ?? null,
      }));

      return ok(
        project,
        `${chain.length} version(s) of ${head.label ?? 'this hypothesis'} in "${study.title}":\n\n` +
          JSON.stringify(chain, null, 2),
        { studyId: study.id, chain },
      );
    }
  );

  // --- journal_add_design_item ---
  server.registerTool(
    'journal_add_design_item',
    {
      title: 'Add Design Item',
      description:
        'Adds one piece of a study\'s design. `kind` is the section: framework, participants, ' +
        'material (stimuli such as a cue list), measure (one instrument), step (one procedure ' +
        'step with its minutes), variable, cleaning (response cleaning) or analysis. Framework, ' +
        'participants, cleaning and analysis hold one item each — add once, then update or ' +
        'revise it. The rest are lists, kept in the order added. ' +
        DESIGN_FIELDS_HELP +
        ' Returns the new item id. ' +
        FIELD_DISCIPLINE,
      inputSchema: z.object({
        studyId: z.string().describe('The study ID'),
        kind: DESIGN_KIND.describe('Which section this item belongs to'),
        fields: DESIGN_FIELDS_INPUT.describe(DESIGN_FIELDS_HELP),
        links: DESIGN_LINKS_INPUT.optional().describe(DESIGN_LINKS_HELP),
        status: DESIGN_STATUS.default('open').describe(
          "'settled' only when Nae has decided it; otherwise leave 'open'. An item with an open " +
            'question about it stays open.',
        ),
        provenance: PROVENANCE.optional().describe(PROVENANCE_FIELD),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, kind, fields, links, status, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);

      const stray = strayFieldKeys(kind, fields);
      if (stray.length > 0) {
        return err(
          `A ${kind} doesn't carry ${stray.join(', ')}. Its fields: ${DESIGN_FIELDS_BY_KIND[kind].join(', ')}.`,
          project,
        );
      }
      if (SINGLETON_KINDS.has(kind) && chainsOfKind(study, kind).length > 0) {
        const existing = chainsOfKind(study, kind)[0].current;
        return err(
          `"${study.title}" already has a ${kind} section (${existing.id}). Use ` +
            'journal_update_design_item to fill it in, or journal_revise_design_item to replace it with history.',
          project,
        );
      }
      const normalized = normalizeDesignFields(kind, fields);
      if (Object.keys(normalized).length === 0) {
        return err('Nothing to save — every field was empty.', project);
      }
      const linkError = checkDesignLinks(project, study, kind, links);
      if (linkError) return err(linkError, project);

      const now = new Date().toISOString();
      const item: DesignItem = {
        id: randomUUID(),
        kind,
        fields: normalized,
        status,
        supersededBy: null,
        ...(provenance ? { provenance } : {}),
        createdAt: now,
        updatedAt: now,
      };
      (study.designItems ??= []).push(item);
      applyDesignLinks(project, item.id, links);
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(project, `Added ${designItemLabel(item)} to "${study.title}" (${item.id}).`, {
        designItemId: item.id,
        studyId: study.id,
        item,
      });
    }
  );

  // --- journal_update_design_item ---
  server.registerTool(
    'journal_update_design_item',
    {
      title: 'Update Design Item',
      description:
        'Edits a design item in place, without adding to its history — for filling in, ' +
        'correcting, or setting status/links. `fields` is a patch: only keys given change, and ' +
        "'' or null clears one. Each links list given replaces that kind of link. When the " +
        'design itself changed (a different cue count, a step cut), use ' +
        'journal_revise_design_item instead so the earlier version and the reason are kept.',
      inputSchema: z.object({
        designItemId: z.string().describe('The design item ID'),
        fields: DESIGN_FIELDS_INPUT.optional().describe(DESIGN_FIELDS_HELP),
        links: DESIGN_LINKS_INPUT.optional().describe(DESIGN_LINKS_HELP),
        status: DESIGN_STATUS.optional().describe("'settled' or 'open'"),
        provenance: PROVENANCE.nullable().optional().describe(`${PROVENANCE_FIELD} Pass null to clear.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ designItemId, fields, links, status, provenance }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDesignItem(project, designItemId);
      if (!found) return notFound('Design item', designItemId, project);
      const { study, item } = found;

      if (item.supersededBy) {
        return err(
          `${designItemId} is an earlier version (replaced by ${item.supersededBy}). Update the current one.`,
          project,
        );
      }
      const stray = strayFieldKeys(item.kind, fields);
      if (stray.length > 0) {
        return err(
          `A ${item.kind} doesn't carry ${stray.join(', ')}. Its fields: ${DESIGN_FIELDS_BY_KIND[item.kind].join(', ')}.`,
          project,
        );
      }
      const linkError = checkDesignLinks(project, study, item.kind, links);
      if (linkError) return err(linkError, project);

      const changed: string[] = [];
      if (fields && Object.keys(fields).length > 0) {
        item.fields = mergeDesignFields(item.kind, item.fields, fields);
        changed.push('fields');
      }
      if (status !== undefined) {
        const open = openDecisionsOn(study, item.id);
        if (status === 'settled' && open.length > 0) {
          return err(
            `Can't settle ${designItemLabel(item)} while ${open.length} open decision(s) are attached ` +
              `(${open.map((d) => d.id).join(', ')}). Settle them with journal_update_decision.`,
            project,
          );
        }
        item.status = status;
        changed.push('status');
      }
      if (provenance !== undefined) {
        if (provenance === null) delete item.provenance;
        else item.provenance = provenance;
        changed.push('provenance');
      }
      if (links && Object.keys(links).length > 0) {
        applyDesignLinks(project, item.id, links);
        changed.push('links');
      }
      if (changed.length === 0) return ok(project, 'No fields provided to update.', { changed: [] });

      const now = new Date().toISOString();
      item.updatedAt = now;
      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(project, `Updated ${designItemLabel(item)} — changed: ${changed.join(', ')}.`, {
        changed,
        studyId: study.id,
        item,
      });
    }
  );

  // --- journal_revise_design_item ---
  server.registerTool(
    'journal_revise_design_item',
    {
      title: 'Revise Design Item',
      description:
        'Replaces a design item with a new version in ONE call, keeping the old one as history: ' +
        'the new version gets `fields` merged over the old ones, the old one is marked superseded ' +
        'and points at it, and its links move to the new version. Pass `rationale` and the reason ' +
        'is recorded as a settled decision on the new version. Use this when the design changed; ' +
        'use journal_update_design_item for corrections.',
      inputSchema: z.object({
        designItemId: z.string().describe('The current version being replaced'),
        fields: DESIGN_FIELDS_INPUT.describe(`What changes in the new version — merged over the old fields. ${DESIGN_FIELDS_HELP}`),
        rationale: z
          .string()
          .optional()
          .describe('WHY it changed. Recorded as a settled decision; it is what makes the history readable.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ designItemId, fields, rationale }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDesignItem(project, designItemId);
      if (!found) return notFound('Design item', designItemId, project);
      const { study, item } = found;

      if (item.supersededBy) {
        return err(
          `${designItemId} was already replaced by ${item.supersededBy}. Revise the newest version instead.`,
          project,
        );
      }
      const stray = strayFieldKeys(item.kind, fields);
      if (stray.length > 0) {
        return err(
          `A ${item.kind} doesn't carry ${stray.join(', ')}. Its fields: ${DESIGN_FIELDS_BY_KIND[item.kind].join(', ')}.`,
          project,
        );
      }

      const now = new Date().toISOString();
      const replacement: DesignItem = {
        id: randomUUID(),
        kind: item.kind,
        fields: mergeDesignFields(item.kind, item.fields, fields),
        status: 'open',
        supersededBy: null,
        ...(item.provenance ? { provenance: item.provenance } : {}),
        createdAt: now,
        updatedAt: now,
      };
      item.status = 'superseded';
      item.supersededBy = replacement.id;
      item.updatedAt = now;
      const items = (study.designItems ??= []);
      items.splice(items.indexOf(item) + 1, 0, replacement);

      const repointed = repointConnections(project.connections ?? [], item.id, replacement.id);
      if (repointed.length > 0) project.connections = repointed;
      // Open questions about the item follow it, like its links.
      study.decisions = moveOpenDecisions(study.decisions, item.id, replacement.id);

      let decisionId: string | null = null;
      if (rationale) {
        const decision: Decision = {
          id: randomUUID(),
          decision: `Revised ${designItemLabel(replacement)}`,
          alternativesRejected: designItemLabel(item),
          rationale,
          status: 'settled',
          supersededBy: null,
          hypothesisId: null,
          designItemId: replacement.id,
          createdAt: now,
          updatedAt: now,
        };
        study.decisions.push(decision);
        decisionId = decision.id;
      }

      study.updatedAt = now;
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Revised ${designItemLabel(item)} in "${study.title}".\n\nNow (${replacement.id}): ` +
          `${designItemLabel(replacement)}` +
          (rationale ? `\n\nRationale recorded as decision ${decisionId}:\n> ${rationale}` : ''),
        { studyId: study.id, supersededDesignItemId: item.id, newDesignItemId: replacement.id, decisionId },
      );
    }
  );

  // --- journal_delete_design_item ---
  server.registerTool(
    'journal_delete_design_item',
    {
      title: 'Delete Design Item',
      description:
        'Permanently removes a design item with every version in its history, the links on any ' +
        'version, and any decision\'s pointer at it (the decisions themselves stay). This is ' +
        'irreversible. To change what an item says, update or revise it instead.',
      inputSchema: z.object({
        designItemId: z.string().describe('Any version of the item to delete'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ designItemId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDesignItem(project, designItemId);
      if (!found) return notFound('Design item', designItemId, project);
      const { study } = found;

      const chain = designChains(study.designItems ?? []).find((c) =>
        c.history.some((d) => d.id === designItemId),
      );
      const ids = new Set(chain ? chain.history.map((d) => d.id) : [designItemId]);
      const label = chain ? designItemLabel(chain.current) : designItemLabel(found.item);

      study.designItems = (study.designItems ?? []).filter((d) => !ids.has(d.id));
      if (study.designItems.length === 0) delete study.designItems;
      const links = pruneConnectionsTo(project, ids);
      let cleared = 0;
      for (const d of study.decisions) {
        if (d.designItemId && ids.has(d.designItemId)) {
          delete d.designItemId;
          cleared++;
        }
      }

      study.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Deleted ${label} from "${study.title}" (${ids.size} version(s), ${links} link(s)).` +
          (cleared > 0 ? ` Cleared ${cleared} decision pointer(s).` : ''),
        { studyId: study.id, deletedIds: [...ids], deletedLinks: links, clearedDecisionPointers: cleared },
      );
    }
  );
}
