import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Extract the path after /api/anthropic/
  // e.g. /api/anthropic/messages → messages
  const pathSegments = req.query.path;
  const targetPath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments || 'messages';
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