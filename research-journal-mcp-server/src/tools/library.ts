import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData } from '../dataStore.js';

export function registerLibraryTools(server: McpServer): void {
  // --- journal_get_library ---
  server.registerTool(
    'journal_get_library',
    {
      title: 'Get Library',
      description:
        'Returns all saved articles with title, authors, year, tags, status, and excerpt count. ' +
        'Supports optional filtering by article status (to-read, reading, done, key-source) ' +
        'and by theme ID (returns only articles linked to questions in that theme).',
      inputSchema: z.object({
        status: z
          .enum(['to-read', 'reading', 'done', 'key-source'])
          .optional()
          .describe('Filter articles by status'),
        theme: z
          .string()
          .optional()
          .describe('Filter articles linked to questions belonging to this theme ID'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ status, theme }) => {
      const data = await readData();
      let articles = data.library;

      if (status) {
        articles = articles.filter((a) => a.status === status);
      }

      if (theme) {
        const themeObj = data.themes.find((t) => t.id === theme);
        if (themeObj) {
          const questionIds = new Set(themeObj.questions.map((q) => q.id));
          articles = articles.filter((a) =>
            a.linkedQuestions.some((qid) => questionIds.has(qid))
          );
        } else {
          articles = [];
        }
      }

      const summary = articles.map((a) => ({
        id: a.id,
        title: a.title,
        authors: a.authors,
        year: a.year,
        tags: a.tags,
        status: a.status,
        excerptCount: a.excerpts.length,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  // --- journal_get_article ---
  server.registerTool(
    'journal_get_article',
    {
      title: 'Get Article Details',
      description:
        'Returns full details of a single article by ID, including all excerpts, ' +
        'notes, linked questions, AI summary, and metadata.',
      inputSchema: z.object({
        id: z.string().describe('The article ID'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id }) => {
      const data = await readData();
      const article = data.library.find((a) => a.id === id);

      if (!article) {
        return {
          content: [{ type: 'text' as const, text: `Article not found: ${id}` }],
          isError: true,
        };
      }

      // Resolve linked question text for context
      const linkedDetails = article.linkedQuestions.map((qid) => {
        for (const theme of data.themes) {
          const q = theme.questions.find((q) => q.id === qid);
          if (q) return { id: qid, question: q.q, theme: theme.theme };
        }
        return { id: qid, question: '(unknown)', theme: '(unknown)' };
      });

      const result = {
        ...article,
        linkedQuestionDetails: linkedDetails,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
