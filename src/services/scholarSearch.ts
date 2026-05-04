import { searchOpenAlex } from './providers/openalex';
import { searchCrossref } from './providers/crossref';
import { searchCore } from './providers/core';

export interface ScholarPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  journal: { name: string } | null;
  abstract: string | null;
  externalIds: { DOI?: string } | null;
  url: string | null;
  citationCount: number;
  isOpenAccess: boolean;
  oaUrl: string | null;
}

export type ScholarProvider = 'openalex' | 'crossref' | 'core';

export interface SearchProviderOptions {
  limit: number;
  page: number;
  openAccessOnly: boolean;
  token?: string | null;
}

export interface SearchResult {
  papers: ScholarPaper[];
  total: number;
}

export interface SearchScholarOptions {
  limit?: number;
  page?: number;
  openAccessOnly?: boolean;
  provider?: ScholarProvider;
  token?: string | null;
}

export async function searchScholar(
  query: string,
  options: SearchScholarOptions = {}
): Promise<SearchResult> {
  const provider = options.provider ?? 'openalex';
  const providerOptions: SearchProviderOptions = {
    limit: options.limit ?? 10,
    page: options.page ?? 1,
    openAccessOnly: options.openAccessOnly ?? false,
    token: options.token ?? null,
  };

  if (provider === 'crossref') {
    return searchCrossref(query, providerOptions);
  }
  if (provider === 'core') {
    return searchCore(query, providerOptions);
  }
  return searchOpenAlex(query, providerOptions);
}
