import type { StudyStatus } from '../../types';
import { studyStatusColors, studyStatusLabels } from '../../data/study-status';

/**
 * Status as a coloured dot plus its label in text.
 *
 * The label is not optional: colour alone would put the meaning out of reach
 * for anyone who can't separate these hues, and the dot is small enough that
 * hue is hard to read even when you can.
 */
export default function StudyStatusBadge({
  status,
}: {
  status: StudyStatus;
}): React.ReactElement {
  return (
    <span className="study-status-badge" style={{ color: studyStatusColors[status] }}>
      <span className="study-status-dot" style={{ background: studyStatusColors[status] }} />
      {studyStatusLabels[status]}
    </span>
  );
}
