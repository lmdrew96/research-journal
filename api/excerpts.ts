import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

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

function checkAuth(req: VercelRequest): boolean {
  const apiKey = process.env.JOURNAL_API_KEY;
  if (!apiKey) return false;
  const authHeader = req.headers.authorization ?? '';
  return authHeader === `Bearer ${apiKey}`;
}

/** Normalize a title for fuzzy comparison: lowercase, collapse whitespace, strip punctuation. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns true if the titles are close enough to be the same article. */
function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  // Substring check covers truncated titles
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word-overlap: >= 80% of the shorter title's words appear in the longer
  const wordsA = new Set(na.split(' '));
  const wordsB = nb.split(' ');
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / Math.min(wordsA.size, wordsB.length) >= 0.8;
}

interface ExcerptRequestBody {
  quote: string;
  comment: string;
  articleTitle: string;
  articleDoi?: string;
  articleUrl?: string;
  source: 'threadbrain';
}

interface AppUserData {
  version: number;
  library: LibraryArticle[];
  [key: string]: unknown;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body: ExcerptRequestBody = req.body;
  const { quote, comment, articleTitle, articleDoi, articleUrl } = body ?? {};

  if (!quote || typeof quote !== 'string') {
    return res.status(400).json({ error: 'quote is required' });
  }
  if (!articleTitle || typeof articleTitle !== 'string') {
    return res.status(400).json({ error: 'articleTitle is required' });
  }

  try {
    const sql = getDb();

    // GET current blob
    const rows = await sql`SELECT data FROM app_data WHERE id = 'main'`;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No app data found' });
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

    // Create article if not found
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

    // Push new excerpt
    const excerpt: Excerpt = {
      id: crypto.randomUUID(),
      quote,
      comment: comment ?? '',
      createdAt: now,
    };
    article.excerpts.push(excerpt);
    article.updatedAt = now;
    appData.lastModified = now;

    // PUT updated blob
    await sql`
      INSERT INTO app_data (id, data, updated_at)
      VALUES ('main', ${JSON.stringify(appData)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE
      SET data = ${JSON.stringify(appData)}::jsonb, updated_at = now()
    `;

    return res.status(200).json({ articleId: article.id, excerptId: excerpt.id });
  } catch (err) {
    console.error('Excerpts API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
