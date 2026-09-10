import { randomUUID } from 'node:crypto';
import type { Op, UpsertOp, MoveOp, DeleteOp, SettingsOp } from '../src/types/ops.js';
import type { IdMaps } from './_id-maps.js';
import {
  upsertProject,
  upsertTheme,
  upsertQuestion,
  upsertArticle,
  upsertStudy,
  upsertJournalEntry,
  writeArticleChildren,
  writeStudyChildren,
  writeSupersededBy,
  writeQuestionUserData,
  writeJournalTags,
  writeLinksForQuestion,
  writeUserSettings,
} from './_decomposer.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * Applies a batch of entity-level ops from the client.
 *
 * Deliberately reuses the decomposer's row writers rather than issuing its own
 * SQL: there are now two ways a write can reach the tables (a whole document,
 * or a delta) and they must produce identical rows. Sharing the emitters is
 * what makes that structural instead of a promise —
 * `scripts/smoke-ops.mts` asserts the two land the same state.
 *
 * Ops arrive in dependency order (projects, themes, questions, per-question
 * data, articles, studies, journal, settings) because `diffToOps` walks the
 * tree in that order. Ids are resolved across the WHOLE batch first, so an
 * article created in the same push can link to a question created beside it.
 */

/** The subset of IdMaps an entity type resolves against. */
const MAP_FOR: Record<UpsertOp['type'] | 'excerpt' | 'note' | 'source' | 'hypothesis' | 'decision', keyof IdMaps> = {
  project: 'projects',
  theme: 'themes',
  question: 'questions',
  questionUserData: 'questions',
  article: 'articles',
  study: 'studies',
  journalEntry: 'journal',
  excerpt: 'excerpts',
  note: 'notes',
  source: 'sources',
  hypothesis: 'hypotheses',
  decision: 'decisions',
};

function arr<T = Any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Every client id in the batch, mapped to its row uuid — reusing the stored one
 * where the entity already exists so identity survives a write.
 *
 * Children are walked too: an article's excerpts and a study's hypotheses ride
 * inside their parent's body, and the decomposer's child writers look them up
 * by client id in this same map.
 */
function resolveBatchIds(ops: Op[], ids: IdMaps): Map<string, string> {
  const uuidOf = new Map<string, string>();

  const take = (clientId: unknown, table: keyof IdMaps) => {
    if (typeof clientId !== 'string' || !clientId || uuidOf.has(clientId)) return;
    uuidOf.set(clientId, ids[table].get(clientId) ?? randomUUID());
  };

  // Everything already stored, so references to untouched entities resolve.
  for (const table of Object.keys(ids) as Array<keyof IdMaps>) {
    if (table === 'tags') continue;
    for (const [clientId, uuid] of ids[table]) uuidOf.set(clientId, uuid);
  }

  for (const op of ops) {
    if (op.op === 'settings' || op.op === 'delete' || op.op === 'move') continue;

    take(op.id, MAP_FOR[op.type]);
    const e = op.entity as Any;

    if (op.type === 'article') {
      for (const x of arr<Any>(e.excerpts)) take(x.id, 'excerpts');
    } else if (op.type === 'study') {
      for (const h of arr<Any>(e.hypotheses)) take(h.id, 'hypotheses');
      for (const d of arr<Any>(e.decisions)) take(d.id, 'decisions');
    } else if (op.type === 'questionUserData') {
      for (const n of arr<Any>(e.notes)) take(n.id, 'notes');
      for (const s of arr<Any>(e.userSources)) take(s.id, 'sources');
    }
  }

  return uuidOf;
}

/** Tag names referenced anywhere in the batch, in first-seen order. */
function tagNamesInOps(ops: Op[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const op of ops) {
    if (op.op !== 'upsert') continue;
    if (op.type !== 'article' && op.type !== 'journalEntry') continue;
    for (const raw of arr((op.entity as Any).tags)) {
      const name = String(raw ?? '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Deletes, written out per type. Children go with their parent via cascade.
 *
 * The table name cannot be interpolated: a tagged template binds `${x}` as a
 * parameter, not an identifier, so a lookup table would produce invalid SQL.
 */
function buildDelete(sql: SqlClient, userId: string, type: DeleteOp['type'], uuid: string): DeferredQuery {
  switch (type) {
    case 'project': return sql`DELETE FROM projects WHERE user_id = ${userId} AND id = ${uuid}`;
    case 'theme': return sql`DELETE FROM themes WHERE id = ${uuid}`;
    case 'question': return sql`DELETE FROM questions WHERE id = ${uuid}`;
    case 'questionUserData': return sql`DELETE FROM question_user_data WHERE question_id = ${uuid}`;
    case 'article': return sql`DELETE FROM library_articles WHERE id = ${uuid}`;
    case 'study': return sql`DELETE FROM studies WHERE id = ${uuid}`;
    case 'journalEntry': return sql`DELETE FROM journal_entries WHERE id = ${uuid}`;
  }
}

/** Repositions one row. Same literal-table reasoning as buildDelete. */
function buildMove(sql: SqlClient, type: MoveOp['type'], uuid: string, position: number): DeferredQuery | null {
  switch (type) {
    case 'project': return sql`UPDATE projects SET position = ${position} WHERE id = ${uuid}`;
    case 'theme': return sql`UPDATE themes SET position = ${position} WHERE id = ${uuid}`;
    case 'question': return sql`UPDATE questions SET position = ${position} WHERE id = ${uuid}`;
    case 'article': return sql`UPDATE library_articles SET position = ${position} WHERE id = ${uuid}`;
    case 'study': return sql`UPDATE studies SET position = ${position} WHERE id = ${uuid}`;
    case 'journalEntry': return sql`UPDATE journal_entries SET position = ${position} WHERE id = ${uuid}`;
    // question_user_data hangs off its question and has no ordinal.
    case 'questionUserData': return null;
  }
}

export interface OpsPlan {
  queries: DeferredQuery[];
  /** Client ids an op referenced that resolve to nothing — a stale delta. */
  unresolved: string[];
}

export function buildOpsQueries(
  sql: SqlClient,
  userId: string,
  ops: Op[],
  ids: IdMaps,
): OpsPlan {
  const queries: DeferredQuery[] = [];
  const unresolved: string[] = [];
  const uuidOf = resolveBatchIds(ops, ids);
  const tagUuid = new Map<string, string>(ids.tags);

  // Tags first — article and journal writes reference them.
  for (const name of tagNamesInOps(ops)) {
    if (tagUuid.has(name)) continue;
    const id = randomUUID();
    tagUuid.set(name, id);
    queries.push(sql`
      INSERT INTO tags (id, user_id, name, color, created_at)
      VALUES (${id}, ${userId}, ${name}, ${null}, now())
      ON CONFLICT (user_id, name) DO NOTHING
    `);
  }

  // Deletes before upserts: a delete can only free up a (parent, client_id)
  // slot, never take one, so doing them first is always safe.
  for (const op of ops) {
    if (op.op !== 'delete') continue;
    const uuid = uuidOf.get(op.id);
    // Already gone is success, not an error — the client and server agree.
    if (!uuid) continue;
    queries.push(buildDelete(sql, userId, op.type, uuid));
  }

  let settings: SettingsOp | null = null;

  for (const op of ops) {
    if (op.op === 'delete') continue;
    if (op.op === 'settings') { settings = op; continue; }

    if (op.op === 'move') {
      const moveUuid = uuidOf.get(op.id);
      if (!moveUuid) { unresolved.push(`${op.type}:${op.id}`); continue; }
      const q = buildMove(sql, op.type, moveUuid, op.position);
      if (q) queries.push(q);
      continue;
    }

    const uuid = uuidOf.get(op.id);
    const projectUuid = op.projectId ? uuidOf.get(op.projectId) : undefined;
    if (!uuid || (op.type !== 'project' && !projectUuid)) {
      unresolved.push(`${op.type}:${op.id}`);
      continue;
    }
    const e = op.entity as Any;

    switch (op.type) {
      case 'project':
        queries.push(upsertProject(sql, uuid, userId, e, op.position));
        break;

      case 'theme':
        queries.push(upsertTheme(sql, uuid, projectUuid!, e, op.position));
        break;

      case 'question': {
        const themeUuid = op.parentId ? uuidOf.get(op.parentId) : undefined;
        if (!themeUuid) { unresolved.push(`question:${op.id} (theme ${op.parentId})`); break; }
        queries.push(upsertQuestion(sql, uuid, themeUuid, e, op.position));
        writeLinksForQuestion(sql, queries, e, uuidOf, false);
        break;
      }

      case 'questionUserData':
        writeQuestionUserData(sql, queries, uuid, e, uuidOf, false);
        break;

      case 'article':
        queries.push(upsertArticle(sql, uuid, projectUuid!, e, op.position));
        writeArticleChildren(sql, queries, uuid, e, uuidOf, tagUuid, false);
        break;

      case 'study':
        queries.push(upsertStudy(sql, uuid, projectUuid!, e, op.position));
        writeStudyChildren(sql, queries, uuid, e, uuidOf, false);
        writeSupersededBy(sql, queries, e, uuidOf);
        break;

      case 'journalEntry':
        queries.push(
          upsertJournalEntry(
            sql, uuid, projectUuid!, e,
            e.questionId ? uuidOf.get(e.questionId) ?? null : null,
            e.themeId ? uuidOf.get(e.themeId) ?? null : null,
            op.position,
          ),
        );
        writeJournalTags(sql, queries, uuid, e, tagUuid, false);
        break;
    }
  }

  // Orphaned tags, matching what the decomposer does after a full pass. Only
  // safe to prune names this batch touched — a name still on an untouched
  // article must stay.
  if (settings) {
    queries.push(
      writeUserSettings(
        sql,
        userId,
        {
          activeProjectId: settings.activeProjectId,
          lastModified: settings.lastModified,
          preferences: settings.preferences ?? null,
          viewState: settings.viewState ?? null,
        },
        uuidOf,
      ),
    );
  }

  return { queries, unresolved };
}
