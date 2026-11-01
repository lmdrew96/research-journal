import type { Excerpt, Provenance } from '../types';

/** Display labels, in the order pickers list them. See Provenance in types. */
export const provenanceOptions: ReadonlyArray<{ value: Provenance; label: string }> = [
  { value: 'nae', label: 'Nae' },
  { value: 'coru', label: 'Coru' },
  { value: 'convergent', label: 'Both, independently' },
  { value: 'external', label: 'Outside source' },
];

export const provenanceLabel = (value: Provenance): string =>
  provenanceOptions.find((o) => o.value === value)?.label ?? value;

/**
 * Who an excerpt's comment came from. A stored origin wins. Unset, it is Nae's:
 * she writes her comments in Marginalia, the clipper or the app, and older
 * Marginalia syncs arrived as source 'api'. The exception is an excerpt Coru
 * added through the MCP, which may be Coru's idea, so it stays unrecorded
 * rather than guessed.
 */
export const excerptOrigin = (e: Pick<Excerpt, 'provenance' | 'source'>): Provenance | undefined =>
  e.provenance ?? (e.source === 'mcp' ? undefined : 'nae');
