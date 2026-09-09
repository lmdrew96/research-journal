import type { AppUserData } from '../src/types/index.js';

// neon's tag-template client has tightly bounded generics that don't compose
// across module boundaries; use `any` like the decomposer does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;

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
 * Writes the blob if it is still at `expectedRev`, and returns the new revision.
 *
 * Postgres computes the next rev from the stored row, so it is monotonic even
 * when a forced write comes from a client holding an older copy. The whole
 * thing is one statement: creating the first row and the compare-and-swap share
 * an INSERT ... ON CONFLICT, and a failed guard is simply zero rows returned.
 */
export async function writeBlob(
  sql: SqlClient,
  userId: string,
  data: AppUserData,
  expectedRev: ExpectedRev,
): Promise<BlobWrite> {
  // `rev` is stamped by jsonb_set below, so whatever the caller round-tripped
  // in the payload is irrelevant — but strip it anyway so a stale value never
  // reads as authoritative if this ever gets logged.
  const rest: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  delete rest.rev;
  const payload = JSON.stringify(rest);

  const rows =
    expectedRev === REV_FORCE
      ? await sql`
          INSERT INTO app_data (user_id, data, updated_at)
          VALUES (${userId}, jsonb_set(${payload}::jsonb, '{rev}', to_jsonb(1::bigint)), now())
          ON CONFLICT (user_id) DO UPDATE
          SET data = jsonb_set(
                ${payload}::jsonb, '{rev}',
                to_jsonb(COALESCE((app_data.data->>'rev')::bigint, 0) + 1)
              ),
              updated_at = now()
          RETURNING (data->>'rev')::bigint AS rev
        `
      : await sql`
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
        `;

  if (rows.length > 0) {
    return { ok: true, rev: Number(rows[0].rev) };
  }

  // Zero rows means the ON CONFLICT guard rejected the write. Hand back what is
  // actually stored so the caller can rebase onto it rather than guess.
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
