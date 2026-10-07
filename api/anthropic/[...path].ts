import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClerkUserId } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // This spends the server's Anthropic key, so only signed-in users may use it.
  const userId = await getClerkUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to use AI features.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Extract the path after /api/anthropic/
  // e.g. /api/anthropic/messages → messages
  const pathSegments = req.query.path;
  const targetPath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments || 'messages';
  if (targetPath !== 'messages') {
    return res.status(404).json({ error: 'Not found' });
  }
  const url = `https://api.anthropic.com/v1/${targetPath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const responseBody = await response.text();
    res.status(response.status).setHeader('content-type', 'application/json').send(responseBody);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}