import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData, getActiveProject, getActiveProjectOrNull, type McpContext, liveThemes } from '../store.js';
import type { JournalEntry, Project } from '../../../src/types/index.js';
import { ok, okEmpty, notFound } from '../envelope.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) or with journal_add_project.';

function themeExists(project: Project, themeId: string): boolean {
  return liveThemes(project).some((t) => t.id === themeId);
}

function questionExists(project: Project, questionId: string): boolean {
  return liveThemes(project).some((t) => t.questions.some((q) => q.id === questionId));
}

/**
 * Journal entries carry optional links to a question and a theme. A link to
 * something that doesn't exist in this project is worse than no link — it is
 * invisible in the app and survives every later edit — so both are checked
 * before the write rather than stored optimistically.
 */
function validateLinks(
  project: Project,
  questionId: string | null | undefined,
  themeId: string | null | undefined,
): ReturnType<typeof notFound> | null {
  if (questionId && !questionExists(project, questionId)) {
    return notFound('Question', questionId, project);
  }
  if (themeId && !themeExists(project, themeId)) {
    return notFound('Theme', themeId, project);
  }
  return null;
}

/** Trim, drop blanks, de-duplicate — matches how the app's tag input behaves. */
function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function describe(entry: JournalEntry, project: Project) {
  const theme = liveThemes(project).find((t) => t.id === entry.themeId);
  let question: { id: string; q: string } | undefined;
  for (const t of liveThemes(project)) {
    const q = t.questions.find((q) => q.id === entry.questionId);
    if (q) {
      question = { id: q.id, q: q.q };
      break;
    }
  }
  return {
    ...entry,
    themeName: theme?.theme ?? null,
    questionText: question?.q ?? null,
  };
}

export function registerJournalTools(server: McpServer, ctx: McpContext): void {
  // --- journal_add_entry ---
  server.registerTool(
    'journal_add_entry',
    {
      title: 'Add Journal Entry',
      description:
        'Creates a free-form journal entry in the active project — the right home for an ' +
        'observation, reflection, or cross-cutting thought that is not tied to a specific paper. ' +
        'Use this rather than attaching an excerpt to a placeholder article. ' +
        'Content is markdown. Optionally links to one research question and one theme.',
      inputSchema: z.object({
        content: z.string().min(1).describe('The entry body, in markdown'),
        questionId: z
          .string()
          .nullable()
          .default(null)
          .describe('Research question to link this entry to (optional)'),
        themeId: z
          .string()
          .nullable()
          .default(null)
          .describe('Theme to link this entry to (optional)'),
        tags: z.array(z.string()).default([]).describe('Tags for the entry'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ content, questionId, themeId, tags }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);

      const invalid = validateLinks(project, questionId, themeId);
      if (invalid) return invalid;

      const now = new Date().toISOString();
      const entry: JournalEntry = {
        id: randomUUID(),
        content,
        createdAt: now,
        updatedAt: now,
        questionId: questionId ?? null,
        themeId: themeId ?? null,
        tags: normalizeTags(tags),
      };

      // Prepend, matching addJournalEntry in useUserData — project.journal is
      // newest-first, and the app's Journal view renders it in array order.
      project.journal.unshift(entry);
      await writeData(ctx.userId, data);

      return ok(
        project,
        `Added journal entry (ID: ${entry.id}).` +
          (entry.tags.length > 0 ? `\nTags: ${entry.tags.join(', ')}` : '') +
          `\n\n${content}`,
        { entryId: entry.id },
      );
    }
  );

  // --- journal_get_entries ---
  server.registerTool(
    'journal_get_entries',
    {
      title: 'Get Journal Entries',
      description:
        'Returns journal entries from the active project, newest first. ' +
        'Optionally filtered by linked question, linked theme, or tag.',
      inputSchema: z.object({
        questionId: z.string().optional().describe('Only entries linked to this question'),
        themeId: z.string().optional().describe('Only entries linked to this theme'),
        tag: z.string().optional().describe('Only entries carrying this tag'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum entries to return (default: all)'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ questionId, themeId, tag, limit }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { entries: [] });

      let entries = [...project.journal].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );

      if (questionId) entries = entries.filter((e) => e.questionId === questionId);
      if (themeId) entries = entries.filter((e) => e.themeId === themeId);
      if (tag) entries = entries.filter((e) => e.tags.includes(tag));

      const total = entries.length;
      if (limit !== undefined) entries = entries.slice(0, limit);

      const described = entries.map((e) => describe(e, project));

      if (total === 0) {
        return ok(project, 'No journal entries match.', { entries: [], total: 0 });
      }

      return ok(
        project,
        `${total} entr${total === 1 ? 'y' : 'ies'}` +
          (limit !== undefined && total > entries.length ? ` (showing ${entries.length})` : '') +
          `:\n\n${JSON.stringify(described, null, 2)}`,
        { entries: described, total },
      );
    }
  );

  // --- journal_update_entry ---
  server.registerTool(
    'journal_update_entry',
    {
      title: 'Update Journal Entry',
      description:
        'Updates an existing journal entry. Only provided fields change. ' +
        'Pass null for questionId or themeId to remove that link; omit them to leave as-is. ' +
        'Tags replace the existing array.',
      inputSchema: z.object({
        id: z.string().describe('The journal entry ID'),
        content: z.string().min(1).optional().describe('Replacement content (markdown)'),
        questionId: z
          .string()
          .nullable()
          .optional()
          .describe('New linked question, or null to unlink'),
        themeId: z.string().nullable().optional().describe('New linked theme, or null to unlink'),
        tags: z.array(z.string()).optional().describe('Replacement tags array'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ id, content, questionId, themeId, tags }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);

      const entry = project.journal.find((e) => e.id === id);
      if (!entry) return notFound('Journal entry', id, project);

      const invalid = validateLinks(project, questionId, themeId);
      if (invalid) return invalid;

      const changed: string[] = [];
      if (content !== undefined) {
        entry.content = content;
        changed.push('content');
      }
      // undefined means "not provided"; null means "unlink" — both are meaningful.
      if (questionId !== undefined) {
        entry.questionId = questionId;
        changed.push(questionId === null ? 'unlinked question' : 'questionId');
      }
      if (themeId !== undefined) {
        entry.themeId = themeId;
        changed.push(themeId === null ? 'unlinked theme' : 'themeId');
      }
      if (tags !== undefined) {
        entry.tags = normalizeTags(tags);
        changed.push('tags');
      }

      if (changed.length === 0) {
        return ok(project, 'No fields provided to update.', { changed: [] });
      }

      entry.updatedAt = new Date().toISOString();
      await writeData(ctx.userId, data);

      return ok(project, `Updated journal entry ${id} — changed: ${changed.join(', ')}.`, {
        changed,
      });
    }
  );

  // --- journal_delete_entry ---
  server.registerTool(
    'journal_delete_entry',
    {
      title: 'Delete Journal Entry',
      description: 'Permanently removes a journal entry by ID. This is irreversible.',
      inputSchema: z.object({
        id: z.string().describe('The journal entry ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ id }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);

      const index = project.journal.findIndex((e) => e.id === id);
      if (index === -1) return notFound('Journal entry', id, project);

      const [removed] = project.journal.splice(index, 1);
      await writeData(ctx.userId, data);

      const preview =
        removed.content.length > 100 ? `${removed.content.slice(0, 100)}...` : removed.content;
      return ok(project, `Deleted journal entry ${id}:\n\n> ${preview}`, { deletedId: id });
    }
  );
}
