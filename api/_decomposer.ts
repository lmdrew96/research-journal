import { randomUUID } from 'node:crypto';
import { buildRecomposeQueries, assembleAppUserData, canonicalizeBlob } from './_recomposer.js';
import { buildIdMapQueries, assembleIdMaps, type IdMaps } from './_id-maps.js';

// neon's `transaction()` has tightly bounded generics that don't compose
// across module boundaries cleanly; use `any` for the tag-template client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const QUESTION_STATUSES = new Set(['not_started', 'exploring', 'has_findings', 'concluded']);
const ARTICLE_STATUSES = new Set(['to-read', 'reading', 'done', 'key-source']);
const EXCERPT_SOURCES = new Set(['manual', 'extension', 'api']);
const STUDY_STATUSES = new Set([
  'planned',
  'in_progress',
  'collecting',
  'analyzing',
  'complete',
  'abandoned',
]);
const HYPOTHESIS_STATUSES = new Set(['active', 'superseded', 'retired']);
const DECISION_STATUSES = new Set(['open', 'settled', 'superseded']);

function newId(): string {
  return randomUUID();
}

function isoOrNow(v: unknown): string {
  if (typeof v === 'string' && v) return v;
  return new Date().toISOString();
}

function isoOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function arr<T = Any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Order-independent JSON, so two objects that differ only in key order compare
 * equal. Both sides of every comparison here come out of the recomposer's
 * normalizers (`canonicalizeBlob` for the incoming blob, `assembleAppUserData`
 * for what is stored), so this is only guarding against key ordering, not
 * against genuine shape differences.
 */
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

// ── Row writers ─────────────────────────────────────────────────────────────
//
// Every write is an upsert keyed on the (parent, client_id) unique index each
// entity table carries. Shared by both paths below so the two can never drift
// on what a row actually looks like.

export function upsertProject(sql: SqlClient, uuid: string, userId: string, p: Any, pos: number) {
  return sql`
    INSERT INTO projects (id, client_id, user_id, name, description, icon, color, position, created_at, updated_at, deleted_at)
    VALUES (${uuid}, ${strOrNull(p.id)}, ${userId}, ${p.name ?? 'Untitled'}, ${p.description ?? ''},
            ${p.icon ?? 'brain'}, ${p.color ?? '#7B61FF'}, ${pos},
            ${isoOrNow(p.createdAt)}, ${isoOrNow(p.createdAt)}, ${isoOrNull(p.deletedAt)})
    ON CONFLICT (user_id, client_id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
      color = EXCLUDED.color, position = EXCLUDED.position, created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at
  `;
}

export function upsertTheme(sql: SqlClient, uuid: string, projectUuid: string, t: Any, pos: number) {
  return sql`
    INSERT INTO themes (id, client_id, project_id, name, color, icon, description, position, deleted_at)
    VALUES (${uuid}, ${strOrNull(t.id)}, ${projectUuid}, ${t.theme ?? t.name ?? 'Untitled theme'},
            ${t.color ?? '#7B61FF'}, ${t.icon ?? 'circle'},
            ${t.description ?? ''}, ${pos}, ${isoOrNull(t.deletedAt)})
    ON CONFLICT (project_id, client_id) DO UPDATE SET
      name = EXCLUDED.name, color = EXCLUDED.color, icon = EXCLUDED.icon,
      description = EXCLUDED.description, position = EXCLUDED.position,
      deleted_at = EXCLUDED.deleted_at
  `;
}

export function upsertQuestion(sql: SqlClient, uuid: string, themeUuid: string, q: Any, pos: number) {
  return sql`
    INSERT INTO questions (id, client_id, theme_id, text, why, app_implication, seed_tags, seed_sources, position)
    VALUES (${uuid}, ${strOrNull(q.id)}, ${themeUuid}, ${q.q ?? q.text ?? ''},
            ${q.why ?? ''}, ${q.appImplication ?? ''},
            ${JSON.stringify(arr(q.tags))}::jsonb,
            ${JSON.stringify(arr(q.sources))}::jsonb,
            ${pos})
    ON CONFLICT (theme_id, client_id) DO UPDATE SET
      text = EXCLUDED.text, why = EXCLUDED.why, app_implication = EXCLUDED.app_implication,
      seed_tags = EXCLUDED.seed_tags, seed_sources = EXCLUDED.seed_sources,
      position = EXCLUDED.position
  `;
}

export function upsertQuestionUserData(sql: SqlClient, questionUuid: string, u: Any) {
  const status = QUESTION_STATUSES.has(u?.status) ? u.status : 'not_started';
  return sql`
    INSERT INTO question_user_data (question_id, status, starred, search_phrases, updated_at)
    VALUES (${questionUuid}, ${status}, ${!!u?.starred},
            ${JSON.stringify(arr<string>(u?.searchPhrases))}::jsonb, now())
    ON CONFLICT (question_id) DO UPDATE SET
      status = EXCLUDED.status, starred = EXCLUDED.starred,
      search_phrases = EXCLUDED.search_phrases, updated_at = now()
  `;
}

export function upsertNote(sql: SqlClient, uuid: string, questionUuid: string, n: Any, pos: number) {
  return sql`
    INSERT INTO research_notes (id, client_id, question_id, content, position, created_at, updated_at)
    VALUES (${uuid}, ${strOrNull(n.id)}, ${questionUuid}, ${n.content ?? ''}, ${pos},
            ${isoOrNow(n.createdAt)}, ${isoOrNow(n.updatedAt ?? n.createdAt)})
    ON CONFLICT (question_id, client_id) DO UPDATE SET
      content = EXCLUDED.content, position = EXCLUDED.position,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  `;
}

export function upsertSource(sql: SqlClient, uuid: string, questionUuid: string, s: Any, pos: number) {
  return sql`
    INSERT INTO user_sources (id, client_id, question_id, text, doi, url, notes, position, added_at)
    VALUES (${uuid}, ${strOrNull(s.id)}, ${questionUuid}, ${s.text ?? ''},
            ${s.doi ?? null}, ${s.url ?? null}, ${s.notes ?? ''}, ${pos},
            ${isoOrNow(s.addedAt)})
    ON CONFLICT (question_id, client_id) DO UPDATE SET
      text = EXCLUDED.text, doi = EXCLUDED.doi, url = EXCLUDED.url,
      notes = EXCLUDED.notes, position = EXCLUDED.position, added_at = EXCLUDED.added_at
  `;
}

export function upsertArticle(sql: SqlClient, uuid: string, projectUuid: string, a: Any, pos: number) {
  const status = ARTICLE_STATUSES.has(a.status) ? a.status : 'to-read';
  return sql`
    INSERT INTO library_articles (id, client_id, project_id, title, authors, year, journal, doi, url,
                                  abstract, notes, status, ai_summary, is_open_access,
                                  unpaywall_url, unpaywall_checked_at, position, saved_at, updated_at)
    VALUES (${uuid}, ${strOrNull(a.id)}, ${projectUuid}, ${a.title ?? 'Untitled'},
            ${JSON.stringify(arr<string>(a.authors))}::jsonb,
            ${typeof a.year === 'number' ? a.year : null},
            ${a.journal ?? null}, ${a.doi ?? null}, ${a.url ?? null},
            ${a.abstract ?? null}, ${a.notes ?? ''}, ${status},
            ${a.aiSummary ?? null}, ${!!a.isOpenAccess},
            ${a.unpaywallUrl ?? null}, ${a.unpaywallCheckedAt ?? null}, ${pos},
            ${isoOrNow(a.savedAt)}, ${isoOrNow(a.updatedAt ?? a.savedAt)})
    ON CONFLICT (project_id, client_id) DO UPDATE SET
      title = EXCLUDED.title, authors = EXCLUDED.authors, year = EXCLUDED.year,
      journal = EXCLUDED.journal, doi = EXCLUDED.doi, url = EXCLUDED.url,
      abstract = EXCLUDED.abstract, notes = EXCLUDED.notes, status = EXCLUDED.status,
      ai_summary = EXCLUDED.ai_summary, is_open_access = EXCLUDED.is_open_access,
      unpaywall_url = EXCLUDED.unpaywall_url, unpaywall_checked_at = EXCLUDED.unpaywall_checked_at,
      position = EXCLUDED.position, saved_at = EXCLUDED.saved_at, updated_at = EXCLUDED.updated_at
  `;
}

export function upsertExcerpt(sql: SqlClient, uuid: string, articleUuid: string, e: Any, pos: number) {
  const source = EXCERPT_SOURCES.has(e.source) ? e.source : 'manual';
  return sql`
    INSERT INTO excerpts (id, client_id, article_id, quote, comment, source, position, created_at)
    VALUES (${uuid}, ${strOrNull(e.id)}, ${articleUuid}, ${e.quote ?? ''},
            ${e.comment ?? ''}, ${source}, ${pos}, ${isoOrNow(e.createdAt)})
    ON CONFLICT (article_id, client_id) DO UPDATE SET
      quote = EXCLUDED.quote, comment = EXCLUDED.comment, source = EXCLUDED.source,
      position = EXCLUDED.position, created_at = EXCLUDED.created_at
  `;
}

export function upsertStudy(sql: SqlClient, uuid: string, projectUuid: string, s: Any, pos: number) {
  const status = STUDY_STATUSES.has(s.status) ? s.status : 'planned';
  return sql`
    INSERT INTO studies (id, client_id, project_id, title, status, description, design, position, created_at, updated_at)
    VALUES (${uuid}, ${strOrNull(s.id)}, ${projectUuid}, ${s.title ?? 'Untitled study'},
            ${status}, ${s.description ?? ''}, ${s.design ?? ''}, ${pos},
            ${isoOrNow(s.createdAt)}, ${isoOrNow(s.updatedAt ?? s.createdAt)})
    ON CONFLICT (project_id, client_id) DO UPDATE SET
      title = EXCLUDED.title, status = EXCLUDED.status, description = EXCLUDED.description,
      design = EXCLUDED.design, position = EXCLUDED.position,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  `;
}

/** `superseded_by` is always written null here and resolved in a later pass. */
export function upsertHypothesis(
  sql: SqlClient, uuid: string, studyUuid: string, h: Any, questionFk: string | null, pos: number,
) {
  const status = HYPOTHESIS_STATUSES.has(h.status) ? h.status : 'active';
  return sql`
    INSERT INTO hypotheses (id, client_id, study_id, label, statement, status, superseded_by, question_id, position, created_at, updated_at)
    VALUES (${uuid}, ${strOrNull(h.id)}, ${studyUuid}, ${strOrNull(h.label)},
            ${h.statement ?? ''}, ${status}, ${null}, ${questionFk}, ${pos},
            ${isoOrNow(h.createdAt)}, ${isoOrNow(h.updatedAt ?? h.createdAt)})
    ON CONFLICT (study_id, client_id) DO UPDATE SET
      label = EXCLUDED.label, statement = EXCLUDED.statement, status = EXCLUDED.status,
      superseded_by = NULL, question_id = EXCLUDED.question_id, position = EXCLUDED.position,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  `;
}

export function upsertDecision(
  sql: SqlClient, uuid: string, studyUuid: string, d: Any, hypothesisFk: string | null, pos: number,
) {
  const status = DECISION_STATUSES.has(d.status) ? d.status : 'open';
  return sql`
    INSERT INTO decisions (id, client_id, study_id, hypothesis_id, decision, alternatives_rejected,
                           rationale, status, superseded_by, position, created_at, updated_at)
    VALUES (${uuid}, ${strOrNull(d.id)}, ${studyUuid}, ${hypothesisFk},
            ${d.decision ?? ''}, ${strOrNull(d.alternativesRejected)}, ${strOrNull(d.rationale)},
            ${status}, ${null}, ${pos},
            ${isoOrNow(d.createdAt)}, ${isoOrNow(d.updatedAt ?? d.createdAt)})
    ON CONFLICT (study_id, client_id) DO UPDATE SET
      hypothesis_id = EXCLUDED.hypothesis_id, decision = EXCLUDED.decision,
      alternatives_rejected = EXCLUDED.alternatives_rejected, rationale = EXCLUDED.rationale,
      status = EXCLUDED.status, superseded_by = NULL, position = EXCLUDED.position,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  `;
}

export function upsertJournalEntry(
  sql: SqlClient, uuid: string, projectUuid: string, e: Any,
  questionFk: string | null, themeFk: string | null, pos: number,
) {
  return sql`
    INSERT INTO journal_entries (id, client_id, project_id, content, question_id, theme_id, position, created_at, updated_at)
    VALUES (${uuid}, ${strOrNull(e.id)}, ${projectUuid}, ${e.content ?? ''},
            ${questionFk}, ${themeFk}, ${pos},
            ${isoOrNow(e.createdAt)}, ${isoOrNow(e.updatedAt ?? e.createdAt)})
    ON CONFLICT (project_id, client_id) DO UPDATE SET
      content = EXCLUDED.content, question_id = EXCLUDED.question_id,
      theme_id = EXCLUDED.theme_id, position = EXCLUDED.position,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
  `;
}

// ── Id resolution ───────────────────────────────────────────────────────────

/**
 * Assigns every entity in the blob the uuid it already has in Postgres, or a
 * fresh one if it is new.
 *
 * Done for the whole blob before anything is emitted, because cross-references
 * point forward as often as back: a question can relate to one in a later
 * theme, a hypothesis is superseded by a later hypothesis, an article links to
 * a question in another project's theme.
 */
function resolveIds(blob: Any, ids: IdMaps | null): Map<string, string> {
  const map = new Map<string, string>();
  const take = (clientId: unknown, table: keyof IdMaps) => {
    if (typeof clientId !== 'string' || !clientId) return;
    map.set(clientId, ids?.[table].get(clientId) ?? newId());
  };

  for (const p of arr<Any>(blob?.projects)) {
    take(p.id, 'projects');
    for (const t of arr<Any>(p.themes)) {
      take(t.id, 'themes');
      for (const q of arr<Any>(t.questions)) take(q.id, 'questions');
    }
    const ud = p.questions && typeof p.questions === 'object' ? p.questions : {};
    for (const u of Object.values<Any>(ud)) {
      for (const n of arr<Any>(u?.notes)) take(n.id, 'notes');
      for (const s of arr<Any>(u?.userSources)) take(s.id, 'sources');
    }
    for (const a of arr<Any>(p.library)) {
      take(a.id, 'articles');
      for (const e of arr<Any>(a.excerpts)) take(e.id, 'excerpts');
    }
    for (const s of arr<Any>(p.studies)) {
      take(s.id, 'studies');
      for (const h of arr<Any>(s.hypotheses)) take(h.id, 'hypotheses');
      for (const d of arr<Any>(s.decisions)) take(d.id, 'decisions');
    }
    for (const j of arr<Any>(p.journal)) take(j.id, 'journal');
  }
  return map;
}

/** Every tag name the blob references, in first-seen order. */
export function tagNamesIn(blob: Any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown) => {
    const name = String(raw ?? '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  for (const p of arr<Any>(blob?.projects)) {
    for (const a of arr<Any>(p.library)) for (const t of arr(a.tags)) add(t);
    for (const j of arr<Any>(p.journal)) for (const t of arr(j.tags)) add(t);
  }
  return out;
}

// ── Per-entity child writes ─────────────────────────────────────────────────
//
// Join tables carry no client_id — there is no identity to preserve — so they
// are rebuilt for the one parent that changed rather than diffed.

export function writeArticleChildren(
  sql: SqlClient, out: DeferredQuery[], articleUuid: string, a: Any,
  uuidOf: Map<string, string>, tagUuid: Map<string, string>, fresh: boolean,
) {
  const excerpts = arr<Any>(a.excerpts);
  excerpts.forEach((e, i) => {
    const id = uuidOf.get(e.id);
    if (id) out.push(upsertExcerpt(sql, id, articleUuid, e, i));
  });
  if (!fresh) {
    const keep = excerpts.map((e) => e.id).filter(Boolean);
    out.push(
      keep.length > 0
        ? sql`DELETE FROM excerpts WHERE article_id = ${articleUuid} AND (client_id IS NULL OR NOT (client_id = ANY(${keep})))`
        : sql`DELETE FROM excerpts WHERE article_id = ${articleUuid}`,
    );
  }

  if (!fresh) out.push(sql`DELETE FROM article_question_links WHERE article_id = ${articleUuid}`);
  arr<string>(a.linkedQuestions).forEach((qid, i) => {
    const q = uuidOf.get(qid);
    if (!q) return;
    out.push(sql`
      INSERT INTO article_question_links (article_id, question_id, position)
      VALUES (${articleUuid}, ${q}, ${i}) ON CONFLICT DO NOTHING
    `);
  });

  if (!fresh) out.push(sql`DELETE FROM article_tags WHERE article_id = ${articleUuid}`);
  arr(a.tags).forEach((raw, i) => {
    const id = tagUuid.get(String(raw ?? '').trim());
    if (!id) return;
    out.push(sql`
      INSERT INTO article_tags (article_id, tag_id, position)
      VALUES (${articleUuid}, ${id}, ${i}) ON CONFLICT DO NOTHING
    `);
  });
}

export function writeStudyChildren(
  sql: SqlClient, out: DeferredQuery[], studyUuid: string, s: Any,
  uuidOf: Map<string, string>, fresh: boolean,
) {
  const hypotheses = arr<Any>(s.hypotheses);
  hypotheses.forEach((h, i) => {
    const id = uuidOf.get(h.id);
    if (id) out.push(upsertHypothesis(sql, id, studyUuid, h, h.questionId ? uuidOf.get(h.questionId) ?? null : null, i));
  });
  if (!fresh) {
    const keepH = hypotheses.map((h) => h.id).filter(Boolean);
    out.push(
      keepH.length > 0
        ? sql`DELETE FROM hypotheses WHERE study_id = ${studyUuid} AND (client_id IS NULL OR NOT (client_id = ANY(${keepH})))`
        : sql`DELETE FROM hypotheses WHERE study_id = ${studyUuid}`,
    );
  }

  const decisions = arr<Any>(s.decisions);
  decisions.forEach((d, i) => {
    const id = uuidOf.get(d.id);
    if (id) out.push(upsertDecision(sql, id, studyUuid, d, d.hypothesisId ? uuidOf.get(d.hypothesisId) ?? null : null, i));
  });
  if (!fresh) {
    const keepD = decisions.map((d) => d.id).filter(Boolean);
    out.push(
      keepD.length > 0
        ? sql`DELETE FROM decisions WHERE study_id = ${studyUuid} AND (client_id IS NULL OR NOT (client_id = ANY(${keepD})))`
        : sql`DELETE FROM decisions WHERE study_id = ${studyUuid}`,
    );
    out.push(sql`DELETE FROM study_questions WHERE study_id = ${studyUuid}`);
  }
  arr<string>(s.linkedQuestions).forEach((qid, i) => {
    const q = uuidOf.get(qid);
    if (!q) return;
    out.push(sql`
      INSERT INTO study_questions (study_id, question_id, position)
      VALUES (${studyUuid}, ${q}, ${i}) ON CONFLICT DO NOTHING
    `);
  });
}

/** superseded_by points forward up a revision chain, so it needs its own pass. */
export function writeSupersededBy(sql: SqlClient, out: DeferredQuery[], s: Any, uuidOf: Map<string, string>) {
  for (const h of arr<Any>(s.hypotheses)) {
    const from = uuidOf.get(h.id);
    const to = h.supersededBy ? uuidOf.get(h.supersededBy) : null;
    if (from && to && to !== from) out.push(sql`UPDATE hypotheses SET superseded_by = ${to} WHERE id = ${from}`);
  }
  for (const d of arr<Any>(s.decisions)) {
    const from = uuidOf.get(d.id);
    const to = d.supersededBy ? uuidOf.get(d.supersededBy) : null;
    if (from && to && to !== from) out.push(sql`UPDATE decisions SET superseded_by = ${to} WHERE id = ${from}`);
  }
}

export function writeQuestionUserData(
  sql: SqlClient, out: DeferredQuery[], questionUuid: string, u: Any,
  uuidOf: Map<string, string>, fresh: boolean,
) {
  out.push(upsertQuestionUserData(sql, questionUuid, u));

  const notes = arr<Any>(u?.notes);
  notes.forEach((n, i) => {
    const id = uuidOf.get(n.id);
    if (id) out.push(upsertNote(sql, id, questionUuid, n, i));
  });
  if (!fresh) {
    const keepN = notes.map((n) => n.id).filter(Boolean);
    out.push(
      keepN.length > 0
        ? sql`DELETE FROM research_notes WHERE question_id = ${questionUuid} AND (client_id IS NULL OR NOT (client_id = ANY(${keepN})))`
        : sql`DELETE FROM research_notes WHERE question_id = ${questionUuid}`,
    );
  }

  const sources = arr<Any>(u?.userSources);
  sources.forEach((s, i) => {
    const id = uuidOf.get(s.id);
    if (id) out.push(upsertSource(sql, id, questionUuid, s, i));
  });
  if (!fresh) {
    const keepS = sources.map((s) => s.id).filter(Boolean);
    out.push(
      keepS.length > 0
        ? sql`DELETE FROM user_sources WHERE question_id = ${questionUuid} AND (client_id IS NULL OR NOT (client_id = ANY(${keepS})))`
        : sql`DELETE FROM user_sources WHERE question_id = ${questionUuid}`,
    );
  }
}

export function writeJournalTags(
  sql: SqlClient, out: DeferredQuery[], entryUuid: string, e: Any,
  tagUuid: Map<string, string>, fresh: boolean,
) {
  if (!fresh) out.push(sql`DELETE FROM journal_entry_tags WHERE journal_entry_id = ${entryUuid}`);
  arr(e.tags).forEach((raw, i) => {
    const id = tagUuid.get(String(raw ?? '').trim());
    if (!id) return;
    out.push(sql`
      INSERT INTO journal_entry_tags (journal_entry_id, tag_id, position)
      VALUES (${entryUuid}, ${id}, ${i}) ON CONFLICT DO NOTHING
    `);
  });
}

export function writeUserSettings(sql: SqlClient, userId: string, blob: Any, uuidOf: Map<string, string>) {
  const activeProjectFk = blob?.activeProjectId ? uuidOf.get(blob.activeProjectId) ?? null : null;
  // Display preferences and remembered view state ride along in one JSONB
  // column. Opaque UI state — nothing queries or joins on it.
  const prefs =
    blob?.preferences || blob?.viewState
      ? JSON.stringify({ preferences: blob.preferences ?? null, viewState: blob.viewState ?? null })
      : null;
  return sql`
    INSERT INTO user_settings (user_id, active_project_id, last_modified, preferences, updated_at)
    VALUES (${userId}, ${activeProjectFk}, ${strOrNull(blob?.lastModified)}, ${prefs}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET
      active_project_id = EXCLUDED.active_project_id, last_modified = EXCLUDED.last_modified,
      preferences = EXCLUDED.preferences, updated_at = now()
  `;
}

// ── Full rebuild ────────────────────────────────────────────────────────────

/**
 * Writes the entire tree, having first deleted whatever was there.
 *
 * The fallback path: used when there is no relational copy to diff against, or
 * when it can't be trusted to represent the blob (pre-client_id rows, non-v4
 * data). Correct but expensive — cost scales with total data size, not edit
 * size — so the diff path below handles the steady state.
 */
function buildFullRebuildQueries(sql: SqlClient, userId: string, blob: Any): DeferredQuery[] {
  const out: DeferredQuery[] = [];
  const uuidOf = resolveIds(blob, null);
  const tagUuid = new Map<string, string>();

  // Order matters: tags and user_settings aren't cascaded by projects.
  out.push(sql`DELETE FROM tags WHERE user_id = ${userId}`);
  out.push(sql`DELETE FROM user_settings WHERE user_id = ${userId}`);
  out.push(sql`DELETE FROM projects WHERE user_id = ${userId}`);

  for (const name of tagNamesIn(blob)) {
    const id = newId();
    tagUuid.set(name, id);
    out.push(sql`
      INSERT INTO tags (id, user_id, name, color, created_at)
      VALUES (${id}, ${userId}, ${name}, ${null}, now())
      ON CONFLICT (user_id, name) DO NOTHING
    `);
  }

  arr<Any>(blob?.projects).forEach((p, pIdx) => {
    const projectUuid = uuidOf.get(p.id)!;
    out.push(upsertProject(sql, projectUuid, userId, p, pIdx));

    arr<Any>(p.themes).forEach((t, tIdx) => {
      const themeUuid = uuidOf.get(t.id)!;
      out.push(upsertTheme(sql, themeUuid, projectUuid, t, tIdx));
      arr<Any>(t.questions).forEach((q, qIdx) => {
        out.push(upsertQuestion(sql, uuidOf.get(q.id)!, themeUuid, q, qIdx));
      });
    });

    writeQuestionLinks(sql, out, p, uuidOf, true);

    const ud = p.questions && typeof p.questions === 'object' ? p.questions : {};
    for (const [qid, u] of Object.entries<Any>(ud)) {
      const questionUuid = uuidOf.get(qid);
      if (questionUuid) writeQuestionUserData(sql, out, questionUuid, u, uuidOf, true);
    }

    arr<Any>(p.library).forEach((a, aIdx) => {
      const articleUuid = uuidOf.get(a.id)!;
      out.push(upsertArticle(sql, articleUuid, projectUuid, a, aIdx));
      writeArticleChildren(sql, out, articleUuid, a, uuidOf, tagUuid, true);
    });

    arr<Any>(p.studies).forEach((s, sIdx) => {
      const studyUuid = uuidOf.get(s.id)!;
      out.push(upsertStudy(sql, studyUuid, projectUuid, s, sIdx));
      writeStudyChildren(sql, out, studyUuid, s, uuidOf, true);
    });
    for (const s of arr<Any>(p.studies)) writeSupersededBy(sql, out, s, uuidOf);

    arr<Any>(p.journal).forEach((e, jIdx) => {
      const entryUuid = uuidOf.get(e.id)!;
      out.push(
        upsertJournalEntry(
          sql, entryUuid, projectUuid, e,
          e.questionId ? uuidOf.get(e.questionId) ?? null : null,
          e.themeId ? uuidOf.get(e.themeId) ?? null : null,
          jIdx,
        ),
      );
      writeJournalTags(sql, out, entryUuid, e, tagUuid, true);
    });
  });

  out.push(writeUserSettings(sql, userId, blob, uuidOf));
  return out;
}

/**
 * Rebuilds question_links for one project.
 *
 * Stored exactly as the blob holds them (both directions), so the recomposer
 * reproduces each array without inferring anything.
 */
function writeQuestionLinks(
  sql: SqlClient, out: DeferredQuery[], p: Any, uuidOf: Map<string, string>, fresh: boolean,
) {
  for (const t of arr<Any>(p.themes)) {
    for (const q of arr<Any>(t.questions)) {
      writeLinksForQuestion(sql, out, q, uuidOf, fresh);
    }
  }
}

/** Rebuilds one question's outgoing links. Shared with the ops path. */
export function writeLinksForQuestion(
  sql: SqlClient, out: DeferredQuery[], q: Any, uuidOf: Map<string, string>, fresh: boolean,
) {
  const from = uuidOf.get(q.id);
  if (!from) return;
  if (!fresh) out.push(sql`DELETE FROM question_links WHERE question_id = ${from}`);
  arr<string>(q.relatedQuestions).forEach((rid, i) => {
    const to = uuidOf.get(rid);
    if (!to || to === from) return;
    out.push(sql`
      INSERT INTO question_links (question_id, related_question_id, position)
      VALUES (${from}, ${to}, ${i}) ON CONFLICT DO NOTHING
    `);
  });
}

// ── Differential ────────────────────────────────────────────────────────────

/**
 * Writes only what actually changed.
 *
 * Both sides are normalized to the same shape first — `canonicalizeBlob` for
 * the incoming blob, `assembleAppUserData` for what is stored — which is the
 * round trip `scripts/verify-relational.mts` asserts. That guarantee is what
 * makes skipping safe: if an entity compares equal, the stored rows already
 * reproduce it exactly.
 */
function buildDiffQueries(
  sql: SqlClient, userId: string, blob: Any, incoming: Any, current: Any, ids: IdMaps,
): DeferredQuery[] {
  const out: DeferredQuery[] = [];
  const uuidOf = resolveIds(blob, ids);
  const tagUuid = new Map<string, string>(ids.tags);

  // Tags first — article and journal writes reference them.
  const wanted = tagNamesIn(blob);
  for (const name of wanted) {
    if (tagUuid.has(name)) continue;
    const id = newId();
    tagUuid.set(name, id);
    out.push(sql`
      INSERT INTO tags (id, user_id, name, color, created_at)
      VALUES (${id}, ${userId}, ${name}, ${null}, now())
      ON CONFLICT (user_id, name) DO NOTHING
    `);
  }
  const wantedSet = new Set(wanted);
  const orphanTags = [...ids.tags.keys()].filter((n) => !wantedSet.has(n));
  if (orphanTags.length > 0) {
    out.push(sql`DELETE FROM tags WHERE user_id = ${userId} AND name = ANY(${orphanTags})`);
  }

  const currentProjects = new Map<string, Any>(arr<Any>(current.projects).map((p) => [p.id, p]));
  const incomingProjects = new Map<string, Any>(arr<Any>(incoming.projects).map((p) => [p.id, p]));

  // Projects that are gone. Cascade removes their whole subtree.
  const goneProjects = [...currentProjects.keys()]
    .filter((id) => !incomingProjects.has(id))
    .map((id) => ids.projects.get(id))
    .filter((u): u is string => !!u);
  if (goneProjects.length > 0) {
    out.push(sql`DELETE FROM projects WHERE user_id = ${userId} AND id = ANY(${goneProjects}::uuid[])`);
  }

  arr<Any>(blob?.projects).forEach((p, pIdx) => {
    const inc = incomingProjects.get(p.id);
    const cur = currentProjects.get(p.id);
    const curIdx = arr<Any>(current.projects).findIndex((c: Any) => c.id === p.id);

    // Nothing in this project moved — skip its entire subtree.
    if (cur && inc && curIdx === pIdx && same(inc, cur)) return;

    const projectUuid = uuidOf.get(p.id)!;
    const projectIsNew = !cur;

    // The project row itself: only touch it if its own fields or position moved.
    if (projectIsNew || curIdx !== pIdx || !same(projectShell(inc), projectShell(cur))) {
      out.push(upsertProject(sql, projectUuid, userId, p, pIdx));
    }

    diffThemes(sql, out, p, inc, cur, projectUuid, uuidOf, ids, projectIsNew);
    diffQuestionUserData(sql, out, p, inc, cur, uuidOf, projectIsNew);
    diffArticles(sql, out, p, inc, cur, projectUuid, uuidOf, ids, tagUuid, projectIsNew);
    diffStudies(sql, out, p, inc, cur, projectUuid, uuidOf, ids, projectIsNew);
    diffJournal(sql, out, p, inc, cur, projectUuid, uuidOf, ids, tagUuid, projectIsNew);
  });

  // Always last, always one query: lastModified changes on every write.
  out.push(writeUserSettings(sql, userId, blob, uuidOf));
  return out;
}

/**
 * A project's own columns, without the collections hanging off it — so a change
 * inside `library` doesn't force a needless rewrite of the `projects` row.
 * Mirrors the fields `canonicalizeBlob` and `assembleAppUserData` both emit.
 */
function projectShell(p: Any): Any {
  if (!p) return null;
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

/** A theme's own columns, without its questions. Same rationale. */
function themeShell(t: Any): Any {
  if (!t) return null;
  return {
    id: t.id,
    theme: t.theme,
    color: t.color,
    icon: t.icon,
    description: t.description,
    ...(t.deletedAt ? { deletedAt: t.deletedAt } : {}),
  };
}

function byId(list: unknown): Map<string, Any> {
  return new Map(arr<Any>(list).map((x) => [x.id, x]));
}

function indexOfId(list: unknown, id: string): number {
  return arr<Any>(list).findIndex((x) => x.id === id);
}

function diffThemes(
  sql: SqlClient, out: DeferredQuery[], p: Any, inc: Any, cur: Any,
  projectUuid: string, uuidOf: Map<string, string>, ids: IdMaps, projectIsNew: boolean,
) {
  const incThemes = byId(inc?.themes);
  const curThemes = byId(cur?.themes);

  const gone = [...curThemes.keys()]
    .filter((id) => !incThemes.has(id))
    .map((id) => ids.themes.get(id))
    .filter((u): u is string => !!u);
  if (gone.length > 0) {
    out.push(sql`DELETE FROM themes WHERE project_id = ${projectUuid} AND id = ANY(${gone}::uuid[])`);
  }

  let anyQuestionChanged = false;

  arr<Any>(p.themes).forEach((t, tIdx) => {
    const i = incThemes.get(t.id);
    const c = curThemes.get(t.id);
    const moved = indexOfId(cur?.themes, t.id) !== tIdx;
    if (!projectIsNew && c && i && !moved && same(i, c)) return;

    const themeUuid = uuidOf.get(t.id)!;
    if (projectIsNew || !c || moved || !same(themeShell(i), themeShell(c))) {
      out.push(upsertTheme(sql, themeUuid, projectUuid, t, tIdx));
    }

    const incQs = byId(i?.questions);
    const curQs = byId(c?.questions);
    const goneQs = [...curQs.keys()]
      .filter((id) => !incQs.has(id))
      .map((id) => ids.questions.get(id))
      .filter((u): u is string => !!u);
    if (goneQs.length > 0) {
      out.push(sql`DELETE FROM questions WHERE theme_id = ${themeUuid} AND id = ANY(${goneQs}::uuid[])`);
    }

    arr<Any>(t.questions).forEach((q, qIdx) => {
      const iq = incQs.get(q.id);
      const cq = curQs.get(q.id);
      const qMoved = indexOfId(c?.questions, q.id) !== qIdx;
      if (!projectIsNew && cq && iq && !qMoved && same(iq, cq)) return;
      out.push(upsertQuestion(sql, uuidOf.get(q.id)!, themeUuid, q, qIdx));
      anyQuestionChanged = true;
    });
  });

  // question_links live on the question rows and can point across themes, so
  // they are rebuilt for the project as a whole once anything moved.
  if (projectIsNew || anyQuestionChanged) writeQuestionLinks(sql, out, p, uuidOf, projectIsNew);
}

function diffQuestionUserData(
  sql: SqlClient, out: DeferredQuery[], p: Any, inc: Any, cur: Any,
  uuidOf: Map<string, string>, projectIsNew: boolean,
) {
  const ud = p.questions && typeof p.questions === 'object' ? p.questions : {};
  const incUd = inc?.questions ?? {};
  const curUd = cur?.questions ?? {};

  for (const [qid, u] of Object.entries<Any>(ud)) {
    const questionUuid = uuidOf.get(qid);
    if (!questionUuid) continue;
    if (!projectIsNew && same(incUd[qid], curUd[qid])) continue;
    writeQuestionUserData(sql, out, questionUuid, u, uuidOf, projectIsNew);
  }
  // A question whose user data disappeared entirely: the row goes with the
  // question when the question is deleted, and an emptied-out entry is written
  // above as defaults. Nothing extra to remove.
}

function diffArticles(
  sql: SqlClient, out: DeferredQuery[], p: Any, inc: Any, cur: Any,
  projectUuid: string, uuidOf: Map<string, string>, ids: IdMaps,
  tagUuid: Map<string, string>, projectIsNew: boolean,
) {
  const incA = byId(inc?.library);
  const curA = byId(cur?.library);

  const gone = [...curA.keys()]
    .filter((id) => !incA.has(id))
    .map((id) => ids.articles.get(id))
    .filter((u): u is string => !!u);
  if (gone.length > 0) {
    out.push(sql`DELETE FROM library_articles WHERE project_id = ${projectUuid} AND id = ANY(${gone}::uuid[])`);
  }

  arr<Any>(p.library).forEach((a, aIdx) => {
    const i = incA.get(a.id);
    const c = curA.get(a.id);
    const moved = indexOfId(cur?.library, a.id) !== aIdx;
    if (!projectIsNew && c && i && !moved && same(i, c)) return;
    const articleUuid = uuidOf.get(a.id)!;
    out.push(upsertArticle(sql, articleUuid, projectUuid, a, aIdx));
    writeArticleChildren(sql, out, articleUuid, a, uuidOf, tagUuid, projectIsNew);
  });
}

function diffStudies(
  sql: SqlClient, out: DeferredQuery[], p: Any, inc: Any, cur: Any,
  projectUuid: string, uuidOf: Map<string, string>, ids: IdMaps, projectIsNew: boolean,
) {
  const incS = byId(inc?.studies);
  const curS = byId(cur?.studies);

  const gone = [...curS.keys()]
    .filter((id) => !incS.has(id))
    .map((id) => ids.studies.get(id))
    .filter((u): u is string => !!u);
  if (gone.length > 0) {
    out.push(sql`DELETE FROM studies WHERE project_id = ${projectUuid} AND id = ANY(${gone}::uuid[])`);
  }

  arr<Any>(p.studies).forEach((s, sIdx) => {
    const i = incS.get(s.id);
    const c = curS.get(s.id);
    const moved = indexOfId(cur?.studies, s.id) !== sIdx;
    if (!projectIsNew && c && i && !moved && same(i, c)) return;
    const studyUuid = uuidOf.get(s.id)!;
    out.push(upsertStudy(sql, studyUuid, projectUuid, s, sIdx));
    writeStudyChildren(sql, out, studyUuid, s, uuidOf, projectIsNew);
    writeSupersededBy(sql, out, s, uuidOf);
  });
}

function diffJournal(
  sql: SqlClient, out: DeferredQuery[], p: Any, inc: Any, cur: Any,
  projectUuid: string, uuidOf: Map<string, string>, ids: IdMaps,
  tagUuid: Map<string, string>, projectIsNew: boolean,
) {
  const incJ = byId(inc?.journal);
  const curJ = byId(cur?.journal);

  const gone = [...curJ.keys()]
    .filter((id) => !incJ.has(id))
    .map((id) => ids.journal.get(id))
    .filter((u): u is string => !!u);
  if (gone.length > 0) {
    out.push(sql`DELETE FROM journal_entries WHERE project_id = ${projectUuid} AND id = ANY(${gone}::uuid[])`);
  }

  arr<Any>(p.journal).forEach((e, jIdx) => {
    const i = incJ.get(e.id);
    const c = curJ.get(e.id);
    const moved = indexOfId(cur?.journal, e.id) !== jIdx;
    if (!projectIsNew && c && i && !moved && same(i, c)) return;
    const entryUuid = uuidOf.get(e.id)!;
    out.push(
      upsertJournalEntry(
        sql, entryUuid, projectUuid, e,
        e.questionId ? uuidOf.get(e.questionId) ?? null : null,
        e.themeId ? uuidOf.get(e.themeId) ?? null : null,
        jIdx,
      ),
    );
    writeJournalTags(sql, out, entryUuid, e, tagUuid, projectIsNew);
  });
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Decomposes an AppUserData blob into the relational tables.
 *
 * Returns deferred neon query objects for `sql.transaction([])`, which runs
 * them as one HTTP round trip and one Postgres transaction.
 *
 * Reads current relational state first so it can write only what changed. That
 * read costs one round trip and replaces a rebuild whose cost scaled with the
 * user's entire dataset — a 50-article account was issuing 553 queries to
 * record a filter change. Falls back to a full rebuild whenever the stored copy
 * can't be trusted to represent the blob, so correctness never depends on the
 * diff being right about an edge case.
 */
export async function buildDecomposeQueries(
  sql: SqlClient,
  userId: string,
  blob: Any,
): Promise<DeferredQuery[]> {
  const incoming = canonicalizeBlob(blob);
  if (!incoming) {
    // Not v4, or missing lastModified — nothing to diff against.
    return buildFullRebuildQueries(sql, userId, blob);
  }

  let current: Any = null;
  let ids: IdMaps | null = null;
  try {
    const recompose = buildRecomposeQueries(sql, userId);
    const results = await sql.transaction([...recompose, ...buildIdMapQueries(sql, userId)]);
    current = assembleAppUserData(results.slice(0, recompose.length));
    ids = assembleIdMaps(results.slice(recompose.length));
  } catch (err) {
    console.warn('[decomposer] Could not read current state, falling back to full rebuild:', err);
    return buildFullRebuildQueries(sql, userId, blob);
  }

  // assembleAppUserData returns null when the relational copy can't faithfully
  // represent the blob (rows predating client_id, no user_settings). Diffing
  // against a copy that is missing things would skip writes it should make.
  if (!current || !ids) return buildFullRebuildQueries(sql, userId, blob);

  return buildDiffQueries(sql, userId, blob, incoming, current, ids);
}

/** The unconditional rebuild, exposed for backfills and tests. */
export { buildFullRebuildQueries };
