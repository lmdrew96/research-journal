import { tagColors } from '../../data/tag-colors';

interface TagPillProps {
  tag: string;
}

export default function TagPill({ tag }: TagPillProps) {
  const color = tagColors[tag] || '#666';
  return (
    <span
      className="tag-pill"
      style={{
        background: color + '20',
        color: color,
      }}
    >
      {tag}
    </span>
  );
}
