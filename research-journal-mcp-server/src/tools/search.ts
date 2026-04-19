import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull } from '../dataStore.js';
import type { LibraryArticle } from '../types.js';
import { ok, okEmpty } from './envelope.js';

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

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'journal_search',
    {
      title: 'Search Library',
      description:
        'Full-text search across article titles, abstracts, notes, and excerpt quotes/comments. ' +
        'Returns matching articles with which fields matched and any matching excerpts.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query string'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query }) => {
      const data = await readData();
      const project = getActiveProjectOrNull(data);
      if (!project) return okEmpty(NO_PROJECTS_MSG, { results: [] });
      const results: SearchResult[] = [];

      for (const article of project.library) {
        const result = searchArticle(article, query);
        if (result) results.push(result);
      }

      if (results.length === 0) {
        return ok(project, `No results found for "${query}".`, { results: [] });
      }

      return ok(
        project,
        `Found ${results.length} article(s) matching "${query}":\n\n` +
          JSON.stringify(results, null, 2),
        { results },
      );
    }
  );
}
