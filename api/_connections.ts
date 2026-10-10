import type {
  Connection,
  ConnectionNodeType,
  ConnectionRelation,
  Project,
} from '../src/types/index.js';

/**
 * Connections, shared by the app, the MCP and the excerpts API — the same way
 * `_scholar.ts` is shared.
 *
 * Endpoints are client ids, not foreign keys, so nothing cascades on its own.
 * Every writer that deletes an item calls `withoutConnectionsTo` in the same
 * write, which is what keeps a connection from pointing at nothing.
 */

export const CONNECTION_RELATIONS: readonly ConnectionRelation[] = [
  'connects_to',
  'tension_with',
  'instance_of',
  'contradicts',
  'evidenced_by',
];

export const CONNECTION_NODE_TYPES: readonly ConnectionNodeType[] = [
  'article',
  'excerpt',
  'question',
  'hypothesis',
  'theme',
  'study',
];

export const isConnectionRelation = (v: unknown): v is ConnectionRelation =>
  typeof v === 'string' && (CONNECTION_RELATIONS as readonly string[]).includes(v);

export const isConnectionNodeType = (v: unknown): v is ConnectionNodeType =>
  typeof v === 'string' && (CONNECTION_NODE_TYPES as readonly string[]).includes(v);

/**
 * Whether a stored connection can be written at all: an id, two typed ends and
 * a known relation. The decomposer and canonicalizeBlob both keep only these,
 * so a malformed entry is dropped identically on both sides instead of failing
 * the database's CHECK and aborting the whole write.
 */
export function isWellFormedConnection(c: unknown): c is Connection {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  return (
    typeof x.id === 'string' && x.id !== '' &&
    isConnectionNodeType(x.fromType) && typeof x.fromId === 'string' && x.fromId !== '' &&
    isConnectionNodeType(x.toType) && typeof x.toId === 'string' && x.toId !== '' &&
    isConnectionRelation(x.relation)
  );
}

/**
 * How a relation reads from each end. `forward` is from the `from` item's
 * side ("this contradicts that"), `backward` from the `to` item's side.
 * The symmetric relations read the same both ways.
 */
export const RELATION_LABELS: Record<ConnectionRelation, { forward: string; backward: string }> = {
  connects_to: { forward: 'connects to', backward: 'connects to' },
  tension_with: { forward: 'in tension with', backward: 'in tension with' },
  instance_of: { forward: 'is an instance of', backward: 'has an instance in' },
  contradicts: { forward: 'contradicts', backward: 'contradicts' },
  evidenced_by: { forward: 'is evidenced by', backward: 'is evidence for' },
};

/** Connections with either end on any of `ids`. */
export function connectionsTouching(
  project: Pick<Project, 'connections'>,
  ids: ReadonlySet<string>,
): Connection[] {
  return (project.connections ?? []).filter((c) => ids.has(c.fromId) || ids.has(c.toId));
}

/** Sets `connections`, leaving the key off entirely when there are none. */
export function withConnections<P extends Pick<Project, 'connections'>>(p: P, list: Connection[]): P {
  if (list.length > 0) return { ...p, connections: list };
  if (!('connections' in p)) return p;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { connections: _gone, ...rest } = p;
  return rest as P;
}

/** The project without any connection touching `ids` — the delete cascade. */
export function withoutConnectionsTo<P extends Pick<Project, 'connections'>>(
  p: P,
  ids: ReadonlySet<string>,
): P {
  const list = p.connections ?? [];
  const kept = list.filter((c) => !ids.has(c.fromId) && !ids.has(c.toId));
  return kept.length === list.length ? p : withConnections(p, kept);
}

/** Puts back connections an undo is restoring, skipping any already present. */
export function withConnectionsRestored<P extends Pick<Project, 'connections'>>(
  p: P,
  restored: Connection[],
): P {
  if (restored.length === 0) return p;
  const present = new Set((p.connections ?? []).map((c) => c.id));
  const missing = restored.filter((c) => !present.has(c.id));
  return missing.length === 0 ? p : withConnections(p, [...(p.connections ?? []), ...missing]);
}

/** Where an endpoint lives, for a label and a link. Null when it no longer exists. */
export interface ResolvedEnd {
  label: string;
  /** The article holding it — set for articles and excerpts. */
  articleId?: string;
  /** The study holding it — set for studies and hypotheses. */
  studyId?: string;
}

/**
 * Finds a connection endpoint in a project. Items in a soft-deleted theme
 * resolve to null, the same as items that are gone: the app hides them.
 */
export function resolveConnectionEnd(
  project: Project,
  type: ConnectionNodeType,
  id: string,
): ResolvedEnd | null {
  switch (type) {
    case 'article': {
      const a = project.library.find((x) => x.id === id);
      return a ? { label: a.title, articleId: a.id } : null;
    }
    case 'excerpt': {
      for (const a of project.library) {
        const e = a.excerpts.find((x) => x.id === id);
        if (e) return { label: e.quote, articleId: a.id };
      }
      return null;
    }
    case 'question': {
      for (const t of project.themes) {
        if (t.deletedAt) continue;
        const q = t.questions.find((x) => x.id === id);
        if (q) return { label: q.q };
      }
      return null;
    }
    case 'theme': {
      const t = project.themes.find((x) => x.id === id && !x.deletedAt);
      return t ? { label: t.theme } : null;
    }
    case 'study': {
      const s = (project.studies ?? []).find((x) => x.id === id);
      return s ? { label: s.title, studyId: s.id } : null;
    }
    case 'hypothesis': {
      for (const s of project.studies ?? []) {
        const h = s.hypotheses.find((x) => x.id === id);
        if (h) return { label: h.label ? `${h.label}: ${h.statement}` : h.statement, studyId: s.id };
      }
      return null;
    }
  }
}

/**
 * `withoutConnectionsTo`, in place — for the server writers (the MCP and the
 * excerpts API), which mutate the project they read. Returns how many went.
 */
export function pruneConnectionsTo(project: Pick<Project, 'connections'>, ids: ReadonlySet<string>): number {
  const list = project.connections ?? [];
  const kept = list.filter((c) => !ids.has(c.fromId) && !ids.has(c.toId));
  if (kept.length === list.length) return 0;
  if (kept.length > 0) project.connections = kept;
  else delete project.connections;
  return list.length - kept.length;
}

/**
 * Linking an article or adding a note moves a question still at "Not started"
 * to "Exploring". Forward only; a status set by hand is never overridden. The
 * app applies the same rule (startQuestion in src/hooks/useUserData.tsx); the MCP
 * and the excerpts API share this one.
 * Returns true when it moved the question.
 */
export const startQuestion = (project: Project, questionId: string): boolean => {
  const existing = project.questions[questionId];
  if (existing && existing.status !== 'not_started') return false;
  // In place, like the server writers' other mutations: callers may hold a
  // reference to this question's user data.
  if (existing) existing.status = 'exploring';
  else project.questions[questionId] = { status: 'exploring', starred: false, notes: [], userSources: [], searchPhrases: [] };
  return true;
};
