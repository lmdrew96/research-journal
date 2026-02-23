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
  return (
    <span
      className="status-badge"
      style={{
        background: config.color + '18',
        color: config.color,
      }}
    >
      <span
        className="status-badge-dot"
        style={{ background: config.color }}
      />
      {config.label}
    </span>
  );
}
