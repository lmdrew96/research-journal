import Icon from './Icon';

interface StarToggleProps {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Shortlist toggle.
 *
 * State is carried by the icon's SHAPE (filled vs outline), not by colour or
 * the gold glow alone, so it survives a monochrome or low-vision view. The
 * inactive star used to sit at 0.3 opacity, which read as disabled rather than
 * as an off switch — it is now legible enough to look like something you can
 * press.
 *
 * `aria-pressed` states it properly for assistive tech; the accessible name no
 * longer lives in a hover `title`.
 */
export default function StarToggle({ active, onClick }: StarToggleProps) {
  return (
    <button
      type="button"
      className={`star-toggle ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Remove from shortlist' : 'Add to shortlist'}
    >
      <Icon name={active ? 'star-filled' : 'star'} size={18} />
    </button>
  );
}
