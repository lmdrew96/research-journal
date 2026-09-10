import type { AppUserData, Project, ResearchTheme } from '../types/index.js';
import type { Op, UpsertOp, MoveOp, DeleteOp } from '../types/ops.js';

/**
 * Turns a (prev, next) pair from a persist updater into entity-level ops.
 *
 * This is the whole reason none of the 50 persist call sites had to change: the
 * updaters were already pure functions of previous state, so the delta can be
 * recovered by comparing their input and output rather than by asking every
 * mutation to describe itself.
 *
 * The comparison granularity deliberately matches `buildDiffQueries` in
 * api/_decomposer.ts. Both walk the same tree and stop at the same entities, so
 * `applyOps(base, diffToOps(prev, next))` and `decompose(next)` land the same
 * rows — which is exactly what scripts/smoke-ops.mts asserts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Order-independent JSON, so key ordering never registers as a change. */
function canon(v: unknown): string {
  return (
    JSON.stringify(v, (_k, val) =>
      val && typeof val === 'object' && !Array.isArray(val)
        ? Object.fromEntries(
            Object.keys(val as Record<string, unknown>)
              .sort()
              .map((k) => [k, (val as Record<string, unknown>)[k]]),
          )
        : val,
    ) ?? 'undefined'
  );
}

const same = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

const byId = <T extends { id: string }>(list: T[] | undefined): Map<string, T> =>
  new Map((list ?? []).map((x) => [x.id, x]));

/** A project's own columns, without the collections hanging off it. */
function projectShell(p: Project) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    color: p.color,
    createdAt: p.createdAt,
    ...(p.deletedAt ? { deletedAt: p.deletedAt } : {}),
  };
}

/** A theme's own columns, without its questions. */
function themeShell(t: ResearchTheme) {
  return {
    id: t.id,
    theme: t.theme,
    color: t.color,
    icon: t.icon,
    description: t.description,
    ...(t.deletedAt ? { deletedAt: t.deletedAt } : {}),
  };
}

function upsert<T extends UpsertOp['type']>(
  type: T,
  id: string,
  position: number,
  entity: unknown,
  projectId?: string,
  parentId?: string,
): UpsertOp {
  return { op: 'upsert', type, id, position, entity, projectId, parentId } as UpsertOp;
}

function del(type: DeleteOp['type'], id: string, projectId?: string): DeleteOp {
  return { op: 'delete', type, id, projectId };
}

function move(type: MoveOp['type'], id: string, position: number, projectId?: string): MoveOp {
  return { op: 'move', type, id, position, projectId };
}

export function diffToOps(prev: AppUserData, next: AppUserData): Op[] {
  const ops: Op[] = [];

  const prevProjects = byId(prev.projects);
  const nextProjects = byId(next.projects);

  // Projects that vanished. The server cascades, so their subtrees need no ops.
  for (const id of prevProjects.keys()) {
    if (!nextProjects.has(id)) ops.push(del('project', id));
  }

  (next.projects ?? []).forEach((p, pIdx) => {
    const before = prevProjects.get(p.id);
    const isNew = !before;

    // Nothing anywhere in this project moved — skip its entire subtree.
    if (before && same(before, p) && prev.projects.indexOf(before) === pIdx) return;

    if (isNew || !same(projectShell(before), projectShell(p))) {
      ops.push(upsert('project', p.id, pIdx, projectShell(p)));
    } else if (prev.projects.indexOf(before) !== pIdx) {
      ops.push(move('project', p.id, pIdx));
    }

    diffThemes(ops, before, p, isNew);
    diffQuestionUserData(ops, before, p, isNew);
    diffList(ops, 'article', before?.library, p.library, p.id, isNew);
    diffList(ops, 'study', before?.studies, p.studies, p.id, isNew);
    diffList(ops, 'journalEntry', before?.journal, p.journal, p.id, isNew);
  });

  // Settings always ride along: lastModified moves on every write, and it is
  // what user_settings stores as the document's timestamp.
  ops.push({
    op: 'settings',
    activeProjectId: next.activeProjectId,
    lastModified: next.lastModified,
    ...(next.preferences ? { preferences: next.preferences } : {}),
    ...(next.viewState ? { viewState: next.viewState } : {}),
  });

  return ops;
}

function diffThemes(ops: Op[], before: Project | undefined, p: Project, isNew: boolean) {
  const prevThemes = byId(before?.themes);
  const nextThemes = byId(p.themes);

  for (const id of prevThemes.keys()) {
    if (!nextThemes.has(id)) ops.push(del('theme', id, p.id));
  }

  (p.themes ?? []).forEach((t, tIdx) => {
    const wasAt = (before?.themes ?? []).findIndex((x) => x.id === t.id);
    const b = prevThemes.get(t.id);
    if (!isNew && b && same(b, t) && wasAt === tIdx) return;

    if (isNew || !b || !same(themeShell(b), themeShell(t))) {
      ops.push(upsert('theme', t.id, tIdx, themeShell(t), p.id));
    } else if (wasAt !== tIdx) {
      ops.push(move('theme', t.id, tIdx, p.id));
    }

    const prevQs = byId(b?.questions);
    const nextQs = byId(t.questions);
    for (const id of prevQs.keys()) {
      if (!nextQs.has(id)) ops.push(del('question', id, p.id));
    }
    (t.questions ?? []).forEach((q, qIdx) => {
      const qWasAt = (b?.questions ?? []).findIndex((x) => x.id === q.id);
      const bq = prevQs.get(q.id);
      if (!isNew && bq && same(bq, q)) {
        if (qWasAt !== qIdx) ops.push(move('question', q.id, qIdx, p.id));
        return;
      }
      ops.push(upsert('question', q.id, qIdx, q, p.id, t.id));
    });
  });
}

function diffQuestionUserData(ops: Op[], before: Project | undefined, p: Project, isNew: boolean) {
  const prevUd = (before?.questions ?? {}) as Record<string, Any>;
  const nextUd = (p.questions ?? {}) as Record<string, Any>;

  for (const [qid, ud] of Object.entries(nextUd)) {
    if (!isNew && same(prevUd[qid], ud)) continue;
    ops.push(upsert('questionUserData', qid, 0, ud, p.id));
  }
  // A removed entry means the question itself went, which cascades. Nothing to emit.
}

/**
 * Flat, project-owned collections: articles, studies, journal entries.
 * All three compare whole-entity and carry their children inside the body.
 */
function diffList(
  ops: Op[],
  type: 'article' | 'study' | 'journalEntry',
  beforeList: Array<{ id: string }> | undefined,
  nextList: Array<{ id: string }> | undefined,
  projectId: string,
  isNew: boolean,
) {
  const prevMap = byId(beforeList);
  const nextMap = byId(nextList);

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) ops.push(del(type, id, projectId));
  }

  (nextList ?? []).forEach((item, idx) => {
    const wasAt = (beforeList ?? []).findIndex((x) => x.id === item.id);
    const b = prevMap.get(item.id);
    if (!isNew && b && same(b, item)) {
      // Content identical — only its ordinal moved, which is 60 bytes rather
      // than the whole entity. Inserting at the head of a list shifts every
      // sibling, so this is the difference between 4KB and 38KB.
      if (wasAt !== idx) ops.push(move(type, item.id, idx, projectId));
      return;
    }
    ops.push(upsert(type, item.id, idx, item, projectId));
  });
}
