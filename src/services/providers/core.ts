import type { ScholarPaper, SearchProviderOptions, SearchResult } from '../scholarSearch';

export const CORE_API_KEY_STORAGE = 'tn-core-api-key';

export class CoreApiKeyMissingError extends Error {
  constructor() {
    super('CORE API key is missing. Add it in Settings → CORE Search.');
    this.name = 'CoreApiKeyMissingError';
  }
}

interface CoreAuthor {
  name?: string;
}

interface CoreJournal {
  title?: string;
}

interface CoreWork {
  id?: number | string;
  title?: string | null;
  authors?: CoreAuthor[];
  yearPublished?: number | null;
  publisher?: string | null;
  journals?: CoreJournal[];
  abstract?: string | null;
  doi?: string | null;
  downloadUrl?: string | null;
  sourceFulltextUrls?: string[];
}

interface CoreResponse {
  totalHits?: number;
  results?: CoreWork[];
}

function getApiKey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const key = localStorage.getItem(CORE_API_KEY_STORAGE);
  return key && key.trim() ? key.trim() : null;
}

function pickJournal(work: CoreWork): string | null {
  const fromJournals = work.journals?.[0]?.title;
  if (fromJournals) return fromJournals;
  return work.publisher || null;
}

function pickOaUrl(work: CoreWork): string | null {
  if (work.downloadUrl) return work.downloadUrl;
  return work.sourceFulltextUrls?.[0] || null;
}

function toScholarPaper(work: CoreWork): ScholarPaper {
  const oaUrl = pickOaUrl(work);
  const doi = work.doi || null;
  const journal = pickJournal(work);
  return {
    paperId: String(work.id ?? doi ?? oaUrl ?? Math.random()),
    title: work.title || 'Untitled',
    authors: (work.authors || [])
      .map((a) => ({ name: a.name || '' }))
      .filter((a) => a.name),
    year: work.yearPublished ?? null,
    journal: journal ? { name: journal } : null,
    abstract: work.abstract || null,
    externalIds: doi ? { DOI: doi } : null,
    url: oaUrl || (doi ? `https://doi.org/${doi}` : null),
    citationCount: 0,
    isOpenAccess: !!oaUrl,
    oaUrl,
  };
}

export async function searchCore(
  query: string,
  options: SearchProviderOptions
): Promise<SearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new CoreApiKeyMissingError();

  const { limit, page } = options;
  const offset = (page - 1) * limit;

  const res = await fetch('https://api.core.ac.uk/v3/search/works', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ q: query, limit, offset }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('CORE rejected the API key. Check it in Settings.');
  }
  if (res.status === 429) {
    throw new Error('CORE rate limit hit (10/min on free tier). Wait a moment and try again.');
  }
  if (!res.ok) {
    throw new Error(`CORE search failed (${res.status}). Try again.`);
  }

  const json: CoreResponse = await res.json();
  return {
    papers: (json.results || []).map(toScholarPaper),
    total: json.totalHits || 0,
  };
}
