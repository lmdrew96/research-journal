import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData, getActiveProject, getActiveProjectOrNull, liveThemes, type McpContext } from '../store.js';
import type { Project, Provenance, Thought } from '../../../src/types/index.js';
import { ok, okEmpty, err, notFound } from '../envelope.js';

/**
 * Thoughts — the Reframe: ThreadNotes is where research chats land.
 *
 * The loop is Marginalia (read) → chat with Coru (think) → harvest → here.
 * Coru offers the harvest at the end of a research chat; Nae keeps or tosses
 * each thought; only what she keeps is saved. Every thought carries who it
 * came from, which is what keeps her thesis thinking hers.
 */

const PROVENANCE = z.enum(['nae', 'coru', 'convergent', 'external']);

const ORIGIN_FIELD =
  "Who the thought CAME FROM — not who typed it. 'nae' (her idea), 'coru' (yours, which she " +
  "chose to keep), 'convergent' (you both got there independently) or 'external' (a paper, a " +
  'professor, someone else). This label is the point of saving it: get it right, and ask her ' +
  'when you are unsure rather than guessing.';

const TEXT_FIELD =
  'The thought itself, in her words where they were hers. Markdown. One idea per thought — ' +
  'two ideas are two thoughts.';

const LINK_FIELDS = {
  articleIds: z
    .array(z.string())
    .optional()
    .describe('Library articles (Sources) it is about — ids from journal_get_library'),
  questionIds: z
    .array(z.string())
    .optional()
    .describe('Questions (shown as Threads in the app) it belongs to — ids from journal_get_questions'),
  studyId: z.string().nullable().optional().describe('The study it bears on, if any'),
};

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) or with journal_add_project.';

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Ids that don't exist in this project, by kind — for an error that names them. */
function badLinks(
  project: Project,
  links: { articleIds?: string[]; questionIds?: string[]; studyId?: string | null },
): string[] {
  const questions = new Set(liveThemes(project).flatMap((t) => t.questions.map((q) => q.id)));
  const out: string[] = [];
  for (const id of links.articleIds ?? []) {
    if (!project.library.some((a) => a.id === id)) out.push(`article ${id}`);
  }
  for (const id of links.questionIds ?? []) {
    if (!questions.has(id)) out.push(`question ${id}`);
  }
  if (links.studyId && !(project.studies ?? []).some((s) => s.id === links.studyId)) {
    out.push(`study ${links.studyId}`);
  }
  return out;
}

/** A thought with its links named, so Coru reads titles rather than ids. */
function describeThought(project: Project, t: Thought) {
  const questionText = new Map(liveThemes(project).flatMap((th) => th.questions.map((q) => [q.id, q.q] as const)));
  return {
    ...t,
    provenance: t.provenance ?? null,
    articles: t.articleIds
      .map((id) => project.library.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ id: a.id, title: a.title })),
    questions: t.questionIds
      .filter((id) => questionText.has(id))
      .map((id) => ({ id, question: questionText.get(id)! })),
    study: t.studyId ? (project.studies ?? []).find((s) => s.id === t.studyId)?.title ?? null : null,
  };
}

export function registerThoughtTools(server: McpServer, ctx: McpContext): void {
  // --- journal_harvest_thoughts ---
  server.registerTool(
    'journal_harvest_thoughts',
    {
      title: 'Harvest Thoughts',
      description:
        'Saves the thoughts Nae chose to KEEP at the end of a research chat — the harvest. Offer ' +
        'it yourself at the end of any chat about sources ("want me to harvest this?"); list the ' +
        'thoughts with who each came from; she keeps or tosses each one; call this once with only ' +
        'the kept ones. Never save a thought she did not keep, and never call this without having ' +
        'offered. Every thought needs `provenance`. Links are optional; link a thought to the ' +
        'sources and questions it is actually about. All-or-nothing: if any id is unknown, ' +
        'nothing is saved and the error says which.',
      inputSchema: z.object({
        thoughts: z
          .array(
            z.object({
              text: z.string().min(1).describe(TEXT_FIELD),
              provenance: PROVENANCE.describe(ORIGIN_FIELD),
              ...LINK_FIELDS,
            }),
          )
          .min(1)
          .max(50)
          .describe('The kept thoughts, in the order to show them (first is newest)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ thoughts }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);

      const problems = thoughts.flatMap((t, i) => badLinks(project, t).map((b) => `#${i + 1}: ${b}`));
      if (problems.length > 0) {
        return err(`Nothing saved — these links don't exist in "${project.name}": ${problems.join('; ')}.`, project);
      }

      const now = new Date().toISOString();
      const made: Thought[] = thoughts.map((t) => ({
        id: randomUUID(),
        text: t.text,
        provenance: t.provenance as Provenance,
        articleIds: [...new Set(t.articleIds ?? [])],
        questionIds: [...new Set(t.questionIds ?? [])],
        studyId: t.studyId ?? null,
        createdAt: now,
        updatedAt: now,
      }));
      // Newest first, like the app; the batch keeps its own order on top.
      project.thoughts = [...made, ...(project.thoughts ?? [])];
      await writeData(ctx.userId, data);

      const lines = made.map((t) => `- [${t.provenance}] ${clip(t.text)}`).join('\n');
      return ok(project, `Saved ${made.length} thought(s) to "${project.name}":\n\n${lines}`, {
        thoughtIds: made.map((t) => t.id),
      });
    },
  );

  // --- journal_get_thoughts ---
  server.registerTool(
    'journal_get_thoughts',
    {
      title: 'Get Thoughts',
      description:
        'Saved thoughts, newest first, each with who it came from and the sources, questions and ' +
        'study it is about (named, not just ids). Filter by a source, a question, a study, an ' +
        'origin, or text. Read these before saying what Nae thinks about something.',
      inputSchema: z.object({
        articleId: z.string().optional().describe('Only thoughts about this article'),
        questionId: z.string().optional().describe('Only thoughts in this question / thread'),
        studyId: z.string().optional().describe('Only thoughts bearing on this study'),
        provenance: PROVENANCE.optional().describe('Only thoughts with this origin'),
        query: z.string().optional().describe('Case-insensitive text match'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ articleId, questionId, studyId, provenance, query, limit }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { thoughts: [] });

      const needle = query?.trim().toLowerCase();
      const found = (project.thoughts ?? [])
        .filter((t) => !articleId || t.articleIds.includes(articleId))
        .filter((t) => !questionId || t.questionIds.includes(questionId))
        .filter((t) => !studyId || t.studyId === studyId)
        .filter((t) => !provenance || t.provenance === provenance)
        .filter((t) => !needle || t.text.toLowerCase().includes(needle))
        .slice(0, limit)
        .map((t) => describeThought(project, t));

      if (found.length === 0) return ok(project, 'No thoughts match.', { thoughts: [] });
      return ok(project, `${found.length} thought(s):\n\n${JSON.stringify(found, null, 2)}`, { thoughts: found });
    },
  );

  // --- journal_update_thought ---
  server.registerTool(
    'journal_update_thought',
    {
      title: 'Update Thought',
      description:
        'Edits a saved thought: its text, its origin, or what it links to. Only provided fields ' +
        'change; a links list replaces that list. Only when Nae asks.',
      inputSchema: z.object({
        thoughtId: z.string().describe('The thought ID'),
        text: z.string().min(1).optional().describe(TEXT_FIELD),
        provenance: PROVENANCE.nullable().optional().describe(`${ORIGIN_FIELD} Pass null to clear.`),
        ...LINK_FIELDS,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ thoughtId, text, provenance, articleIds, questionIds, studyId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const thought = (project.thoughts ?? []).find((t) => t.id === thoughtId);
      if (!thought) return notFound('Thought', thoughtId, project);

      const problems = badLinks(project, { articleIds, questionIds, studyId });
      if (problems.length > 0) return err(`Not saved — unknown: ${problems.join('; ')}.`, project);

      const changed: string[] = [];
      if (text !== undefined) { thought.text = text; changed.push('text'); }
      if (provenance !== undefined) {
        if (provenance === null) delete thought.provenance;
        else thought.provenance = provenance;
        changed.push('provenance');
      }
      if (articleIds !== undefined) { thought.articleIds = [...new Set(articleIds)]; changed.push('articleIds'); }
      if (questionIds !== undefined) { thought.questionIds = [...new Set(questionIds)]; changed.push('questionIds'); }
      if (studyId !== undefined) { thought.studyId = studyId; changed.push('studyId'); }
      if (changed.length === 0) return ok(project, 'No fields provided to update.', { changed: [] });

      thought.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);
      return ok(project, `Updated thought ${thoughtId} — changed: ${changed.join(', ')}.`, { changed });
    },
  );

  // --- journal_delete_thought ---
  server.registerTool(
    'journal_delete_thought',
    {
      title: 'Delete Thought',
      description: 'Permanently removes one saved thought. Only when Nae asks. This is irreversible.',
      inputSchema: z.object({ thoughtId: z.string().describe('The thought ID to delete') }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ thoughtId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const list = project.thoughts ?? [];
      const gone = list.find((t) => t.id === thoughtId);
      if (!gone) return notFound('Thought', thoughtId, project);

      const rest = list.filter((t) => t.id !== thoughtId);
      if (rest.length > 0) project.thoughts = rest;
      else delete project.thoughts;
      await writeData(ctx.userId, data);
      return ok(project, `Deleted thought:\n\n> ${clip(gone.text, 200)}`, { deletedThoughtId: thoughtId });
    },
  );
}
