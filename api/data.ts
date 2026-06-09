import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { getClerkUserId } from './_auth.js';
import { buildDecomposeQueries } from './_decomposer.js';
import {
  buildRecomposeQueries,
  assembleAppUserData,
  canonicalizeBlob,
  findFirstDiff,
} from './_recomposer.js';

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
      const articleCount = d?.projects?.reduce((sum: number, p: any) => sum + (p.library?.length ?? 0), 0) ?? 0;
      console.log('[api/data GET] Returning data. userId:', userId, 'version:', d?.version, 'articles:', articleCount, 'lastModified:', d?.lastModified);

      // Phase 3: read from the relational tables, verified against the blob.
      // Serve the recomposed data only when it reproduces the blob exactly;
      // any gap (pre-Phase-3 rows, stale copy after an /api/excerpts write,
      // mismatch, error) falls back to the blob — never a behavior change.
      try {
        const t0 = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const relResults = await (sql as any).transaction(buildRecomposeQueries(sql, userId));
        const relational = assembleAppUserData(relResults);
        if (!relational) {
          console.log('[api/data GET] Relational copy not ready — serving blob.');
        } else if (relational.lastModified !== d?.lastModified) {
          console.log(
            '[api/data GET] Relational copy stale (lastModified',
            relational.lastModified, 'vs', d?.lastModified, ') — serving blob.',
          );
        } else {
          const expected = canonicalizeBlob(d);
          const diff = expected ? findFirstDiff(expected, relational) : 'blob is not v4';
          if (!diff) {
            console.log('[api/data GET] Relational copy verified in', Date.now() - t0, 'ms — serving relational.');
            return res.status(200).json(relational);
          }
          console.warn('[api/data GET] Relational/blob mismatch at', diff, '— serving blob.');
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
      const articleCount = (data as any)?.projects?.reduce((sum: number, p: any) => sum + (p.library?.length ?? 0), 0) ?? 0;
      console.log('[api/data PUT] Writing to Neon. userId:', userId, 'version:', (data as any)?.version, 'articles:', articleCount, 'lastModified:', (data as any)?.lastModified);

      await sql`
        INSERT INTO app_data (user_id, data, updated_at)
        VALUES (${userId}, ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE
        SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
      `;

      console.log('[api/data PUT] Blob write to Neon successful.');

      // Dual-write: also decompose the blob into the relational tables.
      // Fail-soft — if the decompose throws, the PUT still succeeds because
      // the blob remains the source of truth until the Phase 4 cutover.
      // (A failed decompose leaves user_settings.last_modified behind the
      // blob's, so the GET read path falls back to the blob automatically.)
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
