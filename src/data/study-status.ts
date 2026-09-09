import type { StudyStatus } from '../types';

/**
 * Study status metadata, shared by the studies index and detail views.
 *
 * Kept out of the view files so both can import it without either becoming a
 * mixed module — and so the labels stay identical wherever status is shown.
 */
export const studyStatusOptions: { value: StudyStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'collecting', label: 'Collecting data' },
  { value: 'analyzing', label: 'Analyzing' },
  { value: 'complete', label: 'Complete' },
  { value: 'abandoned', label: 'Abandoned' },
];

export const studyStatusLabels: Record<StudyStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  collecting: 'Collecting data',
  analyzing: 'Analyzing',
  complete: 'Complete',
  abandoned: 'Abandoned',
};

export const studyStatusColors: Record<StudyStatus, string> = {
  planned: 'var(--status-not-started)',
  in_progress: 'var(--status-exploring)',
  collecting: 'var(--theme-ai-tech)',
  analyzing: 'var(--status-has-findings)',
  complete: 'var(--status-concluded)',
  abandoned: 'var(--text-ghost)',
};
