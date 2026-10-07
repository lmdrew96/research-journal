import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { buildDecomposeQueries } from './_decomposer.js';
import { readBlob, writeBlob } from './_blob-store.js';
import { isPage } from './_recomposer.js';
import { presignPdfGet } from './_r2.js';
import type { AppUserData as RealAppUserData } from '../src/types/index.js';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

// CORS only governs browsers. Marginalia calls this server-to-server, where no
// Origin header is sent and nothing enforces these headers, so it needs no
// entry here; the allowed origin is for ThreadBrain's in-browser calls.
function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.THREADBRAIN_ORIGIN ?? 'https://threadbrain.app';
  const origin = req.headers.origin ?? '';
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

/** Rate limit: max 500 requests per API key per hour. Returns true if within limit. */
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
  return (result[0].count as number) <= 500;
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
  unpaywallUrl?: string | null;
  pdfKey?: string;
  keySource?: true;
  source?: 'crossref' | 'openalex' | 'manual';
  savedAt: string;
  updatedAt: string;
}

interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
  source?: 'api' | 'extension' | 'manual';
  page?: number;
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

/** Every article in every project — excerpt and article ids are unique across them. */
function allArticles(appData: AppUserData): LibraryArticle[] {
  if (Array.isArray(appData.projects)) return appData.projects.flatMap((p) => p.library ?? []);
  return Array.isArray(appData.library) ? appData.library : [];
}

const ARTICLE_STATUSES = new Set(['to-read', 'reading', 'done']);
const MAX_ATTEMPTS = 3;

/** A request-level failure raised from inside a mutation; nothing is written. */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Guarded read-modify-write. This handler is one of three writers on the same
 * blob (the app's PUT and the MCP are the others), so the write only applies
 * while the revision it read is still current. Every mutation here is a pure
 * function of the blob, which makes a rejection cheap: re-read and replay onto
 * whatever got there first. Returns null when every attempt lost the race.
 *
 * The relational write commits in the same transaction as the blob, so a
 * rejected attempt leaves neither store touched.
 */
async function guardedWrite<T>(
  sql: ReturnType<typeof getDb>,
  userId: string,
  apply: (appData: AppUserData, now: string) => T,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const snapshot = await readBlob(sql, userId);
    if (!snapshot) throw new HttpError(404, 'No app data found for this user');
    const appData = snapshot.data as unknown as AppUserData;
    const now = new Date().toISOString();

    const result = apply(appData, now);
    appData.lastModified = now;

    const decompose = await buildDecomposeQueries(sql, userId, appData);
    const write = await writeBlob(
      sql,
      userId,
      appData as unknown as RealAppUserData,
      snapshot.rev,
      decompose,
    );
    if (write.ok) return result;

    console.warn(
      '[api/excerpts] Stale base — read rev', snapshot.rev,
      'but store is at rev', write.current.rev,
      `(attempt ${attempt}/${MAX_ATTEMPTS}); replaying onto the current blob.`,
    );
  }
  return null;
}

// Three losses in a row means something is writing continuously. Say so rather
// than forcing — forcing is what destroyed data in the first place.
const CONFLICT_ERROR =
  'Could not save: this account is being written to concurrently ' +
  `(gave up after ${MAX_ATTEMPTS} attempts). Nothing was saved. Retry in a moment.`;

function queryParam(req: VercelRequest, name: string): string | null {
  const v = req.query[name];
  return typeof v === 'string' && v ? v : null;
}

/** PATCH ?excerptId= — edit an excerpt's quote, comment or page. */
async function patchExcerpt(req: VercelRequest, res: VercelResponse, userId: string, excerptId: string) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { quote, comment, page } = body;
  if (quote === undefined && comment === undefined && page === undefined) {
    return res.status(400).json({ error: 'Nothing to update: send quote, comment and/or page' });
  }
  if (quote !== undefined && (typeof quote !== 'string' || !quote.trim())) {
    return res.status(400).json({ error: 'quote must be a non-empty string' });
  }
  if (comment !== undefined && typeof comment !== 'string') {
    return res.status(400).json({ error: 'comment must be a string' });
  }
  if (page !== undefined && page !== null && !isPage(page)) {
    return res.status(400).json({ error: 'page must be a positive integer, or null to clear it' });
  }

  const result = await guardedWrite(getDb(), userId, (appData, now) => {
    for (const article of allArticles(appData)) {
      const excerpt = article.excerpts.find((e) => e.id === excerptId);
      if (!excerpt) continue;
      if (typeof quote === 'string') excerpt.quote = quote;
      if (typeof comment === 'string') excerpt.comment = comment;
      if (page === null) delete excerpt.page;
      else if (isPage(page)) excerpt.page = page;
      article.updatedAt = now;
      return { articleId: article.id, excerpt: { ...excerpt } };
    }
    throw new HttpError(404, 'No excerpt with that id');
  });
  if (!result) return res.status(409).json({ error: CONFLICT_ERROR });
  return res.status(200).json(result);
}

/** PATCH ?articleId= — set an article's reading status. */
async function patchArticle(req: VercelRequest, res: VercelResponse, userId: string, articleId: string) {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof status !== 'string' || !ARTICLE_STATUSES.has(status)) {
    return res.status(400).json({ error: "status must be one of 'to-read', 'reading', 'done'" });
  }

  const result = await guardedWrite(getDb(), userId, (appData, now) => {
    const article = allArticles(appData).find((a) => a.id === articleId);
    if (!article) throw new HttpError(404, 'No article with that id');
    // A legacy 'key-source' status means To Read plus the key-source flag, so
    // replacing it must keep the flag rather than silently dropping it.
    if (article.status === 'key-source') article.keySource = true;
    article.status = status;
    article.updatedAt = now;
    return { articleId: article.id, status: article.status };
  });
  if (!result) return res.status(409).json({ error: CONFLICT_ERROR });
  return res.status(200).json(result);
}

/** DELETE ?excerptId= — remove an excerpt. */
async function deleteExcerpt(res: VercelResponse, userId: string, excerptId: string) {
  const result = await guardedWrite(getDb(), userId, (appData, now) => {
    for (const article of allArticles(appData)) {
      const index = article.excerpts.findIndex((e) => e.id === excerptId);
      if (index === -1) continue;
      article.excerpts.splice(index, 1);
      article.updatedAt = now;
      return { articleId: article.id, excerptId, deleted: true };
    }
    throw new HttpError(404, 'No excerpt with that id');
  });
  if (!result) return res.status(409).json({ error: CONFLICT_ERROR });
  return res.status(200).json(result);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await getUserIdFromApiKey(req);
  if (!authResult) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userId, keyHash } = authResult;

  const withinLimit = await checkRateLimit(keyHash);
  if (!withinLimit) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 500 requests per hour.' });
  }

  // GET: the active project's articles, enough to populate a picker.
  //
  // The Chrome extension needs this to offer "attach to an existing article".
  // It used to read the app's localStorage through chrome.scripting, which
  // required a ThreadNotes tab to be open and meant the extension was a fourth
  // writer on the blob. Serving the list here lets it work with no tab at all.
  if (req.method === 'GET') {
    try {
      const sql = getDb();
      const snapshot = await readBlob(sql, userId);
      if (!snapshot) {
        return res.status(404).json({ error: 'No app data found for this user' });
      }
      const appData = snapshot.data as unknown as AppUserData;
      const project = Array.isArray(appData.projects)
        ? appData.projects.find((p) => p.id === appData.activeProjectId) ?? appData.projects[0]
        : undefined;
      const articles = await Promise.all(getActiveLibrary(appData).map(async (a) => ({
        id: a.id,
        title: a.title,
        year: a.year,
        doi: a.doi,
        url: a.url,
        status: a.status === 'key-source' ? 'to-read' : a.status,
        isOpenAccess: a.isOpenAccess,
        // OpenAlex's best free version: usually a PDF, sometimes a landing
        // page. Stored under its Unpaywall-era name (see v0.47.0).
        oaUrl: a.unpaywallUrl ?? null,
        // An uploaded PDF, signed for an hour. Marginalia opens this when
        // there is no oaUrl; re-GET the list for a fresh link after that.
        pdfUrl: a.pdfKey
          ? await presignPdfGet(a.pdfKey, 3600).catch((err: unknown) => {
              console.error('[api/excerpts] could not sign pdfUrl:', err);
              return null;
            })
          : null,
      })));
      return res.status(200).json({
        project: project ? { id: project.id, name: project.name ?? 'Untitled' } : null,
        articles,
      });
    } catch (err) {
      console.error('Excerpts GET error:', err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const excerptId = queryParam(req, 'excerptId');
    const articleId = queryParam(req, 'articleId');
    try {
      if (req.method === 'DELETE') {
        if (!excerptId) return res.status(400).json({ error: 'excerptId query parameter is required' });
        return await deleteExcerpt(res, userId, excerptId);
      }
      if (excerptId && articleId) {
        return res.status(400).json({ error: 'Send excerptId or articleId, not both' });
      }
      if (excerptId) return await patchExcerpt(req, res, userId, excerptId);
      if (articleId) return await patchArticle(req, res, userId, articleId);
      return res.status(400).json({ error: 'excerptId or articleId query parameter is required' });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(`Excerpts ${req.method} error:`, err);
      return res.status(500).json({ error: String(err) });
    }
  }

  // Support single object or array of up to 50 items
  const isBatch = Array.isArray(req.body);
  const items: Array<{
    quote: unknown; comment: unknown; articleTitle: unknown;
    articleDoi: unknown; articleUrl: unknown; articleId: unknown; page: unknown;
  }> = isBatch ? req.body : [req.body ?? {}];

  if (isBatch && items.length > 50) {
    return res.status(400).json({ error: 'Batch limit is 50 items per request' });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.quote || typeof item.quote !== 'string') {
      return res.status(400).json({ error: `Item ${i}: quote is required` });
    }
    if (item.page !== undefined && item.page !== null && !isPage(item.page)) {
      return res.status(400).json({ error: `Item ${i}: page must be a positive integer` });
    }
    if (item.articleId !== undefined && typeof item.articleId !== 'string') {
      return res.status(400).json({ error: `Item ${i}: articleId must be a string` });
    }
    // articleTitle is what a new article gets named, so it is only required
    // when no existing article is being targeted by id.
    if (!item.articleId && (!item.articleTitle || typeof item.articleTitle !== 'string')) {
      return res.status(400).json({ error: `Item ${i}: articleTitle is required unless articleId is given` });
    }
  }

  try {
    type ExcerptResult = {
      articleId: string;
      excerptId: string;
      created: boolean;
      duplicate?: boolean;
      error?: string;
    };

    // Landing the excerpts is a pure function of the blob, so guardedWrite can
    // replay this onto whatever won if another writer got there first.
    const results = await guardedWrite(getDb(), userId, (appData, now): ExcerptResult[] => {
      const library = getActiveLibrary(appData);

      return items.map((item) => {
        const { quote, comment, articleTitle, articleDoi, articleUrl, articleId } =
          item as Record<string, string>;
        const page = item.page;

        // An explicit articleId wins outright — the caller has already picked,
        // so falling back to fuzzy matching would silently land the excerpt on
        // a different paper.
        let article = articleId ? library.find((a) => a.id === articleId) : undefined;
        if (articleId && !article) {
          return { articleId, excerptId: '', created: false, error: 'No article with that id in the active project' };
        }

        // Otherwise find a match: DOI first, then fuzzy title.
        if (!article) {
          article = library.find(
            (a) => articleDoi && a.doi && a.doi.toLowerCase() === articleDoi.toLowerCase(),
          );
        }
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
            // Title, DOI and URL come from the clipped page, not a lookup.
            source: 'manual',
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
          ...(isPage(page) ? { page } : {}),
        };
        article.excerpts.push(excerpt);
        article.updatedAt = now;

        return { articleId: article.id, excerptId: excerpt.id, created: wasCreated };
      });
    });

    if (!results) return res.status(409).json({ error: CONFLICT_ERROR });

    // The relational tables were written inside the same transaction as the
    // blob above — there is no second write to make here, and no window in
    // which the two stores disagree.
    return res.status(200).json(isBatch ? results : results[0]);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Excerpts API error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
