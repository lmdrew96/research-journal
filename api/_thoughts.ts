import type { Project, Thought } from '../src/types/index.js';

/**
 * Thoughts, shared by the app, the MCP and the sync layer — the same way
 * `_connections.ts` and `_design-items.ts` are shared.
 *
 * Links are client ids. The relational side keeps a link only while its
 * target exists (the join writers guard with EXISTS), so a link to a deleted
 * article simply drops out; canonicalizeBlob applies the same rule from the
 * blob's side. Writers still strip links on delete (`withoutThoughtLinksTo`)
 * so the app's own state doesn't carry dead ids, and so Undo can restore them.
 */

export function isWellFormedThought(t: unknown): t is Thought {
  return !!t && typeof t === 'object' && typeof (t as Thought).id === 'string' && (t as Thought).id !== '';
}

/** Sets `thoughts`, leaving the key off entirely when there are none. */
export function withThoughts<P extends Pick<Project, 'thoughts'>>(p: P, list: Thought[]): P {
  if (list.length > 0) return { ...p, thoughts: list };
  if (!('thoughts' in p)) return p;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { thoughts: _gone, ...rest } = p;
  return rest as P;
}

/** One thought with every link into `ids` removed. Same object when nothing changed. */
function stripLinks(t: Thought, ids: ReadonlySet<string>): Thought {
  const articleIds = t.articleIds.filter((id) => !ids.has(id));
  const questionIds = t.questionIds.filter((id) => !ids.has(id));
  const studyId = t.studyId && ids.has(t.studyId) ? null : t.studyId;
  if (articleIds.length === t.articleIds.length && questionIds.length === t.questionIds.length && studyId === t.studyId) {
    return t;
  }
  return { ...t, articleIds, questionIds, studyId };
}

/**
 * The project with every thought link into `ids` removed — the delete
 * cascade for articles, questions and studies. Returns the thoughts it
 * changed, as they were, so an Undo can put the links back.
 */
export function withoutThoughtLinksTo<P extends Pick<Project, 'thoughts'>>(
  p: P,
  ids: ReadonlySet<string>,
): { project: P; before: Thought[] } {
  const list = p.thoughts ?? [];
  const before: Thought[] = [];
  const next = list.map((t) => {
    const stripped = stripLinks(t, ids);
    if (stripped !== t) before.push(t);
    return stripped;
  });
  return before.length === 0 ? { project: p, before } : { project: withThoughts(p, next), before };
}

/**
 * Puts back the links an Undo is restoring: for each saved thought that still
 * exists, re-adds the links it had (keeping anything added since).
 */
export function withThoughtLinksRestored<P extends Pick<Project, 'thoughts'>>(p: P, saved: Thought[]): P {
  if (saved.length === 0) return p;
  const byId = new Map(saved.map((t) => [t.id, t]));
  let changed = false;
  const next = (p.thoughts ?? []).map((t) => {
    const s = byId.get(t.id);
    if (!s) return t;
    changed = true;
    return {
      ...t,
      articleIds: [...new Set([...t.articleIds, ...s.articleIds])],
      questionIds: [...new Set([...t.questionIds, ...s.questionIds])],
      studyId: t.studyId ?? s.studyId,
    };
  });
  return changed ? withThoughts(p, next) : p;
}

/** In place, for the server writers (MCP), which mutate what they read. Returns how many changed. */
export function pruneThoughtLinksTo(project: Pick<Project, 'thoughts'>, ids: ReadonlySet<string>): number {
  const { project: next, before } = withoutThoughtLinksTo(project, ids);
  if (before.length > 0) project.thoughts = next.thoughts;
  return before.length;
}

/** Thoughts linked to one article, question or study. */
export function thoughtsAbout(
  project: Pick<Project, 'thoughts'>,
  target: { articleId?: string; questionId?: string; studyId?: string },
): Thought[] {
  return (project.thoughts ?? []).filter(
    (t) =>
      (target.articleId !== undefined && t.articleIds.includes(target.articleId)) ||
      (target.questionId !== undefined && t.questionIds.includes(target.questionId)) ||
      (target.studyId !== undefined && t.studyId === target.studyId),
  );
}
