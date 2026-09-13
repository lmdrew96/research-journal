import type { SearchProviderOptions, SearchResult } from '../scholarSearch';
import {
  MAILTO,
  OPENALEX_FIELDS,
  openAlexFilterValue,
  openAlexWorkToPaper,
  type OpenAlexWork,
} from '../../../api/_scholar';

interface OpenAlexResponse {
  meta: { count: number };
  results: OpenAlexWork[];
}

export async function searchOpenAlex(
  query: string,
  options: SearchProviderOptions
): Promise<SearchResult> {
  const { limit, page, openAccessOnly } = options;

  const filters = [`title_and_abstract.search:${openAlexFilterValue(query)}`];
  if (openAccessOnly) {
    filters.push('open_access.is_oa:true');
  }

  const params = new URLSearchParams({
    filter: filters.join(','),
    per_page: String(limit),
    page: String(page),
    select: OPENALEX_FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`https://api.openalex.org/works?${params}`);

  if (!res.ok) {
    throw new Error(`Search failed (${res.status}). Try again.`);
  }

  const json: OpenAlexResponse = await res.json();

  return {
    papers: json.results.map(openAlexWorkToPaper),
    total: json.meta.count || 0,
  };
}
