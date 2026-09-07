import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createId } from '../lib/ids';

/**
 * A single reversible deletion.
 *
 * `onUndo` puts the item back where it was — restore is targeted rather than a
 * whole-state rollback, so anything the user did in the meantime survives.
 */
export interface UndoEntry {
  id: string;
  /** Names the deleted thing, e.g. `Deleted note "the first line…"`. */
  description: string;
  onUndo: () => void;
}

/**
 * Ten seconds. The spec floor is eight: differences in processing speed are the
 * entire reason undo exists here, so this is not a place to be brisk.
 */
export const UNDO_WINDOW_MS = 10_000;

interface UndoContextValue {
  entries: UndoEntry[];
  pushUndo: (entry: Omit<UndoEntry, 'id'>) => void;
  undoAll: () => void;
  dismiss: () => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Mirror of `entries` for undoAll to read. A state updater must stay pure —
  // StrictMode double-invokes them, which would run every restore twice.
  const entriesRef = useRef<UndoEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const pushUndo = useCallback((entry: Omit<UndoEntry, 'id'>) => {
    const id = createId();
    setEntries((prev) => [...prev, { ...entry, id }]);
    // Each entry expires on its own clock, so a second delete does not extend
    // the window on the first one.
    const timer = setTimeout(() => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }, UNDO_WINDOW_MS);
    timersRef.current.push(timer);
  }, []);

  const undoAll = useCallback(() => {
    const pending = entriesRef.current;
    // Reverse chronological: a later delete can depend on an earlier one having
    // already happened, so unwind in the opposite order.
    for (let i = pending.length - 1; i >= 0; i--) pending[i].onUndo();
    setEntries([]);
    clearTimers();
  }, [clearTimers]);

  const dismiss = useCallback(() => {
    setEntries([]);
    clearTimers();
  }, [clearTimers]);

  const value = useMemo(
    () => ({ entries, pushUndo, undoAll, dismiss }),
    [entries, pushUndo, undoAll, dismiss],
  );

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used within UndoProvider');
  return ctx;
}

/** Trim user text down to something that fits in a toast without wrapping. */
export function describeItem(kind: string, name: string | null | undefined): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return `Deleted ${kind}.`;
  const short = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  return `Deleted ${kind} “${short}”.`;
}
