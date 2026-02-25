import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData } from '../dataStore.js';

export function registerWriteTools(server: McpServer): void {
  // --- journal_add_excerpt ---
  server.registerTool(
    'journal_add_excerpt',
    {
      title: 'Add Excerpt to Article',
      description:
        'Adds a new excerpt (quote + optional comment) to an existing article. ' +
        'Writes back to the data source (Neon database or JSON file).',
      inputSchema: z.object({
        articleId: z.string().describe('The article ID to add the excerpt to'),
        quote: z.string().min(1).describe('The quoted text from the article'),
        comment: z.string().default('').describe('Your comment or annotation on the quote'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ articleId, quote, comment }) => {
      const data = await readData();
      const article = data.library.find((a) => a.id === articleId);

      if (!article) {
        return {
          content: [{ type: 'text' as const, text: `Article not found: ${articleId}` }],
          isError: true,
        };
      }

      const excerpt = {
        id: randomUUID(),
        quote,
        comment,
        createdAt: new Date().toISOString(),
      };

      article.excerpts.push(excerpt);
      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Added excerpt to "${article.title}":\n\n> ${quote}${comment ? `\n\nComment: ${comment}` : ''}`,
          },
        ],
      };
    }
  );

  // --- journal_add_note ---
  server.registerTool(
    'journal_add_note',
    {
      title: 'Add Note to Article',
      description:
        'Appends text to an existing article\'s notes field. ' +
        'If the article already has notes, the new text is appended on a new line. ' +
        'Writes back to the data source (Neon database or JSON file).',
      inputSchema: z.object({
        articleId: z.string().describe('The article ID to add notes to'),
        text: z.string().min(1).describe('The note text to append'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ articleId, text }) => {
      const data = await readData();
      const article = data.library.find((a) => a.id === articleId);

      if (!article) {
        return {
          content: [{ type: 'text' as const, text: `Article not found: ${articleId}` }],
          isError: true,
        };
      }

      if (article.notes) {
        article.notes += '\n\n' + text;
      } else {
        article.notes = text;
      }

      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Added note to "${article.title}":\n\n${text}`,
          },
        ],
      };
    }
  );
}