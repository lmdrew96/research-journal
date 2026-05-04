import { searchOpenAlex } from './providers/openalex';
import { searchCrossref } from './providers/crossref';

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

export type ScholarProvider = 'openalex' | 'crossref';

export interface SearchProviderOptions {
  limit: number;
  page: number;
  openAccessOnly: boolean;
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
  };

  if (provider === 'crossref') {
    return searchCrossref(query, providerOptions);
  }
  return searchOpenAlex(query, providerOptions);
}
