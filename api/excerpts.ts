import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.THREADBRAIN_ORIGIN ?? 'https://threadbrain.app';
  const origin = req.headers.origin ?? '';
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/** Resolve userId from a personal API key (hashed lookup). */
async function getUserIdFromApiKey(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization ?? '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!rawToken) return null;

  const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const sql = getDb();
  const rows = await sql`SELECT user_id FROM api_keys WHERE key_hash = ${keyHash}`;
  return rows.length > 0 ? (rows[0].user_id as string) : null;
}

/** Normalize a title for fuzzy comparison. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(' '));
  const wordsB = nb.split(' ');
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / Math.min(wordsA.size, wordsB.length) >= 0.8;
}

interface LibraryArticle {
  id: string;
  title: string;
  doi: string | null;
  url: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  notes: string;
  excerpts: Excerpt[];
  linkedQuestions: string[];
  status: string;
  tags: string[];
  aiSummary: string | null;
  isOpenAccess: boolean;
  savedAt: string;
  updatedAt: string;
}

interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
}

interface AppUserData {
  version: number;
  library: LibraryArticle[];
  lastModified: string;
  [key: string]: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getUserIdFromApiKey(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { quote, comment, articleTitle, articleDoi, articleUrl } = req.body ?? {};

  if (!quote || typeof quote !== 'string') {
    return res.status(400).json({ error: 'quote is required' });
  }
  if (!articleTitle || typeof articleTitle !== 'string') {
    return res.status(400).json({ error: 'articleTitle is required' });
  }

  try {
    const sql = getDb();

    const rows = await sql`SELECT data FROM app_data WHERE user_id = ${userId}`;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No app data found for this user' });
    }
    const appData = rows[0].data as AppUserData;

    if (!Array.isArray(appData.library)) {
      appData.library = [];
    }

    // Find matching article: DOI first, then fuzzy title
    let article = appData.library.find(
      (a) => articleDoi && a.doi && a.doi.toLowerCase() === articleDoi.toLowerCase(),
    );
    if (!article) {
      article = appData.library.find((a) => titlesMatch(a.title, articleTitle));
    }

    const now = new Date().toISOString();

    if (!article) {
      article = {
        id: crypto.randomUUID(),
        title: articleTitle,
        doi: articleDoi ?? null,
        url: articleUrl ?? null,
        authors: [],
        year: null,
        journal: null,
        abstract: null,
        notes: '',
        excerpts: [],
        linkedQuestions: [],
        status: 'reading',
        tags: [],
        aiSummary: null,
        isOpenAccess: false,
        savedAt: now,
        updatedAt: now,
      };
      appData.library.push(article);
    }

    const excerpt: Excerpt = {
      id: crypto.randomUUID(),
      quote,
      comment: comment ?? '',
      createdAt: now,
    };
    article.excerpts.push(excerpt);
    article.updatedAt = now;
    appData.lastModified = now;

    await sql`
      INSERT INTO app_data (user_id, data, updated_at)
      VALUES (${userId}, ${JSON.stringify(appData)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
      SET data = ${JSON.stringify(appData)}::jsonb, updated_at = now()
    `;

    return res.status(200).json({ articleId: article.id, excerptId: excerpt.id });
  } catch (err) {
    console.error('Excerpts API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
