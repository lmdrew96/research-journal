import { useAppVersion } from '../../hooks/useAppVersion';

/**
 * A quiet notice that a newer ThreadNotes has deployed.
 *
 * Offered, never forced: Refresh is one click, Not now holds for the rest of
 * the session. Styled as a sibling of UndoToast but anchored to the opposite
 * corner, so the two can never cover each other.
 */
export default function UpdateToast(): React.ReactElement | null {
  const { updateReady, applying, applyUpdate, dismiss } = useAppVersion();

  if (!updateReady) return null;

  return (
    <div className="undo-toast update-toast" role="status" aria-live="polite">
      <span className="undo-toast-text">A new version of ThreadNotes is available.</span>
      <button
        type="button"
        className="btn btn-sm undo-toast-action"
        onClick={dismiss}
        disabled={applying}
      >
        Not now
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary undo-toast-action"
        onClick={applyUpdate}
        disabled={applying}
      >
        {applying ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  );
}
