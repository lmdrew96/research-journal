import Icon from './Icon';

interface StarToggleProps {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export default function StarToggle({ active, onClick }: StarToggleProps) {
  return (
    <button
      className={`star-toggle ${active ? 'active' : ''}`}
      onClick={onClick}
      style={{ opacity: active ? 1 : 0.3 }}
      title={active ? 'Remove from shortlist' : 'Add to shortlist'}
    >
      <Icon name={active ? 'star-filled' : 'star'} size={18} />
    </button>
  );
}