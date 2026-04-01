import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { getClerkUserId } from './_auth.js';

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

      console.log('[api/data PUT] Write to Neon successful.');
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Data API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
