import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull } from '../dataStore.js';
import { ok, okEmpty } from './envelope.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) to get started.';

export function registerMetaTools(server: McpServer): void {
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
      const data = await readData();
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { themes: [] });
      const themes = project.themes.map((t) => ({
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
      const data = await readData();
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { questions: [] });
      const questions = project.themes.flatMap((theme) =>
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
