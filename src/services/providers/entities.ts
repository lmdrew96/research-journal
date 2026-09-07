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
