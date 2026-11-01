import type {
  Connection,
  ConnectionNodeType,
  Decision,
  DesignItem,
  DesignItemFields,
  DesignItemKind,
  DesignItemStatus,
  Project,
  Study,
  VariableRole,
} from '../src/types/index.js';

/**
 * Study design items, shared by the app, the MCP and the sync layer — the same
 * way `_connections.ts` is shared.
 *
 * The one rule that matters for sync: `normalizeDesignFields` is what both the
 * decomposer and canonicalizeBlob store, so a design item round-trips exactly.
 * The app runs it too, so what it holds is what the server will hand back.
 */

export const DESIGN_ITEM_KINDS: readonly DesignItemKind[] = [
  'framework',
  'participants',
  'material',
  'measure',
  'step',
  'variable',
  'cleaning',
  'analysis',
];

/** Sections that hold at most one live item. The rest are lists. */
export const SINGLETON_KINDS: ReadonlySet<DesignItemKind> = new Set([
  'framework',
  'participants',
  'cleaning',
  'analysis',
]);

export const DESIGN_ITEM_STATUSES: readonly DesignItemStatus[] = ['open', 'settled', 'superseded'];

export const VARIABLE_ROLES: readonly VariableRole[] = ['predictor', 'outcome', 'moderator', 'covariate'];

/** Section title for each kind, in the order the Design area shows them. */
export const DESIGN_SECTION_LABELS: Record<DesignItemKind, string> = {
  framework: 'Framework',
  participants: 'Participants',
  material: 'Materials',
  measure: 'Measures',
  step: 'Procedure',
  variable: 'Variables',
  cleaning: 'Response cleaning',
  analysis: 'Analysis',
};

/** What one item of each kind is called. */
export const DESIGN_ITEM_NOUNS: Record<DesignItemKind, string> = {
  framework: 'Framework',
  participants: 'Participants',
  material: 'Material',
  measure: 'Measure',
  step: 'Step',
  variable: 'Variable',
  cleaning: 'Response cleaning',
  analysis: 'Analysis',
};

type FieldKey = keyof DesignItemFields;

/** Plain labels for each field, for the export and anything else that lists them. */
export const DESIGN_FIELD_LABELS: Record<FieldKey, string> = {
  text: 'Notes',
  name: 'Name',
  population: 'Population',
  proficiency: 'Proficiency range',
  languages: 'Languages',
  inclusion: 'Inclusion criteria',
  exclusion: 'Exclusion criteria',
  targetN: 'Target N',
  measures: 'What it measures',
  scoring: 'Scoring',
  minutes: 'Minutes',
  role: 'Role',
};

const STRING_FIELDS: ReadonlySet<FieldKey> = new Set([
  'text',
  'name',
  'population',
  'proficiency',
  'languages',
  'inclusion',
  'exclusion',
  'measures',
  'scoring',
]);
const NUMBER_FIELDS: ReadonlySet<FieldKey> = new Set(['targetN', 'minutes']);

/** Which fields each kind carries. Anything else is dropped on write. */
export const DESIGN_FIELDS_BY_KIND: Record<DesignItemKind, readonly FieldKey[]> = {
  framework: ['text'],
  participants: ['population', 'proficiency', 'languages', 'inclusion', 'exclusion', 'targetN', 'text'],
  material: ['name', 'text'],
  measure: ['name', 'measures', 'scoring', 'text'],
  step: ['name', 'minutes', 'text'],
  variable: ['name', 'role', 'text'],
  cleaning: ['text'],
  analysis: ['text'],
};

/**
 * Where each kind's links may point. `design_item` targets are narrowed by kind
 * in LINK_TARGET_KINDS. A link is a Connection from the item, relation
 * `connects_to`, because ''.
 */
export const LINK_TARGETS: Record<DesignItemKind, readonly ConnectionNodeType[]> = {
  framework: ['article'],
  participants: [],
  material: ['article'],
  measure: ['article'],
  step: [],
  variable: ['design_item', 'hypothesis'],
  cleaning: ['design_item'],
  analysis: ['hypothesis'],
};

/** Which design-item kinds a `design_item` link from each kind may reach. */
export const LINK_TARGET_KINDS: Partial<Record<DesignItemKind, readonly DesignItemKind[]>> = {
  variable: ['measure'],
  cleaning: ['measure'],
};

export const isDesignItemKind = (v: unknown): v is DesignItemKind =>
  typeof v === 'string' && (DESIGN_ITEM_KINDS as readonly string[]).includes(v);

export const isDesignItemStatus = (v: unknown): v is DesignItemStatus =>
  typeof v === 'string' && (DESIGN_ITEM_STATUSES as readonly string[]).includes(v);

const isVariableRole = (v: unknown): v is VariableRole =>
  typeof v === 'string' && (VARIABLE_ROLES as readonly string[]).includes(v);

/**
 * The fields as stored: only the keys this kind carries, strings kept only when
 * non-empty, numbers only when finite and ≥ 0, a role only when it is one.
 * Strings are not trimmed — what Nae typed is what is kept.
 */
export function normalizeDesignFields(kind: DesignItemKind, raw: unknown): DesignItemFields {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: DesignItemFields = {};
  for (const key of DESIGN_FIELDS_BY_KIND[kind]) {
    const v = src[key];
    if (STRING_FIELDS.has(key)) {
      if (typeof v === 'string' && v.trim() !== '') (out as Record<string, unknown>)[key] = v;
    } else if (NUMBER_FIELDS.has(key)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) (out as Record<string, unknown>)[key] = v;
    } else if (key === 'role') {
      if (isVariableRole(v)) out.role = v;
    }
  }
  return out;
}

/** Whether a design item can be written at all — the decomposer and canonicalizer both keep only these. */
export function isWellFormedDesignItem(x: unknown): x is DesignItem {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return typeof d.id === 'string' && d.id !== '' && isDesignItemKind(d.kind);
}

/** A target session length is a positive whole-ish number of minutes; anything else means unset. */
export function isSessionMinutes(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** One line naming an item, e.g. "Measure: Lexical decision task". */
export function designItemLabel(item: DesignItem): string {
  const noun = DESIGN_ITEM_NOUNS[item.kind];
  if (item.fields.name) return `${noun}: ${item.fields.name}`;
  if (item.fields.text) {
    const t = item.fields.text.replace(/\s+/g, ' ').trim();
    return `${noun}: ${t.length > 60 ? `${t.slice(0, 60)}…` : t}`;
  }
  return noun;
}

// ── Revision chains ─────────────────────────────────────────────────────────
//
// The same walk src/lib/revision-chains.ts does, kept here because api/ can't
// import src/lib at runtime. Pointers run forward, so a head is the row nothing
// points at; the `seen` guard truncates a cycle rather than hanging.

export interface DesignChain {
  current: DesignItem;
  /** Oldest → newest. */
  history: DesignItem[];
}

export function designChains(items: DesignItem[]): DesignChain[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pointedAt = new Set(items.map((i) => i.supersededBy).filter((id): id is string => !!id));
  return items
    .filter((i) => !pointedAt.has(i.id))
    .map((head) => {
      const history = [head];
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

/** The live chains of one kind, in array order. */
export function chainsOfKind(study: Study, kind: DesignItemKind): DesignChain[] {
  return designChains((study.designItems ?? []).filter((i) => i.kind === kind));
}

/** Every id in the chain holding `id` (all versions), or just `id` when unknown. */
export function chainIdsOf(items: DesignItem[], id: string): string[] {
  const chain = designChains(items).find((c) => c.history.some((i) => i.id === id));
  return chain ? chain.history.map((i) => i.id) : [id];
}

/**
 * The newest version of the hypothesis `id` belongs to. A variable linked to H1
 * keeps meaning H1 after H1 is revised, so links to hypotheses are read through
 * this rather than re-pointed.
 */
export function currentHypothesisId(study: Pick<Study, 'hypotheses'>, id: string): string {
  const byId = new Map(study.hypotheses.map((h) => [h.id, h]));
  const seen = new Set<string>();
  let cursor = byId.get(id);
  while (cursor?.supersededBy && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const next = byId.get(cursor.supersededBy);
    if (!next) break;
    cursor = next;
  }
  return cursor?.id ?? id;
}

/** Total minutes of the current procedure steps, and how many steps have none. */
export function procedureTotal(study: Study): { minutes: number; unTimed: number } {
  let minutes = 0;
  let unTimed = 0;
  for (const { current } of chainsOfKind(study, 'step')) {
    if (typeof current.fields.minutes === 'number') minutes += current.fields.minutes;
    else unTimed++;
  }
  return { minutes, unTimed };
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Outgoing links from a design item to `toType`, in connection order. */
export function linksFrom(
  project: Pick<Project, 'connections'>,
  itemId: string,
  toType: ConnectionNodeType,
): Connection[] {
  return (project.connections ?? []).filter(
    (c) => c.fromType === 'design_item' && c.fromId === itemId && c.toType === toType,
  );
}

/**
 * The connections list with `itemId`'s links to `toType` replaced by exactly
 * `targetIds`. Links already present keep their id and position; new ones are
 * appended. Pure, given `newId` is: the app passes ids made before its persist
 * updater runs, so a replayed updater lands the same ids.
 */
export function replaceLinks(
  connections: Connection[],
  itemId: string,
  toType: ConnectionNodeType,
  targetIds: string[],
  newId: (toId: string) => string,
  now: string,
): Connection[] {
  const wanted = new Set(targetIds);
  const isSlot = (c: Connection) => c.fromType === 'design_item' && c.fromId === itemId && c.toType === toType;
  const kept = connections.filter((c) => !isSlot(c) || wanted.has(c.toId));
  const have = new Set(kept.filter(isSlot).map((c) => c.toId));
  const added: Connection[] = [...wanted]
    .filter((id) => !have.has(id) && id !== itemId)
    .map((toId) => ({
      id: newId(toId),
      fromType: 'design_item' as const,
      fromId: itemId,
      toType,
      toId,
      relation: 'connects_to' as const,
      because: '',
      createdAt: now,
    }));
  return [...kept, ...added];
}

/**
 * Moves every connection end on `fromId` to `toId` — what a revision does, so
 * a measure's sources and the variables measured by it follow it to its new
 * version. A link is to the thing, not to one wording of it.
 */
export function repointConnections(connections: Connection[], fromId: string, toId: string): Connection[] {
  let changed = false;
  const next = connections.map((c) => {
    if (c.fromId !== fromId && c.toId !== fromId) return c;
    changed = true;
    return {
      ...c,
      ...(c.fromId === fromId ? { fromId: toId } : {}),
      ...(c.toId === fromId ? { toId } : {}),
    };
  });
  return changed ? next : connections;
}

/** Ids of every design item on a study — what a study delete cascades over. */
export function designItemIdsOf(study: Pick<Study, 'designItems'>): string[] {
  return (study.designItems ?? []).map((i) => i.id);
}

/** Finds a design item anywhere in the project, with its study. */
export function findDesignItem(
  project: Pick<Project, 'studies'>,
  id: string,
): { study: Study; item: DesignItem } | null {
  for (const study of project.studies ?? []) {
    const item = (study.designItems ?? []).find((i) => i.id === id);
    if (item) return { study, item };
  }
  return null;
}

// ── Settled vs. open ────────────────────────────────────────────────────────
//
// An item's own `status` is what Nae set; what it SHOWS is that, overridden to
// open while any open decision is attached. So "20–30 cues" can't read as
// settled while "how many cues?" is still open.

/** Open decisions attached to one item. */
export function openDecisionsOn(study: Pick<Study, 'decisions'>, itemId: string): Decision[] {
  return study.decisions.filter((d) => d.status === 'open' && d.designItemId === itemId);
}

export function effectiveStatus(study: Pick<Study, 'decisions'>, item: DesignItem): 'open' | 'settled' {
  if (openDecisionsOn(study, item.id).length > 0) return 'open';
  return item.status === 'settled' ? 'settled' : 'open';
}

/** A section is settled when every current item in it is. */
export function sectionStatus(study: Study, kind: DesignItemKind): 'open' | 'settled' {
  const chains = chainsOfKind(study, kind);
  return chains.length > 0 && chains.every(({ current }) => effectiveStatus(study, current) === 'settled')
    ? 'settled'
    : 'open';
}

/** Fields a settled decision's outcome can be written into: the kind's text and number fields. */
export function fillableFields(kind: DesignItemKind): FieldKey[] {
  return DESIGN_FIELDS_BY_KIND[kind].filter((k) => k !== 'role');
}

export interface SettleOptions {
  /** What was chosen, replacing the decision text (which held the open question). */
  decision?: string;
  rationale?: string;
  /** Write the outcome into this field of the attached item. Numbers are parsed. */
  fillField?: FieldKey;
}

/**
 * The study with one decision settled. If it is attached to a design item, the
 * outcome can be written into one of the item's fields, and the item is marked
 * settled once no other open decision is left on it — "settling a decision
 * updates its item". Pure: shared by the app's persist updater and the MCP.
 *
 * Returns null when a requested fill can't be applied (no item, a field the
 * kind doesn't carry, a number field given text).
 */
export function withDecisionSettled(study: Study, decisionId: string, opts: SettleOptions, now: string): Study | null {
  const target = study.decisions.find((d) => d.id === decisionId);
  if (!target) return study;
  const outcome = opts.decision?.trim() ? opts.decision : target.decision;

  const decisions = study.decisions.map((d) =>
    d.id === decisionId
      ? {
          ...d,
          status: 'settled' as const,
          decision: outcome,
          ...(opts.rationale?.trim() ? { rationale: opts.rationale } : {}),
          updatedAt: now,
        }
      : d,
  );

  const itemId = target.designItemId;
  const item = itemId ? (study.designItems ?? []).find((i) => i.id === itemId) : undefined;
  if (!item) return opts.fillField ? null : { ...study, decisions };

  let fields = item.fields;
  if (opts.fillField) {
    if (!fillableFields(item.kind).includes(opts.fillField)) return null;
    const value: unknown = NUMBER_FIELDS.has(opts.fillField) ? Number(outcome.trim()) : outcome;
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return null;
    fields = normalizeDesignFields(item.kind, { ...item.fields, [opts.fillField]: value });
  }
  const stillOpen = decisions.some((d) => d.status === 'open' && d.designItemId === item.id);
  const designItems = (study.designItems ?? []).map((i) =>
    i.id === item.id
      ? { ...i, fields, ...(stillOpen || i.status === 'superseded' ? {} : { status: 'settled' as const }), updatedAt: now }
      : i,
  );
  return { ...study, decisions, designItems };
}

/**
 * Open decisions on `fromId` move to `toId` — a revision takes its open
 * questions with it, like its links. Settled ones stay: they are about the
 * version they settled.
 */
export function moveOpenDecisions(decisions: Decision[], fromId: string, toId: string): Decision[] {
  let changed = false;
  const next = decisions.map((d) => {
    if (d.status !== 'open' || d.designItemId !== fromId) return d;
    changed = true;
    return { ...d, designItemId: toId };
  });
  return changed ? next : decisions;
}
