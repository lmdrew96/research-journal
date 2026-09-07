import Icon from './Icon';

interface EmptyStateProps {
  /** Name from the Icon set — not an emoji. */
  icon: string;
  text: string;
  /** What to do next. An empty state without a way forward is a dead end. */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Shared empty state.
 *
 * Previously took an emoji string, which the project's icon rules disallow, and
 * offered no action — so every view hand-rolled its own `.empty-state` markup
 * instead and none of them used this. Same markup, Icon-based, with an optional
 * next step.
 */
export default function EmptyState({ icon, text, action }: EmptyStateProps): React.ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={32} />
      </div>
      <p className="empty-state-text">{text}</p>
      {action && (
        <button type="button" className="btn btn-primary empty-state-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
