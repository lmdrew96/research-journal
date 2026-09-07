import { useUndo } from '../../hooks/useUndo';

/**
 * The undo affordance for deletions, offered at the moment of the delete.
 *
 * Collapses rather than stacks: several deletes in the same window become one
 * "3 items deleted" toast, and Undo restores all of them. A wall of toasts is
 * its own kind of pressure, which is the opposite of the point.
 */
export default function UndoToast() {
  const { entries, undoAll, dismiss } = useUndo();

  if (entries.length === 0) return null;

  const message =
    entries.length === 1
      ? entries[0].description
      : `${entries.length} items deleted.`;

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-text">{message}</span>
      <button type="button" className="btn btn-sm undo-toast-action" onClick={undoAll}>
        Undo
      </button>
      <button
        type="button"
        className="undo-toast-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        {'\u00D7'}
      </button>
    </div>
  );
}
