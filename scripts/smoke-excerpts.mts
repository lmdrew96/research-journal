// End-to-end smoke test for /api/excerpts — the endpoint the Chrome extension
// and ThreadBrain both write through.
//
// Mounts the real Vercel handler on a local http server, mints a throwaway API
// key, and drives it against a synthetic user_id seeded from a real blob. All
// rows are removed on the way out; no real account is touched.
//
//     npx tsx --env-file=.env scripts/smoke-excerpts.mts

import http from 'node:http';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import handler from '../api/excerpts.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

type Any = any;

const sql = neon(process.env.DATABASE_URL);
const TEST_USER = `__excerpts_${crypto.randomUUID()}`;
const rawToken = `rj_smoke_${crypto.randomUUID()}`;
const tokenId = crypto.randomUUID();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  (req as Any).body = raw ? JSON.parse(raw) : undefined;
  (res as Any).status = (code: number) => { res.statusCode = code; return res; };
  (res as Any).json = (body: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  await (handler as Any)(req, res);
});

async function call(method: 'GET' | 'POST', body?: unknown, token = rawToken) {
  const r = await fetch(base, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Any };
}

await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as Any).port;
const base = `http://127.0.0.1:${port}/api/excerpts`;

async function main() {
  console.log(`\n/api/excerpts — test user ${TEST_USER}\n`);

  // ── auth ──
  const bad = await call('GET', undefined, 'rj_not_a_real_key');
  check('an unknown key is rejected', bad.status === 401, `status ${bad.status}`);

  // ── GET: the picker list ──
  const list = await call('GET');
  check('GET returns the active project', list.status === 200 && !!list.body.project,
    list.body.project ? list.body.project.name : `status ${list.status}`);
  check('GET returns articles with id + title', Array.isArray(list.body.articles) &&
    list.body.articles.every((a: Any) => typeof a.id === 'string' && typeof a.title === 'string'),
    `${list.body.articles?.length} articles`);

  const existing = list.body.articles[0];
  if (!existing) { check('fixture has at least one article', false); return; }

  // ── POST targeting an exact article by id ──
  const quoteA = `smoke-a-${crypto.randomUUID()}`;
  const targeted = await call('POST', {
    quote: quoteA,
    comment: 'targeted by id',
    articleId: existing.id,
    // A title that would fuzzy-match something else if id were ignored.
    articleTitle: 'Completely Unrelated Title That Should Not Be Matched',
  });
  check('POST with articleId succeeds', targeted.status === 200, `status ${targeted.status}`);
  check('POST with articleId lands on THAT article, not a fuzzy match',
    targeted.body.articleId === existing.id, `got ${targeted.body.articleId}`);
  check('POST with articleId did not create an article', targeted.body.created === false);

  // ── the excerpt actually reached the relational tables ──
  const rel = await sql`
    SELECT e.quote FROM excerpts e
    JOIN library_articles a ON e.article_id = a.id
    JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND e.quote = ${quoteA}
  `;
  check('the excerpt is in the relational tables', rel.length === 1, `${rel.length} rows`);

  // ── a bad articleId is refused, not silently redirected ──
  const badId = await call('POST', {
    quote: `smoke-bad-${crypto.randomUUID()}`,
    articleId: 'no-such-article-id',
    articleTitle: existing.title,
  });
  check('an unknown articleId reports an error', !!badId.body.error, badId.body.error ?? 'no error');

  // ── articleTitle is still required when no id is given ──
  const noTitle = await call('POST', { quote: 'x' });
  check('articleTitle still required without articleId', noTitle.status === 400, `status ${noTitle.status}`);

  // ── POST creating a new article (the clipper's default path) ──
  const newTitle = `Smoke New Article ${crypto.randomUUID()}`;
  const created = await call('POST', {
    quote: `smoke-new-${crypto.randomUUID()}`,
    comment: '',
    articleTitle: newTitle,
    articleUrl: 'https://example.com/paper',
  });
  check('POST without articleId creates an article', created.status === 200 && created.body.created === true);

  // ── the legacy queue shape the old extension stranded ──
  const legacyQuote = `smoke-legacy-${crypto.randomUUID()}`;
  const legacyBatch = await call('POST', [
    { quote: legacyQuote, comment: '', articleTitle: 'Stranded Legacy Capture', articleUrl: 'https://example.com/legacy' },
  ]);
  check('a batch in the legacy shape drains', legacyBatch.status === 200 && Array.isArray(legacyBatch.body),
    `status ${legacyBatch.status}`);

  // ── duplicate detection ──
  const dupe = await call('POST', {
    quote: quoteA, comment: 'again', articleId: existing.id, articleTitle: existing.title,
  });
  check('re-sending the same quote is reported as a duplicate', dupe.body.duplicate === true);

  const dupeRows = await sql`
    SELECT count(*)::int AS c FROM excerpts e
    JOIN library_articles a ON e.article_id = a.id
    JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND e.quote = ${quoteA}
  `;
  check('and does not create a second row', dupeRows[0].c === 1, `${dupeRows[0].c} rows`);
}

try {
  const src = await sql`SELECT data FROM app_data ORDER BY pg_column_size(data) DESC LIMIT 1`;
  const blob = src[0].data as Record<string, unknown>;
  delete blob.rev;
  await sql`INSERT INTO app_data (user_id, data, updated_at)
            VALUES (${TEST_USER}, jsonb_set(${JSON.stringify(blob)}::jsonb,'{rev}',to_jsonb(1::bigint)), now())`;
  await sql`INSERT INTO api_keys (id, user_id, key_hash, name)
            VALUES (${tokenId}, ${TEST_USER},
                    ${crypto.createHash('sha256').update(rawToken).digest('hex')}, 'smoke-excerpts (temporary)')`;
  await main();
} finally {
  server.close();
  await sql`DELETE FROM api_keys WHERE id = ${tokenId}`;
  await sql`DELETE FROM rate_limits WHERE key_hash = ${crypto.createHash('sha256').update(rawToken).digest('hex')}`;
  await sql`DELETE FROM tags WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM user_settings WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM projects WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM app_data WHERE user_id = ${TEST_USER}`;
  console.log('\ncleanup: test rows removed');
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
