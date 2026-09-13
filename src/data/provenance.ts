import type { Provenance } from '../types';

/** Display labels, in the order pickers list them. See Provenance in types. */
export const provenanceOptions: ReadonlyArray<{ value: Provenance; label: string }> = [
  { value: 'nae', label: 'Nae' },
  { value: 'coru', label: 'Coru' },
  { value: 'convergent', label: 'Both, independently' },
  { value: 'external', label: 'Outside source' },
];

export const provenanceLabel = (value: Provenance): string =>
  provenanceOptions.find((o) => o.value === value)?.label ?? value;
