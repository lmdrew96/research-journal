/**
 * Revision chains for hypotheses and decisions.
 *
 * Lifted out of StudyDetailView so the markdown export walks a chain the same
 * way the screen does. The rule about which row carries a step's rationale is
 * subtle enough (see below) that two independent implementations would drift.
 */

export interface Revision {
  id: string;
  supersededBy: string | null;
}

export interface Chain<T> {
  /** The newest row — what gets listed. */
  current: T;
  /** Every version, oldest → newest. Length 1 when nothing was superseded. */
  history: T[];
}

/**
 * Orders a set of hypotheses or decisions into revision chains.
 *
 * Pointers run forward (v1.supersededBy = v2.id), so a chain's head is the row
 * nothing else points at.
 *
 * The `seen` guard means a cycle truncates rather than hanging — the schema
 * permits one and a bad write could create one.
 */
export function buildChains<T extends Revision>(items: T[]): Chain<T>[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pointedAt = new Set(items.map((i) => i.supersededBy).filter((id): id is string => !!id));

  return items
    .filter((i) => !pointedAt.has(i.id))
    .map((head) => {
      const history: T[] = [head];
      const seen = new Set([head.id]);
      let cursor = head;
      while (cursor.supersededBy) {
        const next = byId.get(cursor.supersededBy);
        if (!next || seen.has(next.id)) break;
        history.push(next);
        seen.add(next.id);
        cursor = next;
      }
      return { current: history[history.length - 1], history };
    });
}
