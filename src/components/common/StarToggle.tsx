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
      &#x2605;
    </button>
  );
}
