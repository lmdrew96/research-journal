import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull, type McpContext, liveThemes } from '../store.js';
import { ok, okEmpty, notFound, err } from '../envelope.js';
import { extractText, getDocumentProxy } from 'unpdf';
import { getPdfBytes, ownsPdfKey } from '../../_r2.js';

/** Keeps one call's text small enough to sit comfortably in a conversation. */
const MAX_TEXT_CHARS = 60_000;

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) to get started.';

export function registerLibraryTools(server: McpServer, ctx: McpContext): void {
  // --- journal_get_library ---
  server.registerTool(
    'journal_get_library',
    {
      title: 'Get Library',
      description:
        'Returns all saved articles with title, authors, year, tags, status, source, and excerpt ' +
        'count. `source` says where the metadata came from — crossref or openalex (a search ' +
        'provider) or manual (typed in) — and is null for an article saved before it was ' +
        'recorded. `keySource` is true for key sources, which is separate from reading status. ' +
        'Supports optional filtering by reading status (to-read, reading, done), by key source, ' +
        'by source, and by theme ID (returns only articles linked to questions in that theme).',
      inputSchema: z.object({
        status: z
          .enum(['to-read', 'reading', 'done'])
          .optional()
          .describe('Filter articles by reading progress'),
        keySource: z
          .boolean()
          .optional()
          .describe('true for only key sources, false for only articles that are not'),
        source: z
          .enum(['crossref', 'openalex', 'manual'])
          .optional()
          .describe('Filter articles by where their metadata came from'),
        theme: z
          .string()
          .optional()
          .describe('Filter articles linked to questions belonging to this theme ID'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ status, keySource, source, theme }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { library: [] });
      let articles = project.library;

      if (status) {
        articles = articles.filter((a) => a.status === status);
      }

      if (keySource !== undefined) {
        articles = articles.filter((a) => (a.keySource === true) === keySource);
      }

      if (source) {
        articles = articles.filter((a) => a.source === source);
      }

      if (theme) {
        const themeObj = liveThemes(project).find((t) => t.id === theme);
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
        keySource: a.keySource === true,
        source: a.source ?? null,
        excerptCount: a.excerpts.length,
      }));

      return ok(project, JSON.stringify(summary, null, 2), { library: summary });
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
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG);
      const article = project.library.find((a) => a.id === id);

      if (!article) return notFound('Article', id, project);

      const linkedDetails = article.linkedQuestions.map((qid) => {
        for (const theme of liveThemes(project)) {
          const q = theme.questions.find((q) => q.id === qid);
          if (q) return { id: qid, question: q.q, theme: theme.theme };
        }
        return { id: qid, question: '(unknown)', theme: '(unknown)' };
      });

      const result = {
        ...article,
        linkedQuestionDetails: linkedDetails,
      };

      return ok(project, JSON.stringify(result, null, 2), { article: result });
    }
  );

  // --- journal_get_article_text ---
  server.registerTool(
    'journal_get_article_text',
    {
      title: 'Read Article PDF Text',
      description:
        "Returns the text of an article's attached PDF, page by page, so you can read around " +
        "Nae's highlights (an excerpt's `page` is its PDF page). Pass pageFrom/pageTo to read a " +
        'range; a long range is cut off at a page boundary and the response says where to ' +
        'continue. Only works for articles with an uploaded PDF. For Nae\'s personal reading only.',
      inputSchema: z.object({
        id: z.string().describe('The article ID'),
        pageFrom: z.number().int().positive().optional().describe('First PDF page to read (default 1)'),
        pageTo: z.number().int().positive().optional().describe('Last PDF page to read (default: the end)'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id, pageFrom, pageTo }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG);
      const article = project.library.find((a) => a.id === id);
      if (!article) return notFound('Article', id, project);

      if (!article.pdfKey) {
        const free = article.unpaywallUrl ? ` There is a free version online: ${article.unpaywallUrl}` : '';
        return err(`"${article.title}" has no uploaded PDF, so there is no text to read.${free}`, project);
      }
      if (!ownsPdfKey(ctx.userId, article.pdfKey)) {
        return err(`"${article.title}" points at a PDF that does not belong to this account.`, project);
      }
      if (pageFrom !== undefined && pageTo !== undefined && pageTo < pageFrom) {
        return err('pageTo must be at or after pageFrom.', project);
      }

      const bytes = await getPdfBytes(article.pdfKey);
      if (!bytes) {
        return err(`The PDF for "${article.title}" is missing from storage. Re-attach it in the app.`, project);
      }
      const { totalPages, text } = await extractText(await getDocumentProxy(bytes), { mergePages: false });

      const from = pageFrom ?? 1;
      if (from > totalPages) {
        return err(`"${article.title}" has ${totalPages} pages; pageFrom ${from} is past the end.`, project);
      }
      const to = Math.min(pageTo ?? totalPages, totalPages);

      // Whole pages only, up to the size cap — always at least one page.
      const pages: { page: number; text: string }[] = [];
      let chars = 0;
      for (let n = from; n <= to; n++) {
        const pageText = (text[n - 1] ?? '').trim();
        if (pages.length > 0 && chars + pageText.length > MAX_TEXT_CHARS) break;
        pages.push({ page: n, text: pageText });
        chars += pageText.length;
      }
      const lastRead = pages[pages.length - 1].page;
      const nextPage = lastRead < to ? lastRead + 1 : null;
      const blank = pages.filter((p) => !p.text).length;

      const body = pages.map((p) => `--- Page ${p.page} ---\n${p.text || '(no text on this page)'}`).join('\n\n');
      const notes = [
        nextPage ? `Stopped at page ${lastRead} to keep this short — call again with pageFrom ${nextPage} to continue.` : null,
        blank === pages.length
          ? 'No text could be extracted: this PDF is probably scanned images.'
          : null,
      ].filter(Boolean);

      return ok(
        project,
        `"${article.title}" — pages ${from}–${lastRead} of ${totalPages}\n\n${body}${notes.length ? `\n\n${notes.join(' ')}` : ''}`,
        { articleId: id, totalPages, pageFrom: from, pageTo: lastRead, nextPage, pages },
      );
    }
  );
}
