import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull, type McpContext, liveThemes } from '../store.js';
import { ok, okEmpty } from '../envelope.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) to get started.';

export function registerMetaTools(server: McpServer, ctx: McpContext): void {
  // --- journal_get_themes ---
  server.registerTool(
    'journal_get_themes',
    {
      title: 'Get Research Themes',
      description:
        'Returns all research themes with their descriptions and which question IDs belong to each.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { themes: [] });
      const themes = liveThemes(project).map((t) => ({
        id: t.id,
        theme: t.theme,
        color: t.color,
        icon: t.icon,
        description: t.description,
        questionIds: t.questions.map((q) => q.id),
        questionCount: t.questions.length,
      }));

      return ok(project, JSON.stringify(themes, null, 2), { themes });
    }
  );

  // --- journal_get_questions ---
  server.registerTool(
    'journal_get_questions',
    {
      title: 'Get Research Questions',
      description:
        'Returns all research questions across all themes, with their status, ' +
        'starred state, notes, user sources, and search phrases.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { questions: [] });
      // Related-question ids are resolved to text here: an id alone is
      // unreadable, and the whole point of the link is to see what the other
      // question actually asks without a second call.
      const byId = new Map(
        liveThemes(project).flatMap((theme) =>
          theme.questions.map((q) => [q.id, { q, theme }] as const),
        ),
      );

      const questions = liveThemes(project).flatMap((theme) =>
        theme.questions.map((q) => {
          const userData = project.questions[q.id];
          return {
            id: q.id,
            question: q.q,
            why: q.why,
            appImplication: q.appImplication,
            tags: q.tags,
            themeId: theme.id,
            theme: theme.theme,
            sources: q.sources,
            relatedQuestions: (q.relatedQuestions ?? []).flatMap((rid) => {
              const hit = byId.get(rid);
              // A link into a soft-deleted theme resolves to nothing; drop it
              // from the read rather than showing a dangling id.
              return hit
                ? [{ id: rid, question: hit.q.q, theme: hit.theme.theme }]
                : [];
            }),
            // User data (may not exist yet for all questions)
            status: userData?.status ?? 'not_started',
            starred: userData?.starred ?? false,
            noteCount: userData?.notes?.length ?? 0,
            userSourceCount: userData?.userSources?.length ?? 0,
            searchPhrases: userData?.searchPhrases ?? [],
            notes: userData?.notes ?? [],
            userSources: userData?.userSources ?? [],
          };
        })
      );

      return ok(project, JSON.stringify(questions, null, 2), { questions });
    }
  );
}
