import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { getClerkUserId } from './_auth.js';
import { buildDecomposeQueries } from './_decomposer.js';
import { buildRecomposeQueries, assembleAppUserData } from './_recomposer.js';
import { readBlob, writeBlob, bumpRev, refreshBlobFromRelational, parseIfMatch, REV_FORCE } from './_blob-store.js';
import { buildIdMapQueries, assembleIdMaps } from './_id-maps.js';
import { buildOpsQueries } from './_ops.js';
import type { Op } from '../src/types/ops.js';

function parseTime(v: unknown): number {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function countArticles(blob: unknown): number {
  const projects = (blob as { projects?: { library?: unknown[] }[] } | null)?.projects;
  if (!Array.isArray(projects)) return 0;
  return projects.reduce((sum, p) => sum + (p.library?.length ?? 0), 0);
}

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getClerkUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();

    if (req.method === 'GET') {
      const snapshot = await readBlob(sql, userId);
      if (!snapshot) {
        console.log('[api/data GET] No data found for userId:', userId);
        return res.status(404).json({ error: 'No data found' });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = snapshot.data as any;
      console.log('[api/data GET] Returning data. userId:', userId, 'version:', d?.version, 'articles:', countArticles(d), 'lastModified:', d?.lastModified, 'rev:', snapshot.rev);

      // `rev` is the concurrency token for the NEXT write, and it belongs to
      // the blob row regardless of which copy is served — the relational tables
      // are derived from that same row, so a client that rebases on either one
      // is rebasing on the same revision.
      res.setHeader('ETag', `"${snapshot.rev}"`);

      // The relational tables are the source of truth. There is no newer-wins
      // reconciliation any more: every writer commits the blob and the
      // relational write in a single transaction, so the two cannot disagree —
      // a failed decompose now rolls the blob back with it rather than leaving
      // the blob ahead.
      //
      // The blob is still served for rows the relational copy genuinely cannot
      // represent: pre-Phase-3 rows with no client_id, and non-v4 data.
      // assembleAppUserData returns null for exactly those.
      try {
        const t0 = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const relResults = await (sql as any).transaction(buildRecomposeQueries(sql, userId));
        const relational = assembleAppUserData(relResults);
        if (!relational) {
          console.log('[api/data GET] Relational copy not representable — serving blob.');
        } else {
          if (parseTime(d?.lastModified) > parseTime(relational.lastModified)) {
            // Should be unreachable now that writes are atomic. Loud, because
            // if it ever fires the invariant this endpoint relies on is broken.
            console.error(
              '[api/data GET] INVARIANT VIOLATED: blob is newer than the relational copy (',
              d?.lastModified, 'vs', relational.lastModified,
              '). Writes are supposed to be atomic. Run scripts/verify-relational.mts.',
            );
          }
          console.log('[api/data GET] Serving relational copy (read took', Date.now() - t0, 'ms).');
          return res.status(200).json({ ...relational, rev: snapshot.rev });
        }
      } catch (relErr) {
        console.error('[api/data GET] Relational read failed (non-fatal):', relErr);
      }

      return res.status(200).json({ ...d, rev: snapshot.rev });
    }

    if (req.method === 'PUT') {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid data' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = data as any;
      const expectedRev = parseIfMatch(req.headers['if-match']);
      console.log('[api/data PUT] Writing to Neon. userId:', userId, 'version:', blob?.version, 'articles:', countArticles(blob), 'lastModified:', blob?.lastModified, 'if-match:', expectedRev);
      if (expectedRev === REV_FORCE && req.headers['if-match'] === undefined) {
        console.warn('[api/data PUT] No If-Match header — client predates the concurrency guard, forcing the write.');
      }

      // Build the relational write first, then commit it and the blob together.
      // The decompose diffs against current relational state; the guard below
      // proves nothing landed between that read and this write, so the diff's
      // basis is still valid when it applies. If the decompose throws while
      // building, nothing has been written yet and the PUT fails cleanly.
      const decompose = await buildDecomposeQueries(sql, userId, data);
      const result = await writeBlob(sql, userId, blob, expectedRev, decompose);

      if (!result.ok) {
        // Reject loudly and hand back the winning blob. The client rebases its
        // pending mutations onto this and pushes again; without the body it
        // would have to choose between discarding local edits and re-clobbering.
        console.warn(
          '[api/data PUT] Rejected: stale base. Client had rev', expectedRev,
          'server is at rev', result.current.rev,
        );
        return res.status(409).json({
          error: 'Stale base revision — the data changed since you last read it.',
          current: { ...result.current.data, rev: result.current.rev },
          rev: result.current.rev,
        });
      }

      console.log(
        '[api/data PUT] Committed. New rev:', result.rev,
        '| relational queries:', decompose.length,
      );
      res.setHeader('ETag', `"${result.rev}"`);

      return res.status(200).json({ ok: true, rev: result.rev });
    }

    // PATCH: a delta. The client sends only the entities it changed, instead of
    // re-uploading the whole document — which used to mean ~1KB per article on
    // every 500ms debounce, regardless of how small the edit was.
    if (req.method === 'PATCH') {
      const body = req.body as { baseRev?: unknown; ops?: unknown } | null;
      const ops = Array.isArray(body?.ops) ? (body!.ops as Op[]) : null;
      const baseRev = typeof body?.baseRev === 'number' ? body.baseRev : null;
      if (!ops || baseRev === null) {
        return res.status(400).json({ error: 'Expected { baseRev: number, ops: Op[] }' });
      }

      const t0 = Date.now();

      // Ops address rows by client_id, so they can only be applied on top of a
      // relational copy that actually represents the document. If it does not
      // (pre-client_id rows, non-v4 data), say so and let the client fall back
      // to a whole-document PUT rather than applying a delta to a partial tree.
      const recompose = buildRecomposeQueries(sql, userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (sql as any).transaction([...recompose, ...buildIdMapQueries(sql, userId)]);
      const before = assembleAppUserData(results.slice(0, recompose.length));
      if (!before) {
        console.warn('[api/data PATCH] Relational copy not representable — asking the client to PUT.');
        return res.status(409).json({
          error: 'Relational copy cannot represent this account yet — send a full document.',
          fullSyncRequired: true,
        });
      }
      const ids = assembleIdMaps(results.slice(recompose.length));

      const plan = buildOpsQueries(sql, userId, ops, ids);
      if (plan.unresolved.length > 0) {
        // A delta referencing something that no longer exists is the only way
        // per-entity writes genuinely conflict. Refuse the batch whole rather
        // than applying the half that resolves.
        console.warn('[api/data PATCH] Stale delta — unresolved:', plan.unresolved.join(', '));
        return res.status(409).json({
          error: `Delta references entities that no longer exist: ${plan.unresolved.join(', ')}`,
          fullSyncRequired: true,
        });
      }

      const applied = await bumpRev(sql, userId, baseRev, plan.queries);
      if (!applied.ok) {
        console.warn(
          '[api/data PATCH] Rejected: stale base. Client had rev', baseRev,
          'server is at rev', applied.current.rev,
        );
        return res.status(409).json({
          error: 'Stale base revision — the data changed since you last read it.',
          current: { ...applied.current.data, rev: applied.current.rev },
          rev: applied.current.rev,
        });
      }

      // Refresh the backup copy from the rows we just wrote. Best-effort: the
      // relational tables are what GET serves, so a lagging body is harmless.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const after = assembleAppUserData(await (sql as any).transaction(buildRecomposeQueries(sql, userId)));
        if (after) await refreshBlobFromRelational(sql, userId, after);
      } catch (refreshErr) {
        console.error('[api/data PATCH] Blob backup refresh failed (non-fatal):', refreshErr);
      }

      console.log(
        '[api/data PATCH] Applied', ops.length, 'op(s) as', plan.queries.length,
        'queries in', Date.now() - t0, 'ms. New rev:', applied.rev,
      );
      res.setHeader('ETag', `"${applied.rev}"`);
      return res.status(200).json({ ok: true, rev: applied.rev });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Data API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
