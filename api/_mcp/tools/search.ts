import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull, type McpContext } from '../store.js';
import type { JournalEntry, LibraryArticle, Project } from '../../../src/types/index.js';
import { ok, okEmpty } from '../envelope.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) to get started.';

interface MatchedExcerpt {
  id: string;
  quote: string;
  comment: string;
  matchedIn: ('quote' | 'comment')[];
}

interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  status: string;
  matchedIn: string[];
  matchedExcerpts: MatchedExcerpt[];
}

function matches(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

function searchArticle(article: LibraryArticle, query: string): SearchResult | null {
  const matchedFields: string[] = [];
  const matchedExcerpts: MatchedExcerpt[] = [];

  if (matches(article.title, query)) matchedFields.push('title');
  if (matches(article.abstract, query)) matchedFields.push('abstract');
  if (matches(article.notes, query)) matchedFields.push('notes');

  for (const excerpt of article.excerpts) {
    const excerptMatches: ('quote' | 'comment')[] = [];
    if (matches(excerpt.quote, query)) excerptMatches.push('quote');
    if (matches(excerpt.comment, query)) excerptMatches.push('comment');
    if (excerptMatches.length > 0) {
      matchedExcerpts.push({
        id: excerpt.id,
        quote: excerpt.quote,
        comment: excerpt.comment,
        matchedIn: excerptMatches,
      });
    }
  }

  if (matchedExcerpts.length > 0) matchedFields.push('excerpts');

  if (matchedFields.length === 0) return null;

  return {
    id: article.id,
    title: article.title,
    authors: article.authors,
    year: article.year,
    status: article.status,
    matchedIn: matchedFields,
    matchedExcerpts,
  };
}

interface EntryResult {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  themeName: string | null;
  matchedIn: ('content' | 'tags')[];
}

function searchEntry(entry: JournalEntry, query: string, project: Project): EntryResult | null {
  const matchedFields: ('content' | 'tags')[] = [];
  if (matches(entry.content, query)) matchedFields.push('content');
  if (entry.tags.some((t) => matches(t, query))) matchedFields.push('tags');
  if (matchedFields.length === 0) return null;

  return {
    id: entry.id,
    content: entry.content,
    tags: entry.tags,
    createdAt: entry.createdAt,
    themeName: project.themes.find((t) => t.id === entry.themeId)?.theme ?? null,
    matchedIn: matchedFields,
  };
}

export function registerSearchTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'journal_search',
    {
      title: 'Search Library',
      description:
        'Full-text search across the active project: article titles, abstracts, notes, and ' +
        'excerpt quotes/comments, plus journal entry content and tags. Articles and journal ' +
        'entries are returned separately, each with which fields matched.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query string'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { results: [], entries: [] });
      const results: SearchResult[] = [];

      for (const article of project.library) {
        const result = searchArticle(article, query);
        if (result) results.push(result);
      }

      const entries: EntryResult[] = [];
      for (const entry of project.journal) {
        const result = searchEntry(entry, query, project);
        if (result) entries.push(result);
      }

      if (results.length === 0 && entries.length === 0) {
        return ok(project, `No results found for "${query}".`, { results: [], entries: [] });
      }

      const parts: string[] = [];
      if (results.length > 0) {
        parts.push(
          `${results.length} article(s) matching "${query}":\n\n` +
            JSON.stringify(results, null, 2),
        );
      }
      if (entries.length > 0) {
        parts.push(
          `${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'} matching ` +
            `"${query}":\n\n${JSON.stringify(entries, null, 2)}`,
        );
      }

      return ok(project, parts.join('\n\n'), { results, entries });
    }
  );
}
