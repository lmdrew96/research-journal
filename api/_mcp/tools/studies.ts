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
  Hypothesis,
  HypothesisStatus,
  Project,
  Study,
  StudyStatus,
} from '../../../src/types/index.js';
import { ok, okEmpty, err, notFound } from '../envelope.js';

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

/** Moves an item to `position`, clamped. Undefined leaves the order alone. */
function moveTo<T>(items: T[], item: T, position: number | undefined): void {
  if (position === undefined) return;
  const from = items.indexOf(item);
  if (from === -1) return;
  items.splice(from, 1);
  items.splice(Math.max(0, Math.min(position, items.length)), 0, item);
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

function summarize(study: Study) {
  return {
    id: study.id,
    title: study.title,
    status: study.status,
    description: study.description,
    activeHypotheses: study.hypotheses.filter((h) => h.status === 'active').length,
    openDecisions: study.decisions.filter((d) => d.status === 'open').length,
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
        'link to questions many-to-many. Variables, instruments and the analysis plan go in ' +
        '`design` as markdown prose; hypotheses and decisions are separate objects. ' +
        'Returns the new study ID.',
      inputSchema: z.object({
        title: z.string().min(1).describe('Study title'),
        description: z.string().default('').describe('Short framing'),
        design: z
          .string()
          .default('')
          .describe('Variables, instruments and analysis plan, as markdown'),
        status: STUDY_STATUS.default('planned').describe('Study status'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, description, design, status }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const now = new Date().toISOString();

      const study: Study = {
        id: randomUUID(),
        title,
        status: status as StudyStatus,
        description,
        design,
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
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ status }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { studies: [] });

      const studies = studiesOf(project)
        .filter((s) => !status || s.status === status)
        .map(summarize);

      if (studies.length === 0) {
        return ok(
          project,
          status
            ? `No studies with status "${status}".`
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
        'Full detail for one study: design prose, every hypothesis and decision (superseded ' +
        'ones included, each carrying the id of what replaced it), and linked questions with ' +
        'their text.',
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
        'wholesale. Hypotheses and decisions are edited with their own tools.',
      inputSchema: z.object({
        studyId: z.string().describe('The study ID'),
        title: z.string().min(1).optional().describe('Replacement title'),
        description: z.string().optional().describe('Replacement framing'),
        design: z.string().optional().describe('Replacement design prose (markdown)'),
        status: STUDY_STATUS.optional().describe('New status'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, title, description, design, status }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);

      const changed: string[] = [];
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
        'Permanently removes a study AND every hypothesis and decision on it. Linked ' +
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
        'adding a second hypothesis just leaves two active claims. Returns the new ID.',
      inputSchema: z.object({
        studyId: z.string().describe('The study this hypothesis belongs to'),
        statement: z.string().min(1).describe('The hypothesis itself'),
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
          .describe('Index to insert at; appends when omitted'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, statement, label, questionId, position }) => {
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
        createdAt: now,
        updatedAt: now,
      };
      study.hypotheses.push(hypothesis);
      moveTo(study.hypotheses, hypothesis, position);
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
        statement: z.string().min(1).optional().describe('Corrected statement'),
        label: z.string().nullable().optional().describe('New label, or null to clear'),
        status: HYPOTHESIS_STATUS.optional().describe('New status'),
        questionId: z
          .string()
          .nullable()
          .optional()
          .describe('New linked question, or null to unlink'),
        position: z.number().int().min(0).optional().describe('New index within the study'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ hypothesisId, statement, label, status, questionId, position }) => {
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
      if (position !== undefined) {
        moveTo(study.hypotheses, hypothesis, position);
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
        newStatement: z.string().min(1).describe('The revised hypothesis'),
        rationale: z
          .string()
          .optional()
          .describe('Why it was revised — recorded as a decision on the study'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ hypothesisId, newStatement, rationale }) => {
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
        'the "what have I not settled yet" list. Returns the new ID.',
      inputSchema: z.object({
        studyId: z.string().describe('The study this decision belongs to'),
        decision: z.string().min(1).describe('What was chosen, or the open question'),
        rationale: z.string().nullable().default(null).describe('Why — the field that matters'),
        alternativesRejected: z.string().nullable().default(null).describe('What was not chosen'),
        status: DECISION_STATUS.default('open').describe('Decision status'),
        hypothesisId: z
          .string()
          .nullable()
          .default(null)
          .describe('Set when the decision concerns one hypothesis rather than the study at large'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ studyId, decision, rationale, alternativesRejected, status, hypothesisId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const study = findStudy(project, studyId);
      if (!study) return notFound('Study', studyId, project);
      if (hypothesisId && !study.hypotheses.some((h) => h.id === hypothesisId)) {
        return notFound('Hypothesis', hypothesisId, project);
      }

      const now = new Date().toISOString();
      const row: Decision = {
        id: randomUUID(),
        decision,
        alternativesRejected,
        rationale,
        status: status as DecisionStatus,
        supersededBy: null,
        hypothesisId,
        createdAt: now,
        updatedAt: now,
      };
      study.decisions.push(row);
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
        "and setting status='settled'. To REVERSE a settled decision use " +
        'journal_supersede_decision, which keeps the reversal on the record.',
      inputSchema: z.object({
        decisionId: z.string().describe('The decision ID'),
        decision: z.string().min(1).optional().describe('Replacement decision text'),
        rationale: z.string().nullable().optional().describe('Replacement rationale'),
        alternativesRejected: z
          .string()
          .nullable()
          .optional()
          .describe('Replacement rejected alternatives'),
        status: DECISION_STATUS.optional().describe('New status'),
        hypothesisId: z
          .string()
          .nullable()
          .optional()
          .describe('New linked hypothesis, or null to unlink'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ decisionId, decision, rationale, alternativesRejected, status, hypothesisId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const found = findDecision(project, decisionId);
      if (!found) return notFound('Decision', decisionId, project);
      const { study, decision: row } = found;
      if (hypothesisId && !study.hypotheses.some((h) => h.id === hypothesisId)) {
        return notFound('Hypothesis', hypothesisId, project);
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

      if (changed.length === 0) {
        return ok(project, 'No fields provided to update.', { changed: [] });
      }

      const now = new Date().toISOString();
      row.updatedAt = now;
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
        newDecision: z.string().min(1).describe('What is being decided instead'),
        rationale: z.string().optional().describe('Why the earlier decision was reversed'),
        alternativesRejected: z
          .string()
          .optional()
          .describe('Defaults to the superseded decision text'),
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
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ studyId }) => {
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
            .map((d) => ({ ...d, studyId: s.id, studyTitle: s.title })),
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
}
