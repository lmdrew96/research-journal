// Marginalia is the reader: ThreadNotes papers open there, and highlights come
// back as excerpts through /api/excerpts. Overridable for a local Marginalia.
const MARGINALIA_URL: string =
  (import.meta.env.VITE_MARGINALIA_URL as string | undefined) || 'https://marginalia.adhdesigns.dev';

/**
 * Opens a ThreadNotes article in Marginalia's reader. Marginalia resolves it
 * against this account's library, fetches the PDF the first time, and marks
 * the paper "reading".
 */
/**
 * Opens Marginalia's reader at the highlight an excerpt came from. Only for
 * excerpts with source 'marginalia': Marginalia finds the highlight by the
 * threadnotes_excerpt_id it stored when it created the excerpt.
 */
export const marginaliaExcerptUrl = (excerptId: string): string =>
  `${MARGINALIA_URL}/threadnotes/excerpt/${encodeURIComponent(excerptId)}`;

export const marginaliaReadUrl = (articleId: string): string =>
  `${MARGINALIA_URL}/threadnotes/open/${encodeURIComponent(articleId)}`;
