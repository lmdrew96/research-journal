import type { AppUserData } from '../src/types/index.js';

// neon's tag-template client has tightly bounded generics that don't compose
// across module boundaries; use `any` like the decomposer does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;

/**
 * Optimistic concurrency for the `app_data` blob.
 *
 * Three separate writers do read-modify-write on the whole document: the app's
 * PUT /api/data, the MCP (api/_mcp/store.ts) and ThreadBrain (api/excerpts.ts).
 * Before this module they all wrote unconditionally, so whichever landed last
 * erased everything the others had done in between — the app's 500ms debounced
 * push routinely destroying MCP writes, with no error anywhere.
 *
 * The guard is a monotonic `rev` counter living at the top level of the blob
 * JSON. A writer must state the rev it read; the UPDATE only applies if the
 * stored blob is still at that rev. Losing the race is a rejection, never a
 * silent overwrite.
 *
 * `rev` lives inside the JSONB rather than in its own column deliberately:
 * `app_data` is outside drizzle's management (see drizzle.config.ts
 * tablesFilter), so a column would need a hand-written, hand-applied migration
 * — and this repo has a history of the code shipping while the DDL sits
 * unapplied. Postgres assigns the value itself, so the client cannot forge one.
 */

/** A blob read together with the revision it was read at. */
export interface BlobSnapshot {
  data: AppUserData;
  rev: number;
}

export type BlobWrite =
  /** The write applied. `rev` is the new revision to quote on the next write. */
  | { ok: true; rev: number }
  /** Someone else wrote first. Nothing was changed; here is what is stored. */
  | { ok: false; current: BlobSnapshot };

/**
 * Skip the guard and overwrite whatever is stored.
 *
 * Only for writes that are deliberately a whole-document replacement — an
 * explicit user-initiated import, or a legacy client that cannot state a rev.
 */
export const REV_FORCE = '*' as const;

export type ExpectedRev = number | typeof REV_FORCE;

/** Reads a blob's revision, treating a pre-guard row as revision 0. */
export function revOf(data: unknown): number {
  const r = (data as { rev?: unknown } | null | undefined)?.rev;
  return typeof r === 'number' && Number.isFinite(r) ? r : 0;
}

/**
 * Parses an `If-Match` request header into an expected revision.
 *
 * A missing header means the caller predates the guard — an old bundle still
 * cached by the service worker, most likely. Those fall back to forcing rather
 * than hard-failing, so a stale PWA install keeps working (at the old risk)
 * until it updates.
 */
export function parseIfMatch(header: unknown): ExpectedRev {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string' || raw === '' || raw === REV_FORCE) return REV_FORCE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : REV_FORCE;
}

export async function readBlob(sql: SqlClient, userId: string): Promise<BlobSnapshot | null> {
  const rows = await sql`SELECT data FROM app_data WHERE user_id = ${userId}`;
  if (rows.length === 0) return null;
  const data = rows[0].data as AppUserData;
  return { data, rev: revOf(data) };
}

/**
 * Marker smuggled into a Postgres cast error to abort a transaction when the
 * guard fails.
 *
 * A plain `ON CONFLICT ... WHERE` that matches nothing returns zero rows
 * *without* failing, so the rest of the transaction would carry on and write
 * the relational tables for a losing write. Casting this string to bigint
 * raises instead, which rolls back everything in the same transaction.
 *
 * It is derived from the CTE rather than written as a literal on purpose: a
 * constant expression gets folded and evaluated at plan time, so a literal
 * raises on *every* call, guard or no guard. That was measured, not assumed.
 */
const STALE_SENTINEL = 'STALE_BASE_REVISION';

/** True when an error is this module's guard tripping, not a real failure. */
export function isStaleBaseError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(STALE_SENTINEL);
}

/**
 * The compare-and-swap itself, as a deferred query.
 *
 * Postgres computes the next rev from the stored row, so it stays monotonic
 * even when a forced write comes from a client holding an older copy. Creating
 * the first row and the swap share one INSERT ... ON CONFLICT.
 */
function buildBlobWrite(
  sql: SqlClient,
  userId: string,
  data: AppUserData,
  expectedRev: ExpectedRev,
): DeferredQuery {
  // `rev` is stamped by jsonb_set below, so whatever the caller round-tripped
  // in the payload is irrelevant — but strip it anyway so a stale value never
  // reads as authoritative if this ever gets logged.
  const rest: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  delete rest.rev;
  const payload = JSON.stringify(rest);

  if (expectedRev === REV_FORCE) {
    return sql`
      INSERT INTO app_data (user_id, data, updated_at)
      VALUES (${userId}, jsonb_set(${payload}::jsonb, '{rev}', to_jsonb(1::bigint)), now())
      ON CONFLICT (user_id) DO UPDATE
      SET data = jsonb_set(
            ${payload}::jsonb, '{rev}',
            to_jsonb(COALESCE((app_data.data->>'rev')::bigint, 0) + 1)
          ),
          updated_at = now()
      RETURNING (data->>'rev')::bigint AS rev
    `;
  }

  return sql`
    WITH upd AS (
      INSERT INTO app_data (user_id, data, updated_at)
      VALUES (${userId}, jsonb_set(${payload}::jsonb, '{rev}', to_jsonb(1::bigint)), now())
      ON CONFLICT (user_id) DO UPDATE
      SET data = jsonb_set(
            ${payload}::jsonb, '{rev}',
            to_jsonb(COALESCE((app_data.data->>'rev')::bigint, 0) + 1)
          ),
          updated_at = now()
      WHERE COALESCE((app_data.data->>'rev')::bigint, 0) = ${expectedRev}
      RETURNING (data->>'rev')::bigint AS rev
    )
    SELECT CAST(COALESCE((SELECT rev::text FROM upd), ${STALE_SENTINEL}) AS bigint) AS rev
  `;
}

/**
 * Advances the revision without replacing the blob body, committing `alsoRun`
 * in the same transaction.
 *
 * This is the delta path's lock. A delta write's real payload is the relational
 * ops, so there is no new document to store — but the revision still has to
 * move under the same guard, and the ops still have to roll back if it doesn't.
 * Same raise-on-conflict trick as `buildBlobWrite`.
 *
 * The blob body is refreshed from the relational tables afterwards, by
 * `refreshBlobFromRelational`. If that refresh fails the body lags by one
 * write — which is harmless, because reads have served the relational tables
 * since v0.33.0 and the body is a backup.
 */
export async function bumpRev(
  sql: SqlClient,
  userId: string,
  expectedRev: number,
  alsoRun: DeferredQuery[] = [],
): Promise<BlobWrite> {
  const guard = sql`
    WITH upd AS (
      UPDATE app_data
      SET data = jsonb_set(
            data, '{rev}',
            to_jsonb(COALESCE((data->>'rev')::bigint, 0) + 1)
          ),
          updated_at = now()
      WHERE user_id = ${userId}
        AND COALESCE((data->>'rev')::bigint, 0) = ${expectedRev}
      RETURNING (data->>'rev')::bigint AS rev
    )
    SELECT CAST(COALESCE((SELECT rev::text FROM upd), ${STALE_SENTINEL}) AS bigint) AS rev
  `;

  let results: Array<Array<{ rev: string | number }>>;
  try {
    results = await sql.transaction([guard, ...alsoRun]);
  } catch (err) {
    if (!isStaleBaseError(err)) throw err;
    const current = await readBlob(sql, userId);
    if (!current) {
      throw new Error(
        `app_data row for user "${userId}" disappeared mid-write. Retry the operation.`,
      );
    }
    return { ok: false, current };
  }

  return { ok: true, rev: Number(results[0][0].rev) };
}

/**
 * Rewrites the blob body from the relational tables, keeping the stored
 * revision.
 *
 * Called after a delta write so the backup stays current. Best-effort by
 * design: the rows are the source of truth, so a stale body costs nothing that
 * the next write does not fix.
 */
export async function refreshBlobFromRelational(
  sql: SqlClient,
  userId: string,
  data: AppUserData,
): Promise<void> {
  const rest: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  delete rest.rev;
  const payload = JSON.stringify(rest);
  await sql`
    UPDATE app_data
    SET data = jsonb_set(${payload}::jsonb, '{rev}', COALESCE(data->'rev', to_jsonb(0)))
    WHERE user_id = ${userId}
  `;
}

/**
 * Writes the blob, and anything else, as one all-or-nothing transaction.
 *
 * `alsoRun` is how the relational write rides along: pass the decomposer's
 * queries and either both stores move or neither does. That atomicity is what
 * lets `api/data.ts` GET trust the relational tables outright instead of
 * reconciling them against the blob — the two can no longer disagree.
 *
 * The caller must read `expectedRev` no later than it reads the state it is
 * about to write, which is what makes a diffed decompose safe here: if anything
 * landed in between, the revision moved and the whole transaction aborts.
 */
export async function writeBlob(
  sql: SqlClient,
  userId: string,
  data: AppUserData,
  expectedRev: ExpectedRev,
  alsoRun: DeferredQuery[] = [],
): Promise<BlobWrite> {
  let results: Array<Array<{ rev: string | number }>>;
  try {
    results = await sql.transaction([buildBlobWrite(sql, userId, data, expectedRev), ...alsoRun]);
  } catch (err) {
    if (!isStaleBaseError(err)) throw err;

    // Nothing was written — not the blob, not the relational tables. Hand back
    // what is actually stored so the caller can rebase onto it rather than guess.
    const current = await readBlob(sql, userId);
    if (!current) {
      // Vanishingly unlikely: the row was deleted between the failed guard and
      // this read. Treat as a conflict against an empty store.
      throw new Error(
        `app_data row for user "${userId}" disappeared mid-write. Retry the operation.`,
      );
    }
    return { ok: false, current };
  }

  return { ok: true, rev: Number(results[0][0].rev) };
}
