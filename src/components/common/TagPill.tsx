import { tagColors } from '../../data/tag-colors';
import { tagPalette } from '../../lib/tag-color';

interface TagPillProps {
  tag: string;
}

export default function TagPill({ tag }: TagPillProps) {
  // Both themes are emitted as custom properties and CSS picks one, so the
  // colour never depends on reading the resolved theme during render.
  const { lightFg, darkFg, lightBg, darkBg } = tagPalette(tagColors[tag] || '#666666');
  return (
    <span
      className="tag-pill"
      style={
        {
          '--tag-fg-light': lightFg,
          '--tag-fg-dark': darkFg,
          '--tag-bg-light': lightBg,
          '--tag-bg-dark': darkBg,
        } as React.CSSProperties
      }
    >
      {tag}
    </span>
  );
}
