/**
 * Scholarly metadata from OpenAlex and Crossref: the raw record shapes, the
 * normalization that turns them into a ScholarPaper, and the lookups.
 *
 * Shared by the app's search (src/services/providers) and the server's
 * enrich-on-insert (api/_enrich.ts). It is deliberately dependency-free and
 * lives under api/ for a reason: api code typechecks under NodeNext, which
 * cannot follow src/'s extensionless imports, while the app's bundler imports
 * this file without complaint. One normalizer means a fix — like the abstract
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

/**
 * Plain text from a title or venue name. Crossref titles carry inline markup —
 * "Involuntary remembering and <scp>ADHD</scp>", with line breaks around it.
 */
export function stripMarkup(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Drops a leading "Abstract" heading.
 *
 * Both providers carry it: Crossref as a <jats:title> element, OpenAlex as the
 * first word of its inverted index, which it builds from the same markup. Only
 * a heading is removed — it must be followed by a capitalized word, so an
 * abstract that opens "Abstract thinking is…" keeps its first word.
 */
export function stripAbstractHeading(text: string): string {
  return text.replace(/^(?:Abstract|ABSTRACT)[:.]?\s+(?=[A-Z0-9])/, '');
}

export function stripJats(html: string): string {
  const noTags = html
    // Section headings go with their text, so <jats:title>Abstract</jats:title>
    // does not leave a literal "Abstract " at the front.
    .replace(/<jats:title>[\s\S]*?<\/jats:title>/g, ' ')
    .replace(/<jats:[^>]+>/g, '')
    .replace(/<\/jats:[^>]+>/g, '')
    .replace(/<[^>]+>/g, '');
  return stripAbstractHeading(decodeEntities(noTags).replace(/\s+/g, ' ').trim());
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
  return stripAbstractHeading(decodeEntities(words.map(([word]) => word).join(' ')));
}

/** Bare DOI from any of the forms callers and providers use. */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
}

/**
 * A value safe inside an OpenAlex `*.search` filter.
 *
 * Commas and pipes separate filters and a colon splits key from value, and a
 * `?` anywhere makes the API answer 400 — measured on a real title ending "…
 * judgments? A reply to Sprouse". Search matching is word-based, so keeping
 * only letters, digits, apostrophes and hyphens loses nothing.
 */
export function openAlexFilterValue(q: string): string {
  return q
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    title: work.title ? stripMarkup(work.title) : 'Untitled',
    authors: work.authorships.map((a) => ({ name: decodeEntities(a.author.display_name) })),
    year: work.publication_year,
    journal: work.primary_location?.source
      ? { name: stripMarkup(work.primary_location.source.display_name) }
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

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  abstract?: string;
  'is-referenced-by-count'?: number;
  URL?: string;
}

export const CROSSREF_FIELDS =
  'DOI,title,author,issued,container-title,abstract,is-referenced-by-count,URL';

function crossrefAuthorName(a: CrossrefAuthor): string {
  if (a.name) return decodeEntities(a.name);
  return decodeEntities([a.given, a.family].filter(Boolean).join(' ').trim());
}

export function crossrefWorkToPaper(work: CrossrefWork): ScholarPaper {
  const year = work.issued?.['date-parts']?.[0]?.[0] ?? null;
  const journal = work['container-title']?.[0] ? stripMarkup(work['container-title'][0]) : null;
  return {
    paperId: work.DOI,
    title: work.title?.[0] ? stripMarkup(work.title[0]) : 'Untitled',
    authors: (work.author || []).map((a) => ({ name: crossrefAuthorName(a) })).filter((a) => a.name),
    year,
    journal: journal ? { name: journal } : null,
    abstract: work.abstract ? stripJats(work.abstract) : null,
    externalIds: { DOI: work.DOI },
    url: work.URL || `https://doi.org/${work.DOI}`,
    citationCount: work['is-referenced-by-count'] || 0,
    // Crossref has no open-access signal. Its PDF links were read as one, but
    // they are usually paywalled publisher or text-mining links — the published
    // SWAN paper (jcpp.13032) showed "Open Access" when Unpaywall and OpenAlex
    // both say it is not. Open access comes from lookupOpenAccess instead.
    isOpenAccess: false,
    oaUrl: null,
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

export interface OpenAlexSearchOptions {
  limit: number;
  page: number;
  openAccessOnly: boolean;
  /** Inclusive publication-year bounds; either may be omitted. */
  yearFrom?: number;
  yearTo?: number;
}

/**
 * The user-facing scholar search over titles and abstracts — shared by the
 * app's Search view (src/services/providers/openalex.ts) and the MCP's
 * journal_discover, so both see the same candidates for the same query.
 */
export async function searchOpenAlex(
  query: string,
  options: OpenAlexSearchOptions,
): Promise<{ papers: ScholarPaper[]; total: number }> {
  const { limit, page, openAccessOnly, yearFrom, yearTo } = options;

  const filters = [`title_and_abstract.search:${openAlexFilterValue(query)}`];
  if (openAccessOnly) filters.push('open_access.is_oa:true');
  if (yearFrom !== undefined && yearTo !== undefined) {
    filters.push(`publication_year:${yearFrom}-${yearTo}`);
  } else if (yearFrom !== undefined) {
    filters.push(`publication_year:>${yearFrom - 1}`);
  } else if (yearTo !== undefined) {
    filters.push(`publication_year:<${yearTo + 1}`);
  }

  const params = new URLSearchParams({
    filter: filters.join(','),
    per_page: String(limit),
    page: String(page),
    select: OPENALEX_FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`https://api.openalex.org/works?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Search failed (${res.status}). Try again.`);

  const json = (await res.json()) as { meta: { count: number }; results: OpenAlexWork[] };
  return { papers: json.results.map(openAlexWorkToPaper), total: json.meta.count || 0 };
}

// ── Citation trail ──────────────────────────────────────────────────────────

/** "https://openalex.org/W123" → "W123"; a bare id passes through. */
export const openAlexShortId = (id: string): string => id.replace(/^https?:\/\/openalex\.org\//i, '');

/** The OpenAlex id of a paper that came from OpenAlex, else null. */
export const openAlexIdOfPaper = (paper: ScholarPaper): string | null =>
  /openalex\.org\/W\d+$/i.test(paper.paperId) ? openAlexShortId(paper.paperId) : null;

/**
 * The work to walk a trail from: the stored id, else the DOI resolved through
 * OpenAlex. Null when neither identifies an OpenAlex work.
 */
export async function resolveOpenAlexWorkId(article: {
  openAlexId?: string;
  doi: string | null;
}): Promise<string | null> {
  if (article.openAlexId) return article.openAlexId;
  if (!article.doi) return null;
  const paper = await lookupOpenAlexByDoi(article.doi);
  return paper ? openAlexIdOfPaper(paper) : null;
}

/** OpenAlex's OR filter takes at most 100 values. */
const MAX_IDS_PER_FILTER = 100;

/**
 * What a work cites. OpenAlex lists `referenced_works` as bare ids; they are
 * resolved in one batch through the `ids.openalex` filter (the first 100 of a
 * longer list). `total` is the full reference count.
 */
export async function fetchReferences(
  workId: string,
  limit: number,
): Promise<{ papers: ScholarPaper[]; total: number }> {
  const params = new URLSearchParams({ select: 'id,referenced_works', mailto: MAILTO });
  const work = await getJson<{ referenced_works?: string[] }>(
    `https://api.openalex.org/works/${encodeURIComponent(workId)}?${params}`,
  );
  const ids = (work?.referenced_works ?? []).map(openAlexShortId);
  if (ids.length === 0) return { papers: [], total: 0 };

  // Resolve a full batch and rank it, so `limit` keeps the most-cited
  // references rather than whichever came first in the list.
  const wanted = ids.slice(0, MAX_IDS_PER_FILTER);
  const batch = new URLSearchParams({
    filter: `ids.openalex:${wanted.join('|')}`,
    per_page: String(wanted.length),
    select: OPENALEX_FIELDS,
    mailto: MAILTO,
  });
  const json = await getJson<{ results: OpenAlexWork[] }>(`https://api.openalex.org/works?${batch}`);
  // Most-cited first, like the cited-by default — the reference list's own
  // order is not meaningful in OpenAlex.
  const papers = (json?.results ?? [])
    .map(openAlexWorkToPaper)
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, limit);
  return { papers, total: ids.length };
}

export type CitedBySort = 'citations' | 'year';

/** Works that cite this one, most-cited or newest first. */
export async function fetchCitedBy(
  workId: string,
  limit: number,
  sort: CitedBySort,
): Promise<{ papers: ScholarPaper[]; total: number }> {
  const params = new URLSearchParams({
    filter: `cites:${workId}`,
    sort: sort === 'year' ? 'publication_year:desc' : 'cited_by_count:desc',
    per_page: String(limit),
    select: OPENALEX_FIELDS,
    mailto: MAILTO,
  });
  const json = await getJson<{ meta: { count: number }; results: OpenAlexWork[] }>(
    `https://api.openalex.org/works?${params}`,
  );
  return { papers: (json?.results ?? []).map(openAlexWorkToPaper), total: json?.meta.count ?? 0 };
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

/**
 * Semantic Scholar often has abstracts that OpenAlex and Crossref withhold
 * (Elsevier titles especially). Keyless and CORS-open. Callers treat any
 * failure as a miss, never as a reason to block a save.
 *
 * The DOI's slash must stay a slash: Semantic Scholar answers an encoded %2F
 * with 429, which reads as rate limiting but is not — measured, alternating
 * the two forms of the same request (v0.48.4's fallback never worked for it).
 */
export async function lookupSemanticScholarAbstract(doi: string): Promise<string | null> {
  const json = await getJson<{ abstract?: string | null }>(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURI(normalizeDoi(doi))}?fields=abstract`,
  );
  return json?.abstract?.trim() || null;
}

// ── Open access ─────────────────────────────────────────────────────────────

export interface OpenAccessInfo {
  isOpenAccess: boolean;
  /** Best free version — a PDF or a landing page — or null when there is none. */
  url: string | null;
}

/**
 * Whether a DOI is free to read, and where.
 *
 * OpenAlex's open_access is Unpaywall's data (same nonprofit): on every DOI
 * checked, its oa_url matched Unpaywall's best_oa_location exactly. So this is
 * the single source for the open-access badge and the free-version link, and
 * there is no separate Unpaywall call anywhere.
 *
 * Returns null when OpenAlex has no record of the DOI; throws when OpenAlex
 * cannot be reached, so callers can leave an article untouched rather than
 * record a failed check as "not open access".
 */
export async function lookupOpenAccess(doi: string): Promise<OpenAccessInfo | null> {
  const paper = await lookupOpenAlexByDoi(doi);
  if (!paper) return null;
  return { isOpenAccess: paper.isOpenAccess, url: paper.isOpenAccess ? paper.oaUrl : null };
}
