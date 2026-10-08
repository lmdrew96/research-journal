import type { SearchProviderOptions, SearchResult } from '../scholarSearch';
import { searchOpenAlex as searchOpenAlexShared } from '../../../api/_scholar';

/** The search itself lives in api/_scholar.ts, shared with the MCP's journal_discover. */
export async function searchOpenAlex(
  query: string,
  options: SearchProviderOptions
): Promise<SearchResult> {
  return searchOpenAlexShared(query, options);
}
