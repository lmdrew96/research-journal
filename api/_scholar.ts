/**
 * Scholarly metadata from OpenAlex and Crossref: the raw record shapes, the
 * normalization that turns them into a ScholarPaper, and the lookups.
 *
 * Shared by the app's search (src/services/providers) and the server's
 * enrich-on-insert (api/_enrich.ts). It is deliberately dependency-free and
 * lives under api/ for a reason: api code typechecks under NodeNext, which
 * cannot follow src/'s extensionless imports, while the app's bundler imports
 * this file without complaint. One normalizer means a fix — like the JATS
 * heading below — lands in both paths instead of drifting between two copies.
 */

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

export const MAILTO = 'lmdrew@udel.edu';

// ── Text normalization ──────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode HTML/XML character entities in bibliographic metadata.
 *
 * Crossref and OpenAlex both derive their records from JATS/XML sources, so
 * titles and container-titles routinely arrive carrying `&amp;`, `&lt;` and
 * numeric entities. Stored undecoded, they surface verbatim in the library and
 * through the MCP.
 *
 * Each replace is a single left-to-right pass over the input, so a
 * double-encoded `&amp;lt;` decodes exactly one level to `&lt;` — the scanner
 * resumes past the match rather than re-reading the `&` it just produced.
 */
export const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);

export function stripJats(html: string): string {
  const noTags = html
    // Section headings go with their text. Crossref often wraps the abstract
    // in <jats:title>Abstract</jats:title>; stripping only the tags left a
    // literal "Abstract " at the front of every such abstract in the library.
    .replace(/<jats:title>[\s\S]*?<\/jats:title>/g, ' ')
    .replace(/<jats:[^>]+>/g, '')
    .replace(/<\/jats:[^>]+>/g, '')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/** OpenAlex stores abstracts as a word → positions index rather than text. */
export function reconstructAbstract(inverted: Record<string, number[]> | null): string | null {
  if (!inverted) return null;
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return decodeEntities(words.map(([word]) => word).join(' '));
}

/** Bare DOI from any of the forms callers and providers use. */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
}

// ── OpenAlex ────────────────────────────────────────────────────────────────

export interface OpenAlexWork {
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

export const OPENALEX_FIELDS =
  'id,title,authorships,publication_year,primary_location,doi,cited_by_count,abstract_inverted_index,open_access';

export function openAlexWorkToPaper(work: OpenAlexWork): ScholarPaper {
  const doi = work.doi ? normalizeDoi(work.doi) : null;
  return {
    paperId: work.id,
    title: work.title ? decodeEntities(work.title) : 'Untitled',
    authors: work.authorships.map((a) => ({ name: decodeEntities(a.author.display_name) })),
    year: work.publication_year,
    journal: work.primary_location?.source
      ? { name: decodeEntities(work.primary_location.source.display_name) }
      : null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    externalIds: doi ? { DOI: doi } : null,
    url: work.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : null),
    citationCount: work.cited_by_count || 0,
    isOpenAccess: work.open_access?.is_oa ?? false,
    oaUrl: work.open_access?.oa_url || null,
  };
}

// ── Crossref ────────────────────────────────────────────────────────────────

export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefLink {
  URL: string;
  'content-type'?: string;
}

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  abstract?: string;
  'is-referenced-by-count'?: number;
  URL?: string;
  link?: CrossrefLink[];
}

export const CROSSREF_FIELDS =
  'DOI,title,author,issued,container-title,abstract,is-referenced-by-count,URL,link';

function crossrefAuthorName(a: CrossrefAuthor): string {
  if (a.name) return decodeEntities(a.name);
  return decodeEntities([a.given, a.family].filter(Boolean).join(' ').trim());
}

function crossrefPdfLink(links: CrossrefLink[] | undefined): string | null {
  if (!links) return null;
  const pdf = links.find((l) => l['content-type'] === 'application/pdf');
  return pdf?.URL || null;
}

export function crossrefWorkToPaper(work: CrossrefWork): ScholarPaper {
  const year = work.issued?.['date-parts']?.[0]?.[0] ?? null;
  const journal = work['container-title']?.[0] ? decodeEntities(work['container-title'][0]) : null;
  const pdf = crossrefPdfLink(work.link);
  return {
    paperId: work.DOI,
    title: work.title?.[0] ? decodeEntities(work.title[0]) : 'Untitled',
    authors: (work.author || []).map((a) => ({ name: crossrefAuthorName(a) })).filter((a) => a.name),
    year,
    journal: journal ? { name: journal } : null,
    abstract: work.abstract ? stripJats(work.abstract) : null,
    externalIds: { DOI: work.DOI },
    url: work.URL || `https://doi.org/${work.DOI}`,
    citationCount: work['is-referenced-by-count'] || 0,
    isOpenAccess: !!pdf,
    oaUrl: pdf,
  };
}

// ── Lookups ─────────────────────────────────────────────────────────────────
//
// Single-record lookups for enrichment, as opposed to the paged, user-facing
// search in src/services/providers. A 404 means "no such record" and returns
// null; anything else that fails throws, so the caller can say which provider
// was unreachable rather than reporting it as a miss.

const LOOKUP_TIMEOUT_MS = 5000;

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

/** Commas and pipes separate OpenAlex filters, and a colon splits key from value. */
function openAlexFilterValue(q: string): string {
  return q.replace(/[,|:]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function lookupOpenAlexByDoi(doi: string): Promise<ScholarPaper | null> {
  const params = new URLSearchParams({ select: OPENALEX_FIELDS, mailto: MAILTO });
  const work = await getJson<OpenAlexWork>(
    `https://api.openalex.org/works/doi:${encodeURI(normalizeDoi(doi))}?${params}`,
  );
  return work ? openAlexWorkToPaper(work) : null;
}

export async function searchOpenAlexByTitle(
  title: string,
  authorSurname: string | null,
  limit = 5,
): Promise<ScholarPaper[]> {
  const filters = [`title.search:${openAlexFilterValue(title)}`];
  if (authorSurname) filters.push(`raw_author_name.search:${openAlexFilterValue(authorSurname)}`);
  const params = new URLSearchParams({
    filter: filters.join(','),
    per_page: String(limit),
    select: OPENALEX_FIELDS,
    mailto: MAILTO,
  });
  const json = await getJson<{ results: OpenAlexWork[] }>(`https://api.openalex.org/works?${params}`);
  return (json?.results ?? []).map(openAlexWorkToPaper);
}

export async function lookupCrossrefByDoi(doi: string): Promise<ScholarPaper | null> {
  const params = new URLSearchParams({ mailto: MAILTO });
  const json = await getJson<{ message: CrossrefWork }>(
    `https://api.crossref.org/works/${encodeURI(normalizeDoi(doi))}?${params}`,
  );
  return json ? crossrefWorkToPaper(json.message) : null;
}

export async function searchCrossrefByTitle(
  title: string,
  authorSurname: string | null,
  limit = 5,
): Promise<ScholarPaper[]> {
  const params = new URLSearchParams({
    'query.bibliographic': title,
    rows: String(limit),
    select: CROSSREF_FIELDS,
    mailto: MAILTO,
  });
  if (authorSurname) params.set('query.author', authorSurname);
  const json = await getJson<{ message: { items: CrossrefWork[] } }>(
    `https://api.crossref.org/works?${params}`,
  );
  return (json?.message.items ?? []).map(crossrefWorkToPaper);
}
