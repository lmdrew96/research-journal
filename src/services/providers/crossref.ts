import type { SearchProviderOptions, SearchResult } from '../scholarSearch';
import {
  MAILTO,
  CROSSREF_FIELDS,
  crossrefWorkToPaper,
  type CrossrefWork,
} from '../../../api/_scholar';

interface CrossrefResponse {
  message: {
    'total-results': number;
    items: CrossrefWork[];
  };
}

export async function searchCrossref(
  query: string,
  options: SearchProviderOptions
): Promise<SearchResult> {
  const { limit, page } = options;
  const offset = (page - 1) * limit;

  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
    offset: String(offset),
    select: CROSSREF_FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`https://api.crossref.org/works?${params}`);

  if (!res.ok) {
    throw new Error(`Search failed (${res.status}). Try again.`);
  }

  const json: CrossrefResponse = await res.json();

  return {
    papers: json.message.items.map(crossrefWorkToPaper),
    total: json.message['total-results'] || 0,
  };
}
