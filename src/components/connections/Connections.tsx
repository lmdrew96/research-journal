import { useMemo, useState } from 'react';
import type { ConnectionNodeType, ConnectionRelation, Project, View } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import {
  CONNECTION_RELATIONS,
  RELATION_LABELS,
  resolveConnectionEnd,
  type ResolvedEnd,
} from '../../../api/_connections';
import MarkdownPreview from '../common/MarkdownPreview';
import Icon from '../common/Icon';

/**
 * Connections on one item: the typed "because" edges touching it, in and out,
 * and the short flow that adds one. The same component sits on articles,
 * excerpt cards, questions and hypotheses.
 */

const NODE_TYPE_LABELS: Record<ConnectionNodeType, string> = {
  article: 'Article',
  excerpt: 'Excerpt',
  question: 'Question',
  hypothesis: 'Hypothesis',
  theme: 'Theme',
  study: 'Study',
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Where clicking an endpoint goes. */
function viewForEnd(type: ConnectionNodeType, id: string, end: ResolvedEnd): View {
  switch (type) {
    case 'article':
      return { name: 'article-detail', articleId: id };
    case 'excerpt':
      return { name: 'article-detail', articleId: end.articleId!, excerptId: id };
    case 'question':
      return { name: 'question-detail', questionId: id };
    case 'hypothesis':
    case 'study':
      return { name: 'study-detail', studyId: end.studyId! };
    case 'theme':
      return { name: 'questions' };
  }
}

interface Candidate {
  type: ConnectionNodeType;
  id: string;
  label: string;
}

/** Everything in the project a connection could point at, except the item itself. */
function candidatesIn(project: Project, excludeId: string): Candidate[] {
  const out: Candidate[] = [];
  for (const a of project.library) {
    out.push({ type: 'article', id: a.id, label: a.title });
    for (const e of a.excerpts) {
      out.push({ type: 'excerpt', id: e.id, label: `“${clip(e.quote, 90)}” — ${clip(a.title, 40)}` });
    }
  }
  for (const t of project.themes) {
    if (t.deletedAt) continue;
    out.push({ type: 'theme', id: t.id, label: t.theme });
    for (const q of t.questions) out.push({ type: 'question', id: q.id, label: q.q });
  }
  for (const s of project.studies ?? []) {
    out.push({ type: 'study', id: s.id, label: s.title });
    for (const h of s.hypotheses) {
      out.push({ type: 'hypothesis', id: h.id, label: h.label ? `${h.label}: ${h.statement}` : h.statement });
    }
  }
  return out.filter((c) => c.id !== excludeId);
}

// ── The list ────────────────────────────────────────────────────────────────

// Stable default, so the list's memo doesn't recompute on every render.
const NO_TYPES: ConnectionNodeType[] = [];

export function ConnectionList({
  itemId,
  onNavigate,
  excludeTypes = NO_TYPES,
  onlyTypes,
}: {
  /**
   * The item, or several ids that stand for it — a hypothesis passes its whole
   * revision chain, so a connection made to an earlier version stays visible.
   */
  itemId: string | string[];
  onNavigate: (view: View) => void;
  /** Other-end types shown elsewhere on the page, e.g. excerpts on a question. */
  excludeTypes?: ConnectionNodeType[];
  /** Show only these other-end types. */
  onlyTypes?: ConnectionNodeType[];
}) {
  const { activeProject, connections, deleteConnection } = useUserData();

  const rows = useMemo(() => {
    if (!activeProject) return [];
    const ids = new Set(Array.isArray(itemId) ? itemId : [itemId]);
    return connections.flatMap((c) => {
      const outgoing = ids.has(c.fromId);
      if (!outgoing && !ids.has(c.toId)) return [];
      const otherType = outgoing ? c.toType : c.fromType;
      const otherId = outgoing ? c.toId : c.fromId;
      if (excludeTypes.includes(otherType)) return [];
      if (onlyTypes && !onlyTypes.includes(otherType)) return [];
      const other = resolveConnectionEnd(activeProject, otherType, otherId);
      // An end in the trash or already gone has nothing to show or link to.
      if (!other) return [];
      const reads = RELATION_LABELS[c.relation][outgoing ? 'forward' : 'backward'];
      return [{ c, otherType, otherId, other, reads }];
    });
  }, [activeProject, connections, itemId, excludeTypes, onlyTypes]);

  if (rows.length === 0) return null;

  return (
    <ul className="connection-list">
      {rows.map(({ c, otherType, otherId, other, reads }) => (
        <li key={c.id} className="connection-item">
          <div className="connection-head">
            <span className="connection-relation">{reads}</span>
            <span className="connection-type">{NODE_TYPE_LABELS[otherType]}</span>
            <button
              type="button"
              className="connection-target"
              onClick={() => onNavigate(viewForEnd(otherType, otherId, other))}
            >
              {clip(other.label, 140)}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger-quiet connection-delete"
              onClick={() => deleteConnection(c.id)}
              aria-label="Delete connection"
              title="Delete connection"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
          {c.because && (
            <div className="connection-because">
              <MarkdownPreview content={c.because} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── The flow that adds one ──────────────────────────────────────────────────

/**
 * Every way a relation can read from this item's side. The one-way relations
 * appear twice — "is evidenced by" and "is evidence for" — so Nae can say what
 * she means from whichever item she's on; picking the backward reading just
 * swaps the ends.
 */
const RELATION_CHOICES: { value: string; relation: ConnectionRelation; backward: boolean; label: string }[] =
  CONNECTION_RELATIONS.flatMap((r) => {
    const { forward, backward } = RELATION_LABELS[r];
    const fwd = { value: `${r}:fwd`, relation: r, backward: false, label: forward };
    return forward === backward
      ? [fwd]
      : [fwd, { value: `${r}:back`, relation: r, backward: true, label: backward }];
  });

export function ConnectForm({
  itemType,
  itemId,
  label = 'Connect…',
}: {
  itemType: ConnectionNodeType;
  itemId: string;
  label?: string;
}) {
  const { activeProject, addConnection } = useUserData();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(RELATION_CHOICES[0].value);
  const [typeFilter, setTypeFilter] = useState<ConnectionNodeType | ''>('');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const [because, setBecause] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => (open && activeProject ? candidatesIn(activeProject, itemId) : []),
    [open, activeProject, itemId]
  );
  const needle = search.trim().toLowerCase();
  const shown = candidates.filter(
    (c) => (!typeFilter || c.type === typeFilter) && (!needle || c.label.toLowerCase().includes(needle))
  );
  const picked = candidates.find((c) => `${c.type}:${c.id}` === target);

  const reset = () => {
    setOpen(false);
    setChoice(RELATION_CHOICES[0].value);
    setTypeFilter('');
    setSearch('');
    setTarget('');
    setBecause('');
    setError(null);
  };

  const save = () => {
    if (!picked || !because.trim()) return;
    const how = RELATION_CHOICES.find((c) => c.value === choice) ?? RELATION_CHOICES[0];
    const here = { type: itemType, id: itemId };
    const there = { type: picked.type, id: picked.id };
    const [from, to] = how.backward ? [there, here] : [here, there];
    const id = addConnection({
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      relation: how.relation,
      because,
    });
    if (!id) {
      setError('That connection already exists.');
      return;
    }
    reset();
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-sm connect-open" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="excerpt-form connect-form">
      <label className="connect-field">
        <span className="connect-field-label">This</span>
        <select
          className="status-select connect-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {RELATION_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="connect-field">
        <span className="connect-field-label">…which item?</span>
        <div className="connect-search-row">
          <select
            className="status-select"
            aria-label="Only show this type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ConnectionNodeType | '')}
          >
            <option value="">Anything</option>
            {(Object.keys(NODE_TYPE_LABELS) as ConnectionNodeType[]).map((t) => (
              <option key={t} value={t}>
                {NODE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            aria-label="Search items"
            className="connect-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            autoFocus
          />
        </div>
        <select
          className="status-select connect-select"
          aria-label="Item to connect to"
          size={Math.min(6, Math.max(2, shown.length))}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {shown.map((c) => (
            <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
              {NODE_TYPE_LABELS[c.type]} · {clip(c.label, 120)}
            </option>
          ))}
        </select>
        {shown.length === 0 && <div className="linked-article-hint">Nothing matches.</div>}
      </div>

      <textarea
        aria-label="Because"
        className="excerpt-form-comment"
        value={because}
        onChange={(e) => setBecause(e.target.value)}
        placeholder="Because… (your reasoning — this is what the connection is for)"
      />

      {error && (
        <div className="ai-summary-error" role="alert">
          {error}
        </div>
      )}
      <div className="excerpt-form-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={save}
          disabled={!picked || !because.trim()}
        >
          Save connection
        </button>
        <button type="button" className="btn btn-sm" onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** List plus the add flow — the usual way to drop connections onto an item. */
export default function Connections({
  itemType,
  itemId,
  onNavigate,
  excludeTypes,
}: {
  itemType: ConnectionNodeType;
  itemId: string;
  onNavigate: (view: View) => void;
  excludeTypes?: ConnectionNodeType[];
}) {
  return (
    <div className="connections">
      <ConnectionList itemId={itemId} onNavigate={onNavigate} excludeTypes={excludeTypes} />
      <ConnectForm itemType={itemType} itemId={itemId} />
    </div>
  );
}
