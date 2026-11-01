import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A "…" button that opens a small panel of secondary actions. Closes on a
 * click outside or Escape; `children` gets `close` for items that should shut
 * it (an item that shows progress in place can leave it open).
 */
export default function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="action-menu" ref={root}>
      <button
        type="button"
        className="btn btn-sm"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        …
      </button>
      {open && <div className="action-menu-panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}
