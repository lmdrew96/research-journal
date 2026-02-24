import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getDb();

    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM app_data WHERE id = 'main'`;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'No data found' });
      }
      return res.status(200).json(rows[0].data);
    }

    if (req.method === 'PUT') {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid data' });
      }

      await sql`
        INSERT INTO app_data (id, data, updated_at)
        VALUES ('main', ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE
        SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
      `;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Data API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}