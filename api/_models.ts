/**
 * The Claude models ThreadNotes calls. Every model string lives here so an
 * upgrade is one edit. Shared by the browser services and the serverless
 * functions, the same way `_scholar.ts` is.
 *
 * Haiku for the quick, cheap calls (summaries, search phrases); Sonnet where a
 * slip would mislead quietly — whole-PDF reading and cross-paper citation.
 */
export const HAIKU_MODEL = 'claude-haiku-5-5';
export const SONNET_MODEL = 'claude-sonnet-5-5';
