import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { getClerkUserId } from './_auth.js';
import { buildDecomposeQueries } from './_decomposer.js';
import { buildRecomposeQueries, assembleAppUserData } from './_recomposer.js';

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
      const rows = await sql`SELECT data FROM app_data WHERE user_id = ${userId}`;
      if (rows.length === 0) {
        console.log('[api/data GET] No data found for userId:', userId);
        return res.status(404).json({ error: 'No data found' });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = rows[0].data as any;
      console.log('[api/data GET] Returning data. userId:', userId, 'version:', d?.version, 'articles:', countArticles(d), 'lastModified:', d?.lastModified);

      // Phase 4: the relational tables are the primary read source. The blob
      // is a safety net, served only when the relational copy is missing
      // (pre-Phase-3 rows, non-v4 blob) or strictly older (a failed decompose
      // left it behind). Newer-wins means a half-completed dual-write can
      // never lose data. (Per-request deep-compare verification was Phase 3;
      // round-trip audits now live in scripts/verify-relational.mts.)
      try {
        const t0 = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const relResults = await (sql as any).transaction(buildRecomposeQueries(sql, userId));
        const relational = assembleAppUserData(relResults);
        if (!relational) {
          console.log('[api/data GET] Relational copy not ready — serving blob.');
        } else if (parseTime(d?.lastModified) > parseTime(relational.lastModified)) {
          console.warn(
            '[api/data GET] Blob is newer than relational copy (lastModified',
            d?.lastModified, 'vs', relational.lastModified,
            ') — serving blob. A dual-write likely failed; check PUT/excerpts logs.',
          );
        } else {
          console.log('[api/data GET] Serving relational copy (read took', Date.now() - t0, 'ms).');
          return res.status(200).json(relational);
        }
      } catch (relErr) {
        console.error('[api/data GET] Relational read failed (non-fatal):', relErr);
      }

      return res.status(200).json(rows[0].data);
    }

    if (req.method === 'PUT') {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid data' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = data as any;
      console.log('[api/data PUT] Writing to Neon. userId:', userId, 'version:', blob?.version, 'articles:', countArticles(blob), 'lastModified:', blob?.lastModified);

      await sql`
        INSERT INTO app_data (user_id, data, updated_at)
        VALUES (${userId}, ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE
        SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
      `;

      console.log('[api/data PUT] Blob write to Neon successful.');

      // Dual-write: decompose the blob into the relational tables (the
      // primary read source since Phase 4). Fail-soft — if the decompose
      // throws, the PUT still succeeds: the blob was already written and is
      // now newer, so GET's newer-wins guard serves it until the next
      // successful decompose catches the relational copy up.
      try {
        const decomposeStart = Date.now();
        const queries = buildDecomposeQueries(sql, userId, data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sql as any).transaction(queries);
        console.log(
          '[api/data PUT] Relational decompose successful.',
          'queries:', queries.length,
          'ms:', Date.now() - decomposeStart,
        );
      } catch (decomposeErr) {
        console.error('[api/data PUT] Decompose failed (non-fatal):', decomposeErr);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Data API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
