/**
 * Local search matching, shared by the app's Search view (src/hooks/useSearch.ts)
 * and the MCP's journal_search (api/_mcp/tools/search.ts).
 *
 * It lives under api/ for the same reason api/_scholar.ts does: api code
 * typechecks under NodeNext and cannot follow src/'s extensionless imports,
 * while the app's bundler imports this file without complaint. Both callers
 * build their results from the field lists below, so the app and Claude find
 * the same things without anyone keeping two copies in step by hand.
 *
 * Matching rules:
 * - The query is split into terms. An item matches when EVERY term appears in
 *   at least one of its fields — across fields, not within one. "eye tracking
 *   cognates" finds a note reading "eye tracking on L1/L2 cognates".
 * - Both sides are normalized: lowercased, diacritics stripped (limbă → limba,
 *   ș → s), hyphens read as spaces.
 * - Each term scores the weight of the best field it appears in, so a hit in a
 *   title outranks the same hit in a note.
 */

import type {
  Excerpt,
  JournalEntry,
  LibraryArticle,
  ResearchNote,
  ResearchQuestion,
  Study,
  UserSource,
} from '../src/types/index.js';

// ── Normalization ───────────────────────────────────────────────────────────

const COMBINING_MARKS = /[̀-ͯ]/g;
const HYPHENS = /[-‐-―]/g;

export const normalizeText = (text: string): string =>
  text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(HYPHENS, ' ');

/** Normalized, non-empty terms of a query. */
export const queryTerms = (query: string): string[] =>
  normalizeText(query).split(/\s+/).filter((t) => t.length > 0);

// ── Field weights ───────────────────────────────────────────────────────────

/** title > tags > authors/venue > abstract-like prose > notes and excerpts. */
export const WEIGHT = {
  title: 8,
  tags: 6,
  byline: 4,
  abstract: 3,
  body: 1,
} as const;

/**
 * One searchable piece of an item. `group` is the name reported as "matched
 * in"; `id` identifies a sub-item (an excerpt, a hypothesis) when there is one.
 */
export interface SearchField {
  group: string;
  text: string | null | undefined;
  weight: number;
  id?: string;
}

export interface FieldMatch {
  score: number;
  /** Fields containing at least one term, highest weight first. */
  hits: SearchField[];
}

/**
 * Match `terms` against an item's fields. Returns null unless every term is
 * found somewhere on the item.
 */
export const matchFields = (fields: SearchField[], terms: string[]): FieldMatch | null => {
  if (terms.length === 0) return null;
  const normalized = fields.map((f) => (f.text ? normalizeText(f.text) : ''));

  let score = 0;
  for (const term of terms) {
    let best = 0;
    normalized.forEach((text, i) => {
      if (text.includes(term)) best = Math.max(best, fields[i].weight);
    });
    if (best === 0) return null;
    score += best;
  }

  // A field holding the whole query as a phrase is a stronger hit than the same
  // terms scattered across the item.
  const phrase = terms.join(' ');
  if (terms.length > 1) {
    const phraseWeight = Math.max(
      0,
      ...normalized.map((text, i) => (text.includes(phrase) ? fields[i].weight : 0)),
    );
    score += phraseWeight;
  }

  const hits = fields
    .filter((_, i) => terms.some((t) => normalized[i].includes(t)))
    .sort((a, b) => b.weight - a.weight);

  return { score, hits };
};

// ── Excerpts ────────────────────────────────────────────────────────────────

/**
 * A window of `text` around the first matched term. Normalization runs a
 * character at a time so a position in the normalized text maps back to the
 * original even when stripping a diacritic changes the length.
 */
export const excerptAround = (text: string, terms: string[]): string => {
  let normalized = '';
  const origin: number[] = [];
  let pos = 0;
  for (const c of text) {
    const n = normalizeText(c);
    for (let k = 0; k < n.length; k++) origin.push(pos);
    normalized += n;
    pos += c.length;
  }

  let first = -1;
  let firstLength = 0;
  for (const term of terms) {
    const idx = normalized.indexOf(term);
    if (idx !== -1 && (first === -1 || idx < first)) {
      first = idx;
      firstLength = term.length;
    }
  }
  if (first === -1) return text.length > 120 ? text.slice(0, 120) + '...' : text;

  const matchStart = origin[first];
  const matchEnd = origin[first + firstLength - 1] + 1;
  const start = Math.max(0, matchStart - 40);
  const end = Math.min(text.length, matchEnd + 80);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt += '...';
  return excerpt;
};

/** The excerpt for a match: around the first term in its best field. */
export const matchExcerpt = (match: FieldMatch, terms: string[]): string =>
  excerptAround(match.hits[0]?.text ?? '', terms);

// ── What each kind of item searches ─────────────────────────────────────────

export const questionFields = (q: ResearchQuestion): SearchField[] => [
  { group: 'question', text: q.q, weight: WEIGHT.title },
  ...q.tags.map((t) => ({ group: 'tags', text: t, weight: WEIGHT.tags })),
  { group: 'why', text: q.why, weight: WEIGHT.abstract },
  { group: 'appImplication', text: q.appImplication, weight: WEIGHT.abstract },
];

export const noteFields = (note: ResearchNote): SearchField[] => [
  { group: 'content', text: note.content, weight: WEIGHT.body },
];

export const sourceFields = (source: UserSource): SearchField[] => [
  { group: 'text', text: source.text, weight: WEIGHT.abstract },
  { group: 'notes', text: source.notes, weight: WEIGHT.body },
];

const excerptFields = (e: Excerpt): SearchField[] => [
  { group: 'excerpts', text: e.quote, weight: WEIGHT.body, id: e.id },
  { group: 'excerpts', text: e.comment, weight: WEIGHT.body, id: e.id },
];

export const articleFields = (a: LibraryArticle): SearchField[] => [
  { group: 'title', text: a.title, weight: WEIGHT.title },
  ...a.tags.map((t) => ({ group: 'tags', text: t, weight: WEIGHT.tags })),
  ...a.authors.map((name) => ({ group: 'authors', text: name, weight: WEIGHT.byline })),
  { group: 'journal', text: a.journal, weight: WEIGHT.byline },
  { group: 'abstract', text: a.abstract, weight: WEIGHT.abstract },
  { group: 'notes', text: a.notes, weight: WEIGHT.body },
  ...a.excerpts.flatMap(excerptFields),
];

export const entryFields = (e: JournalEntry): SearchField[] => [
  ...e.tags.map((t) => ({ group: 'tags', text: t, weight: WEIGHT.tags })),
  { group: 'content', text: e.content, weight: WEIGHT.body },
];

export const studyFields = (s: Study): SearchField[] => [
  { group: 'title', text: s.title, weight: WEIGHT.title },
  { group: 'description', text: s.description, weight: WEIGHT.abstract },
  { group: 'design', text: s.design, weight: WEIGHT.abstract },
  ...s.hypotheses.map((h) => ({
    group: 'hypotheses',
    text: h.statement,
    weight: WEIGHT.body,
    id: h.id,
  })),
  ...s.decisions.flatMap((d) => [
    { group: 'decisions', text: d.decision, weight: WEIGHT.body, id: d.id },
    { group: 'decisions', text: d.rationale, weight: WEIGHT.body, id: d.id },
    { group: 'decisions', text: d.alternativesRejected, weight: WEIGHT.body, id: d.id },
  ]),
];

/** Distinct `group` names among a match's hits, in field order of weight. */
export const matchedGroups = (match: FieldMatch): string[] => [
  ...new Set(match.hits.map((h) => h.group)),
];

/** Ids of the sub-items (excerpts, hypotheses, decisions) a match touched. */
export const matchedIds = (match: FieldMatch, group: string): Set<string> =>
  new Set(match.hits.filter((h) => h.group === group && h.id).map((h) => h.id as string));
