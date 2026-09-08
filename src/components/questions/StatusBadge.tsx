import type { QuestionStatus } from '../../types';

const statusConfig: Record<QuestionStatus, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: 'var(--status-not-started)' },
  exploring: { label: 'Exploring', color: 'var(--status-exploring)' },
  has_findings: { label: 'Has findings', color: 'var(--status-has-findings)' },
  concluded: { label: 'Concluded', color: 'var(--status-concluded)' },
};

interface StatusBadgeProps {
  status: QuestionStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  // Colour comes from CSS keyed on data-status. Doing it inline meant building
  // `config.color + '18'` for the background — but config.color is a var()
  // reference, not a hex, so that produced invalid CSS and no background.
  return (
    <span className="status-badge" data-status={status}>
      <span className="status-badge-dot" />
      {config.label}
    </span>
  );
}
