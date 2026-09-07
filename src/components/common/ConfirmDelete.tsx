import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

interface ConfirmDeleteProps {
  /** What is being deleted, e.g. "note" — used in the confirmation copy. */
  label: string;
  onConfirm: () => void;
  /**
   * Compact trigger for dense rows: icon plus the bare word "Delete", instead
   * of the default "Delete {label}". Still carries a visible word — a lone
   * glyph would put the meaning in a hover tooltip, which touch never shows.
   */
  compact?: boolean;
}

/**
 * Two-step delete.
 *
 * The app has no undo, so anything destructive needs a stop. Three surfaces
 * already hand-rolled this pattern and five others deleted on a single click —
 * including notes and journal entries, which are the user's own writing and the
 * least recoverable content here. This is the one implementation.
 *
 * Confirmation copy names the thing being deleted rather than saying "Are you
 * sure?", so it is unambiguous which row is about to go.
 */
export default function ConfirmDelete({
  label,
  onConfirm,
  compact = false,
}: ConfirmDeleteProps): React.ReactElement {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirm button so keyboard users aren't stranded on a
  // trigger that just vanished.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  // Escape backs out — the same key that dismisses every other transient UI.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  if (confirming) {
    return (
      <span className="delete-confirm">
        <span className="delete-confirm-text">Delete this {label}?</span>
        <button
          ref={confirmRef}
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          Yes, delete
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-sm btn-danger${compact ? ' btn-labelled' : ''}`}
      aria-label={`Delete ${label}`}
      onClick={() => setConfirming(true)}
    >
      {compact ? (
        <>
          <Icon name="trash" size={13} />
          Delete
        </>
      ) : (
        `Delete ${label}`
      )}
    </button>
  );
}
