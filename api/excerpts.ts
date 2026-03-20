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

/** Resolve userId from a personal API key (hashed lookup). Returns userId + keyHash for rate limiting. */
async function getUserIdFromApiKey(req: VercelRequest): Promise<{ userId: string; keyHash: string } | null> {
  const authHeader = req.headers.authorization ?? '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!rawToken) return null;

  const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const sql = getDb();
  const rows = await sql`SELECT user_id FROM api_keys WHERE key_hash = ${keyHash}`;
  return rows.length > 0 ? { userId: rows[0].user_id as string, keyHash } : null;
}

/** Rate limit: max 100 requests per API key per hour. Returns true if within limit. */
async function checkRateLimit(keyHash: string): Promise<boolean> {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key_hash TEXT PRIMARY KEY,
      count INT NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const result = await sql`
    INSERT INTO rate_limits (key_hash, count, window_start)
    VALUES (${keyHash}, 1, NOW())
    ON CONFLICT (key_hash) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 hour' THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 hour' THEN NOW()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `;
  return (result[0].count as number) <= 100;
}

/** Normalize a quote for duplicate detection. */
function normalizeQuote(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
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
  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  // Only apply fuzzy matching to titles long enough to be specific
  if (wordsA.length < 4 || wordsB.length < 4) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const setA = new Set(wordsA);
  const overlap = wordsB.filter((w) => setA.has(w)).length;
  return overlap / Math.min(setA.size, wordsB.length) >= 0.8;
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
  source?: 'api' | 'extension' | 'manual';
}

interface AppUserData {
  version: number;
  library?: LibraryArticle[];
  projects?: Array<{ id: string; library: LibraryArticle[]; [key: string]: unknown }>;
  activeProjectId?: string;
  lastModified: string;
  [key: string]: unknown;
}

/** Return a mutable reference to the correct library array for the active project. */
function getActiveLibrary(appData: AppUserData): LibraryArticle[] {
  if (Array.isArray(appData.projects)) {
    const project =
      appData.projects.find((p) => p.id === appData.activeProjectId) ??
      appData.projects[0];
    if (project) return project.library;
  }
  // v1–v3 fallback: library is top-level
  if (!Array.isArray(appData.library)) appData.library = [];
  return appData.library;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await getUserIdFromApiKey(req);
  if (!authResult) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userId, keyHash } = authResult;

  const withinLimit = await checkRateLimit(keyHash);
  if (!withinLimit) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 100 requests per hour.' });
  }

  // Support single object or array of up to 50 items
  const isBatch = Array.isArray(req.body);
  const items: Array<{ quote: unknown; comment: unknown; articleTitle: unknown; articleDoi: unknown; articleUrl: unknown }> =
    isBatch ? req.body : [req.body ?? {}];

  if (isBatch && items.length > 50) {
    return res.status(400).json({ error: 'Batch limit is 50 items per request' });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.quote || typeof item.quote !== 'string') {
      return res.status(400).json({ error: `Item ${i}: quote is required` });
    }
    if (!item.articleTitle || typeof item.articleTitle !== 'string') {
      return res.status(400).json({ error: `Item ${i}: articleTitle is required` });
    }
  }

  try {
    const sql = getDb();

    const rows = await sql`SELECT data FROM app_data WHERE user_id = ${userId}`;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No app data found for this user' });
    }
    const appData = rows[0].data as AppUserData;
    const library = getActiveLibrary(appData);
    const now = new Date().toISOString();

    const results = items.map((item) => {
      const { quote, comment, articleTitle, articleDoi, articleUrl } = item as Record<string, string>;

      // Find matching article: DOI first, then fuzzy title
      let article = library.find(
        (a) => articleDoi && a.doi && a.doi.toLowerCase() === articleDoi.toLowerCase(),
      );
      if (!article) {
        article = library.find((a) => titlesMatch(a.title, articleTitle));
      }

      const wasCreated = !article;

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
        library.push(article);
      }

      // Duplicate check
      const incomingNorm = normalizeQuote(quote);
      const existing = article.excerpts.find((e) => normalizeQuote(e.quote) === incomingNorm);
      if (existing) {
        return { articleId: article.id, excerptId: existing.id, duplicate: true, created: wasCreated };
      }

      const excerpt: Excerpt = {
        id: crypto.randomUUID(),
        quote,
        comment: comment ?? '',
        createdAt: now,
        source: 'api',
      };
      article.excerpts.push(excerpt);
      article.updatedAt = now;

      return { articleId: article.id, excerptId: excerpt.id, created: wasCreated };
    });

    appData.lastModified = now;

    await sql`
      INSERT INTO app_data (user_id, data, updated_at)
      VALUES (${userId}, ${JSON.stringify(appData)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
      SET data = ${JSON.stringify(appData)}::jsonb, updated_at = now()
    `;

    return res.status(200).json(isBatch ? results : results[0]);
  } catch (err) {
    console.error('Excerpts API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
