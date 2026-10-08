// Marginalia is the reader: ThreadNotes papers open there, and highlights come
// back as excerpts through /api/excerpts. Overridable for a local Marginalia.
const MARGINALIA_URL: string =
  (import.meta.env.VITE_MARGINALIA_URL as string | undefined) || 'https://marginalia.adhdesigns.dev';

/**
 * Opens a ThreadNotes article in Marginalia's reader. Marginalia resolves it
 * against this account's library, fetches the PDF the first time, and marks
 * the paper "reading".
 */
export const marginaliaReadUrl = (articleId: string): string =>
  `${MARGINALIA_URL}/threadnotes/open/${encodeURIComponent(articleId)}`;
