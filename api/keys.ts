import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { getClerkUserId } from './_auth.js';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getClerkUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sql = getDb();

    // List keys
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, created_at
        FROM api_keys
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return res.status(200).json({ keys: rows });
    }

    // Create key
    if (req.method === 'POST') {
      const { name } = req.body ?? {};
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }

      const rawToken = 'rj_' + crypto.randomBytes(32).toString('hex');
      const keyHash = hashToken(rawToken);
      const id = crypto.randomUUID();

      await sql`
        INSERT INTO api_keys (id, user_id, key_hash, name)
        VALUES (${id}, ${userId}, ${keyHash}, ${name})
      `;

      return res.status(200).json({ token: rawToken, id });
    }

    // Revoke key
    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`DELETE FROM api_keys WHERE id = ${id} AND user_id = ${userId}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Keys API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
