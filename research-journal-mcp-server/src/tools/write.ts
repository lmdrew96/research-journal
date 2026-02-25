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

  // --- journal_link_question ---
  server.registerTool(
    'journal_link_question',
    {
      title: 'Link/Unlink Article and Question',
      description:
        'Links or unlinks an article to a research question by updating the article\'s ' +
        'linkedQuestions array. Idempotent — linking an already-linked question or unlinking ' +
        'an already-unlinked question is a no-op.',
      inputSchema: z.object({
        articleId: z.string().describe('The article ID to update'),
        questionId: z.string().describe('The research question ID to link or unlink'),
        action: z.enum(['link', 'unlink']).describe('Whether to add or remove the connection'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ articleId, questionId, action }) => {
      const data = await readData();
      const article = data.library.find((a) => a.id === articleId);

      if (!article) {
        return {
          content: [{ type: 'text' as const, text: `Article not found: ${articleId}` }],
          isError: true,
        };
      }

      if (!data.questions[questionId]) {
        return {
          content: [{ type: 'text' as const, text: `Question not found: ${questionId}` }],
          isError: true,
        };
      }

      if (action === 'link') {
        if (!article.linkedQuestions.includes(questionId)) {
          article.linkedQuestions.push(questionId);
        }
      } else {
        article.linkedQuestions = article.linkedQuestions.filter((q) => q !== questionId);
      }

      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return {
        content: [
          {
            type: 'text' as const,
            text: `${action === 'link' ? 'Linked' : 'Unlinked'} "${article.title}" ` +
              `${action === 'link' ? 'to' : 'from'} question ${questionId}.\n\n` +
              `linkedQuestions: ${JSON.stringify(article.linkedQuestions)}`,
          },
        ],
      };
    }
  );
}