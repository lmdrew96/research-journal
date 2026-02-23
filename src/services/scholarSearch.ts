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

// OpenAlex API types (internal)
interface OpenAlexWork {
  id: string;
  title: string;
  authorships: {
    author: { display_name: string };
  }[];
  publication_year: number | null;
  primary_location: {
    source: { display_name: string } | null;
    landing_page_url: string | null;
  } | null;
  doi: string | null;
  cited_by_count: number;
  abstract_inverted_index: Record<string, number[]> | null;
  open_access: {
    is_oa: boolean;
    oa_url: string | null;
  } | null;
}

interface OpenAlexResponse {
  meta: { count: number };
  results: OpenAlexWork[];
}

const OPENALEX_FIELDS = 'id,title,authorships,publication_year,primary_location,doi,cited_by_count,abstract_inverted_index,open_access';

function reconstructAbstract(inverted: Record<string, number[]> | null): string | null {
  if (!inverted) return null;
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(([word]) => word).join(' ');
}

function extractDoi(doi: string | null): string | null {
  if (!doi) return null;
  // OpenAlex returns DOIs as full URLs like "https://doi.org/10.1234/..."
  return doi.replace('https://doi.org/', '');
}

function toScholarPaper(work: OpenAlexWork): ScholarPaper {
  const doi = extractDoi(work.doi);
  return {
    paperId: work.id,
    title: work.title || 'Untitled',
    authors: work.authorships.map((a) => ({ name: a.author.display_name })),
    year: work.publication_year,
    journal: work.primary_location?.source
      ? { name: work.primary_location.source.display_name }
      : null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    externalIds: doi ? { DOI: doi } : null,
    url: work.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : null),
    citationCount: work.cited_by_count || 0,
    isOpenAccess: work.open_access?.is_oa ?? false,
    oaUrl: work.open_access?.oa_url || null,
  };
}

export async function searchScholar(
  query: string,
  options: { limit?: number; openAccessOnly?: boolean } = {}
): Promise<{ papers: ScholarPaper[]; total: number }> {
  const { limit = 10, openAccessOnly = false } = options;
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    select: OPENALEX_FIELDS,
    mailto: 'research-journal@chaoslimba.app',
  });

  if (openAccessOnly) {
    params.set('filter', 'open_access.is_oa:true');
  }

  const res = await fetch(`https://api.openalex.org/works?${params}`);

  if (!res.ok) {
    throw new Error(`Search failed (${res.status}). Try again.`);
  }

  const json: OpenAlexResponse = await res.json();

  return {
    papers: json.results.map(toScholarPaper),
    total: json.meta.count || 0,
  };
}
