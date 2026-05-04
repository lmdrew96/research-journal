import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClerkUserId } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getClerkUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.CORE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'CORE_API_KEY not configured' });
  }

  const { q, limit, offset } = (req.body ?? {}) as {
    q?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  if (typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'q is required' });
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  try {
    const response = await fetch('https://api.core.ac.uk/v3/search/works', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ q: q.trim(), limit: safeLimit, offset: safeOffset }),
    });

    const body = await response.text();
    res.status(response.status).setHeader('content-type', 'application/json').send(body);
  } catch (err) {
    console.error('CORE proxy error:', err);
    res.status(502).json({ error: 'CORE upstream failed' });
  }
}
