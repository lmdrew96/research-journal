import {
  lookupOpenAlexByDoi,
  searchOpenAlexByTitle,
  lookupCrossrefByDoi,
  searchCrossrefByTitle,
  type ScholarPaper,
} from './_scholar.js';

/**
 * Matching an article someone typed in against OpenAlex and Crossref.
 *
 * Used by journal_add_article at insert time and meant to be reused by the
 * backfill sweep, so there is exactly one definition of "confident match".
 *
 * Confidence comes from the TITLE and an AUTHOR SURNAME, never from the
 * provider's relevance score: Crossref scored the right paper 35.9 and an
 * unrelated one 34.4 for the same query, so a score cut-off cannot tell them
 * apart. A DOI is not required — book chapters and older papers in this
 * library have none, and OpenAlex covers many of them.
 */

export type EnrichProvider = 'openalex' | 'crossref';

/** Applied to an article whose metadata no lookup could confirm. Shared with the backfill sweep. */
export const UNVERIFIED_METADATA_TAG = 'unverified-metadata';

export interface MetadataQuery {
  title: string;
  authors: string[];
  doi: string | null;
}

export interface MetadataMatch {
  paper: ScholarPaper;
  provider: EnrichProvider;
  /**
   * How the match was established. `title-only` happens only when the caller
   * gave no authors, and requires a near-exact title.
   */
  via: 'doi' | 'title-and-author' | 'title-only';
  /** Set when the abstract came from the other provider. */
  abstractFrom?: EnrichProvider;
}

export interface MatchResult {
  match: MetadataMatch | null;
  /** Human-readable notes: a provider that failed, a DOI pointing elsewhere. */
  notes: string[];
}

// ── Similarity ──────────────────────────────────────────────────────────────

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const wordsOf = (title: string): string[] => normalizeTitle(title).split(' ').filter(Boolean);

/** Dice coefficient over distinct words: 1 is identical, 0 shares nothing. */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(wordsOf(a));
  const wb = new Set(wordsOf(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (2 * shared) / (wa.size + wb.size);
}

/** The part before a subtitle — one side often carries the subtitle and the other doesn't. */
const mainTitle = (title: string): string => title.split(/[:?]\s|\s[-–—]\s/)[0];

/** Surname from "First Last", "F. Last" or "Last, First". */
export function surname(name: string): string {
  const base = name.includes(',') ? name.split(',')[0] : name.trim().split(/\s+/).pop() ?? '';
  return normalizeTitle(base);
}

function titlesAgree(given: string, found: string, threshold: number): boolean {
  if (titleSimilarity(given, found) >= threshold) return true;
  const main = mainTitle(given);
  return wordsOf(main).length >= 4 && normalizeTitle(main) === normalizeTitle(mainTitle(found));
}

function sharesAuthor(given: string[], found: ScholarPaper): boolean {
  const foundSurnames = new Set(found.authors.map((a) => surname(a.name)).filter(Boolean));
  return given.some((name) => {
    const s = surname(name);
    return s !== '' && foundSurnames.has(s);
  });
}

/** Whether a search hit is the article the caller described, and on what grounds. */
export function assessMatch(
  query: MetadataQuery,
  paper: ScholarPaper,
): 'title-and-author' | 'title-only' | null {
  if (query.authors.length > 0) {
    return titlesAgree(query.title, paper.title, 0.85) && sharesAuthor(query.authors, paper)
      ? 'title-and-author'
      : null;
  }
  // Nothing to corroborate the title with, so it has to be near-exact and
  // specific enough that a different paper is unlikely to share it.
  return wordsOf(query.title).length >= 4 && titleSimilarity(query.title, paper.title) >= 0.95
    ? 'title-only'
    : null;
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Upper bound on the whole lookup. The tool call waits on it, so a slow
 * provider must cost a skipped step, not a hung request.
 */
const BUDGET_MS = 12_000;

export async function findMetadataMatch(query: MetadataQuery): Promise<MatchResult> {
  const notes: string[] = [];
  const deadline = Date.now() + BUDGET_MS;

  const attempt = async <T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    if (Date.now() > deadline) {
      notes.push(`${label} skipped: lookup time budget used up.`);
      return fallback;
    }
    try {
      return await run();
    } catch (err) {
      notes.push(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  let match: MetadataMatch | null = null;

  // 1. A DOI resolves directly — but only counts if it resolves to the paper
  //    the caller named. A mistyped DOI must not overwrite a book chapter with
  //    someone else's journal article.
  if (query.doi) {
    const doi = query.doi;
    const byDoi: Array<[EnrichProvider, (d: string) => Promise<ScholarPaper | null>]> = [
      ['openalex', lookupOpenAlexByDoi],
      ['crossref', lookupCrossrefByDoi],
    ];
    for (const [provider, lookup] of byDoi) {
      const paper = await attempt(`${provider} DOI lookup`, () => lookup(doi), null);
      if (!paper) continue;
      if (titlesAgree(query.title, paper.title, 0.5)) {
        match = { paper, provider, via: 'doi' };
        break;
      }
      notes.push(
        `${provider}: DOI ${doi} resolves to "${paper.title}", which does not match the given ` +
          'title, so it was not used.',
      );
    }
  }

  // 2. Title plus lead author, OpenAlex first — it covers DOI-less works.
  if (!match) {
    const lead = query.authors[0] ? surname(query.authors[0]) || null : null;
    const byTitle: Array<[EnrichProvider, typeof searchOpenAlexByTitle]> = [
      ['openalex', searchOpenAlexByTitle],
      ['crossref', searchCrossrefByTitle],
    ];
    for (const [provider, search] of byTitle) {
      const papers = await attempt(`${provider} title search`, () => search(query.title, lead), []);
      for (const paper of papers) {
        const via = assessMatch(query, paper);
        if (via) {
          match = { paper, provider, via };
          break;
        }
      }
      if (match) break;
    }
  }

  // 3. OpenAlex often has no abstract for publisher-restricted works where
  //    Crossref does. Borrow it when both describe the same DOI.
  const matchedDoi = match?.paper.externalIds?.DOI;
  if (match && match.provider === 'openalex' && !match.paper.abstract && matchedDoi) {
    const other = await attempt('crossref abstract lookup', () => lookupCrossrefByDoi(matchedDoi), null);
    if (other?.abstract) {
      match = { ...match, paper: { ...match.paper, abstract: other.abstract }, abstractFrom: 'crossref' };
    }
  }

  return { match, notes };
}

// ── Applying a match ────────────────────────────────────────────────────────

export interface ArticleMetadata {
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  isOpenAccess: boolean;
}

/**
 * Fills EMPTY fields from a match and reports which ones it filled.
 *
 * Never overwrites: a value the caller supplied is what they meant, and the
 * tool result is the only place an agent learns what was actually written, so
 * `filled` must be exact. `isOpenAccess` has no empty state, so it is filled
 * only when the caller did not pass it.
 *
 * `journal` is taken only from a match that has a DOI. OpenAlex venue data for
 * DOI-less works is unreliable — it lists a 1995 applied-linguistics book
 * chapter under "Medical Entomology and Zoology".
 */
export function fillEmptyFields(
  given: ArticleMetadata,
  match: MetadataMatch,
  openAccessGiven: boolean,
): { metadata: ArticleMetadata; filled: Array<keyof ArticleMetadata> } {
  const { paper } = match;
  const metadata = { ...given };
  const filled: Array<keyof ArticleMetadata> = [];
  const blank = (v: string | null) => v === null || v.trim() === '';

  if (given.authors.length === 0 && paper.authors.length > 0) {
    metadata.authors = paper.authors.map((a) => a.name);
    filled.push('authors');
  }
  if (given.year === null && paper.year !== null) {
    metadata.year = paper.year;
    filled.push('year');
  }
  if (blank(given.journal) && paper.journal && paper.externalIds?.DOI) {
    metadata.journal = paper.journal.name;
    filled.push('journal');
  }
  if (blank(given.doi) && paper.externalIds?.DOI) {
    metadata.doi = paper.externalIds.DOI;
    filled.push('doi');
  }
  if (blank(given.url) && paper.url) {
    metadata.url = paper.url;
    filled.push('url');
  }
  if (blank(given.abstract) && paper.abstract) {
    metadata.abstract = paper.abstract;
    filled.push('abstract');
  }
  if (!openAccessGiven && paper.isOpenAccess && !given.isOpenAccess) {
    metadata.isOpenAccess = true;
    filled.push('isOpenAccess');
  }

  return { metadata, filled };
}
