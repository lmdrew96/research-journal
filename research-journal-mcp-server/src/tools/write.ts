import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData, getActiveProject } from '../dataStore.js';
import type { ArticleStatus, QuestionStatus } from '../types.js';
import { ok, notFound } from './envelope.js';

export function registerWriteTools(server: McpServer): void {
  // --- journal_add_article ---
  server.registerTool(
    'journal_add_article',
    {
      title: 'Add Article to Library',
      description:
        'Creates a new article in the library. Accepts title, authors, year, abstract, ' +
        'URL/DOI, status (default: to-read), and tags. Returns the new article ID.',
      inputSchema: z.object({
        title: z.string().min(1).describe('Article title'),
        authors: z.array(z.string()).default([]).describe('List of author names'),
        year: z.number().nullable().default(null).describe('Publication year'),
        journal: z.string().nullable().default(null).describe('Journal or venue name'),
        doi: z.string().nullable().default(null).describe('DOI identifier'),
        url: z.string().nullable().default(null).describe('URL to the article'),
        abstract: z.string().nullable().default(null).describe('Article abstract'),
        status: z
          .enum(['to-read', 'reading', 'done', 'key-source'])
          .default('to-read')
          .describe('Reading status'),
        tags: z.array(z.string()).default([]).describe('Article tags'),
        isOpenAccess: z.boolean().default(false).describe('Whether the article is open access'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ title, authors, year, journal, doi, url, abstract, status, tags, isOpenAccess }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const now = new Date().toISOString();

      const article = {
        id: randomUUID(),
        title,
        authors,
        year,
        journal,
        doi,
        url,
        abstract,
        notes: '',
        excerpts: [],
        linkedQuestions: [],
        status: status as ArticleStatus,
        tags,
        aiSummary: null,
        isOpenAccess,
        savedAt: now,
        updatedAt: now,
      };

      project.library.push(article);
      await writeData(data);

      return ok(
        project,
        `Added article "${title}" (ID: ${article.id}) to library with status "${status}".`,
        { articleId: article.id },
      );
    }
  );

  // --- journal_update_article ---
  server.registerTool(
    'journal_update_article',
    {
      title: 'Update Article',
      description:
        'Updates fields on an existing article. Only provided fields are changed — ' +
        'omitted fields are left as-is. Use this to change status, fix metadata, update abstract, etc.',
      inputSchema: z.object({
        id: z.string().describe('The article ID to update'),
        title: z.string().optional().describe('New title'),
        authors: z.array(z.string()).optional().describe('New authors list'),
        year: z.number().nullable().optional().describe('New publication year'),
        journal: z.string().nullable().optional().describe('New journal/venue name'),
        doi: z.string().nullable().optional().describe('New DOI'),
        url: z.string().nullable().optional().describe('New URL'),
        abstract: z.string().nullable().optional().describe('New abstract'),
        status: z
          .enum(['to-read', 'reading', 'done', 'key-source'])
          .optional()
          .describe('New reading status'),
        tags: z.array(z.string()).optional().describe('New tags array (replaces existing)'),
        notes: z.string().optional().describe('Replace entire notes field'),
        isOpenAccess: z.boolean().optional().describe('Update open access flag'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ id, ...updates }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === id);

      if (!article) return notFound('Article', id, project);

      const changed: string[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (article as any)[key] = value;
          changed.push(key);
        }
      }

      if (changed.length === 0) {
        return ok(project, `No fields provided to update.`, { changed: [] });
      }

      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return ok(
        project,
        `Updated "${article.title}" — changed: ${changed.join(', ')}.`,
        { changed },
      );
    }
  );

  // --- journal_delete_article ---
  server.registerTool(
    'journal_delete_article',
    {
      title: 'Delete Article',
      description:
        'Permanently removes an article from the library by ID. This is irreversible.',
      inputSchema: z.object({
        id: z.string().describe('The article ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ id }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const index = project.library.findIndex((a) => a.id === id);

      if (index === -1) return notFound('Article', id, project);

      const title = project.library[index].title;
      project.library.splice(index, 1);
      await writeData(data);

      return ok(project, `Deleted article "${title}" (${id}).`, { deletedId: id });
    }
  );

  // --- journal_delete_excerpt ---
  server.registerTool(
    'journal_delete_excerpt',
    {
      title: 'Delete Excerpt',
      description:
        'Removes a specific excerpt from an article by excerpt ID. This is irreversible.',
      inputSchema: z.object({
        articleId: z.string().describe('The article ID containing the excerpt'),
        excerptId: z.string().describe('The excerpt ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ articleId, excerptId }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === articleId);

      if (!article) return notFound('Article', articleId, project);

      const excerptIndex = article.excerpts.findIndex((e) => e.id === excerptId);
      if (excerptIndex === -1) return notFound('Excerpt', excerptId, project);

      const quote = article.excerpts[excerptIndex].quote;
      article.excerpts.splice(excerptIndex, 1);
      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return ok(
        project,
        `Deleted excerpt from "${article.title}":\n\n> ${quote.substring(0, 100)}${quote.length > 100 ? '...' : ''}`,
        { deletedExcerptId: excerptId },
      );
    }
  );

  // --- journal_update_question ---
  server.registerTool(
    'journal_update_question',
    {
      title: 'Update Question',
      description:
        'Updates user data on a research question — status, starred state, or appends a note. ' +
        'Creates the user data entry if none exists yet for that question.',
      inputSchema: z.object({
        questionId: z.string().describe('The research question ID'),
        status: z
          .enum(['not_started', 'exploring', 'has_findings', 'concluded'])
          .optional()
          .describe('New question status'),
        starred: z.boolean().optional().describe('Set starred state'),
        addNote: z.string().optional().describe('Append a new note to this question'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ questionId, status, starred, addNote }) => {
      const data = await readData();
      const project = getActiveProject(data);

      const questionExists = project.themes.some((t) =>
        t.questions.some((q) => q.id === questionId)
      );
      if (!questionExists) return notFound('Question', questionId, project);

      if (!project.questions[questionId]) {
        project.questions[questionId] = {
          status: 'not_started' as QuestionStatus,
          starred: false,
          notes: [],
          userSources: [],
          searchPhrases: [],
        };
      }

      const userData = project.questions[questionId];
      const changed: string[] = [];

      if (status !== undefined) {
        userData.status = status as QuestionStatus;
        changed.push(`status → ${status}`);
      }
      if (starred !== undefined) {
        userData.starred = starred;
        changed.push(`starred → ${starred}`);
      }
      if (addNote) {
        const now = new Date().toISOString();
        userData.notes.push({
          id: randomUUID(),
          content: addNote,
          createdAt: now,
          updatedAt: now,
        });
        changed.push('added note');
      }

      if (changed.length === 0) {
        return ok(project, `No fields provided to update.`, { changed: [] });
      }

      await writeData(data);

      return ok(
        project,
        `Updated question ${questionId}: ${changed.join(', ')}.`,
        { changed },
      );
    }
  );

  // --- journal_add_theme ---
  server.registerTool(
    'journal_add_theme',
    {
      title: 'Add Research Theme',
      description:
        'Creates a new research theme. Themes group related research questions together.',
      inputSchema: z.object({
        theme: z.string().min(1).describe('Theme name'),
        description: z.string().default('').describe('Theme description'),
        color: z.string().default('#6366f1').describe('Theme color (hex)'),
        icon: z.string().default('book').describe('Theme icon name'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ theme, description, color, icon }) => {
      const data = await readData();
      const project = getActiveProject(data);

      const newTheme = {
        id: randomUUID(),
        theme,
        color,
        icon,
        description,
        questions: [],
      };

      project.themes.push(newTheme);
      await writeData(data);

      return ok(
        project,
        `Created theme "${theme}" (ID: ${newTheme.id}).`,
        { themeId: newTheme.id },
      );
    }
  );

  // --- journal_add_question ---
  server.registerTool(
    'journal_add_question',
    {
      title: 'Add Research Question',
      description:
        'Adds a new research question to an existing theme. Returns the new question ID.',
      inputSchema: z.object({
        themeId: z.string().describe('The theme ID to add the question to'),
        q: z.string().min(1).describe('The research question text'),
        why: z.string().default('').describe('Why this question matters'),
        appImplication: z.string().default('').describe('How this applies to the app/project'),
        tags: z.array(z.string()).default([]).describe('Question tags'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ themeId, q, why, appImplication, tags }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const theme = project.themes.find((t) => t.id === themeId);

      if (!theme) return notFound('Theme', themeId, project);

      const newQuestion = {
        id: randomUUID(),
        q,
        why,
        appImplication,
        tags,
        sources: [],
      };

      theme.questions.push(newQuestion);
      await writeData(data);

      return ok(
        project,
        `Added question to "${theme.theme}" (ID: ${newQuestion.id}):\n\n"${q}"`,
        { questionId: newQuestion.id },
      );
    }
  );

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
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === articleId);

      if (!article) return notFound('Article', articleId, project);

      const excerpt = {
        id: randomUUID(),
        quote,
        comment,
        createdAt: new Date().toISOString(),
      };

      article.excerpts.push(excerpt);
      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return ok(
        project,
        `Added excerpt to "${article.title}":\n\n> ${quote}${comment ? `\n\nComment: ${comment}` : ''}`,
        { excerptId: excerpt.id },
      );
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
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === articleId);

      if (!article) return notFound('Article', articleId, project);

      if (article.notes) {
        article.notes += '\n\n' + text;
      } else {
        article.notes = text;
      }

      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return ok(project, `Added note to "${article.title}":\n\n${text}`);
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
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === articleId);

      if (!article) return notFound('Article', articleId, project);

      const questionExists = project.themes.some((t) =>
        t.questions.some((q) => q.id === questionId)
      );
      if (!questionExists) return notFound('Question', questionId, project);

      if (action === 'link') {
        if (!article.linkedQuestions.includes(questionId)) {
          article.linkedQuestions.push(questionId);
        }
      } else {
        article.linkedQuestions = article.linkedQuestions.filter((q) => q !== questionId);
      }

      article.updatedAt = new Date().toISOString();
      await writeData(data);

      return ok(
        project,
        `${action === 'link' ? 'Linked' : 'Unlinked'} "${article.title}" ` +
          `${action === 'link' ? 'to' : 'from'} question ${questionId}.\n\n` +
          `linkedQuestions: ${JSON.stringify(article.linkedQuestions)}`,
        { linkedQuestions: article.linkedQuestions },
      );
    }
  );

  // --- journal_update_tags ---
  server.registerTool(
    'journal_update_tags',
    {
      title: 'Update Article Tags',
      description:
        'Sets the tags array on an existing article, replacing whatever tags are currently there. ' +
        'Pass an empty array to clear all tags.',
      inputSchema: z.object({
        articleId: z.string().describe('The article ID to update'),
        tags: z.array(z.string()).describe('The complete new tags array to set on the article'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ articleId, tags }) => {
      const data = await readData();
      const project = getActiveProject(data);
      const article = project.library.find((a) => a.id === articleId);

      if (!article) return notFound('Article', articleId, project);

      const now = new Date().toISOString();
      article.tags = tags;
      article.updatedAt = now;
      await writeData(data);

      return ok(
        project,
        `Updated tags on "${article.title}":\n\n${tags.length > 0 ? tags.join(', ') : '(no tags)'}`,
        { tags },
      );
    }
  );
}
