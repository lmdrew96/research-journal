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
  (req as Any).query = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams);
  (res as Any).status = (code: number) => { res.statusCode = code; return res; };
  (res as Any).json = (body: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  await (handler as Any)(req, res);
});

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, token = rawToken, query = '',
) {
  const r = await fetch(base + query, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Any };
}

await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as Any).port;
const base = `http://127.0.0.1:${port}/api/excerpts`;

const pdfArticleIds = new Set<string>();

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
  check('GET returns url, doi, status, isOpenAccess and oaUrl on every article',
    list.body.articles.every((a: Any) =>
      'url' in a && 'doi' in a && 'oaUrl' in a &&
      ['to-read', 'reading', 'done'].includes(a.status) && typeof a.isOpenAccess === 'boolean'),
    `${list.body.articles.filter((a: Any) => a.oaUrl).length} with an oaUrl`);

  check('GET returns a signed pdfUrl for every article with a PDF, null elsewhere',
    list.body.articles.every((a: Any) => pdfArticleIds.has(a.id)
      ? typeof a.pdfUrl === 'string' && a.pdfUrl.includes('X-Amz-Signature')
      : a.pdfUrl === null),
    `${pdfArticleIds.size} with a PDF`);

  const existing = list.body.articles[0];
  if (!existing) { check('fixture has at least one article', false); return; }

  // ── choosing a project with ?projectId= ──
  const projects = list.body.projects as Any[];
  check('GET lists every project with an article count, one marked active',
    Array.isArray(projects) && projects.filter((p) => p.active).length === 1 &&
      projects.every((p) => typeof p.name === 'string' && typeof p.articleCount === 'number') &&
      projects.find((p) => p.active)?.id === list.body.project.id,
    `${projects?.length} projects`);
  const other = projects?.find((p) => !p.active);
  if (!other) { check('fixture has a second project', false); return; }
  const otherList = await call('GET', undefined, rawToken, `?projectId=${other.id}`);
  check('GET ?projectId= returns that project, not the active one',
    otherList.status === 200 && otherList.body.project?.id === other.id &&
      otherList.body.articles.length === other.articleCount,
    `${otherList.body.project?.name}: ${otherList.body.articles?.length} articles`);
  const noProject = await call('GET', undefined, rawToken, '?projectId=no-such-project');
  check('GET with an unknown projectId is a 404', noProject.status === 404, `status ${noProject.status}`);

  const otherTitle = `Smoke Other-Project Article ${crypto.randomUUID()}`;
  const intoOther = await call('POST', { quote: `smoke-o-${crypto.randomUUID()}`, articleTitle: otherTitle },
    rawToken, `?projectId=${other.id}`);
  const otherRow = await sql`
    SELECT p.client_id FROM library_articles a JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND a.title = ${otherTitle}
  `;
  check('POST ?projectId= files the new article into that project',
    intoOther.status === 200 && otherRow[0]?.client_id === other.id,
    `landed in ${otherRow[0]?.client_id ?? 'nothing'}`);
  const wrongProject = await call('POST', { quote: `smoke-w-${crypto.randomUUID()}`, articleId: existing.id },
    rawToken, `?projectId=${other.id}`);
  check('POST ?projectId= with an articleId from another project is refused',
    wrongProject.body.error === 'No article with that id in that project', wrongProject.body.error ?? 'no error');

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

  // The first write decomposed the blob, so the fixture's pdfKey is now a row.
  const pdfRow = await sql`
    SELECT a.pdf_key FROM library_articles a JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND a.client_id = ${existing.id}
  `;
  check('the pdfKey reached library_articles.pdf_key',
    typeof pdfRow[0]?.pdf_key === 'string' && pdfRow[0].pdf_key.startsWith(`${TEST_USER}/`));

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

  // ── page on create ──
  const quoteP = `smoke-page-${crypto.randomUUID()}`;
  const withPage = await call('POST', { quote: quoteP, articleId: existing.id, page: 12 });
  check('POST with a page succeeds', withPage.status === 200, `status ${withPage.status}`);
  const badPage = await call('POST', { quote: 'x', articleId: existing.id, page: 'twelve' });
  check('POST with a non-integer page is refused', badPage.status === 400, `status ${badPage.status}`);

  const pageRow = async () => (await sql`
    SELECT e.quote, e.comment, e.page FROM excerpts e
    JOIN library_articles a ON e.article_id = a.id
    JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND e.client_id = ${withPage.body.excerptId}
  `)[0];
  check('the page reached the relational tables', (await pageRow())?.page === 12);

  // ── client names the writer ──
  const sourceOf = async (excerptId: string) => (await sql`
    SELECT e.source FROM excerpts e
    JOIN library_articles a ON e.article_id = a.id
    JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND e.client_id = ${excerptId}
  `)[0]?.source;
  check('POST without a client is stored as api', (await sourceOf(withPage.body.excerptId)) === 'api');
  const fromMarginalia = await call('POST', { quote: `smoke-client-${crypto.randomUUID()}`, articleId: existing.id, client: 'marginalia' });
  check('POST with client: marginalia is stored as marginalia', fromMarginalia.status === 200 &&
    (await sourceOf(fromMarginalia.body.excerptId)) === 'marginalia', `status ${fromMarginalia.status}`);
  const badClient = await call('POST', { quote: 'x', articleId: existing.id, client: 'somebody' });
  check('POST with an unknown client is refused', badClient.status === 400, `status ${badClient.status}`);

  // ── PATCH an excerpt ──
  const excerptQ = `?excerptId=${withPage.body.excerptId}`;
  const edited = await call('PATCH', { comment: 'edited in Marginalia', page: 13 }, rawToken, excerptQ);
  check('PATCH excerpt succeeds', edited.status === 200 &&
    edited.body.excerpt?.comment === 'edited in Marginalia' && edited.body.excerpt?.page === 13,
    `status ${edited.status}`);
  const afterEdit = await pageRow();
  check('PATCH excerpt reached the tables, quote untouched',
    afterEdit?.comment === 'edited in Marginalia' && afterEdit?.page === 13 && afterEdit?.quote === quoteP);

  const cleared = await call('PATCH', { page: null }, rawToken, excerptQ);
  check('PATCH page: null clears the page', cleared.status === 200 && !('page' in cleared.body.excerpt) &&
    (await pageRow())?.page === null);

  const emptyPatch = await call('PATCH', {}, rawToken, excerptQ);
  check('PATCH with no fields is refused', emptyPatch.status === 400, `status ${emptyPatch.status}`);
  const missing = await call('PATCH', { comment: 'x' }, rawToken, '?excerptId=no-such-excerpt');
  check('PATCH an unknown excerpt is a 404', missing.status === 404, `status ${missing.status}`);

  // ── PATCH an article's status ──
  const articleQ = `?articleId=${existing.id}`;
  const reading = await call('PATCH', { status: 'reading' }, rawToken, articleQ);
  check('PATCH article status to reading succeeds', reading.status === 200 && reading.body.status === 'reading',
    `status ${reading.status}`);
  const statusRow = await sql`
    SELECT a.status FROM library_articles a JOIN projects p ON a.project_id = p.id
    WHERE p.user_id = ${TEST_USER} AND a.client_id = ${existing.id}
  `;
  check('the status reached the tables', statusRow[0]?.status === 'reading', statusRow[0]?.status);
  const badStatus = await call('PATCH', { status: 'key-source' }, rawToken, articleQ);
  check('PATCH with an invalid status is refused', badStatus.status === 400, `status ${badStatus.status}`);
  const relist = await call('GET');
  check('GET reflects the new status',
    relist.body.articles.find((a: Any) => a.id === existing.id)?.status === 'reading');

  // ── DELETE an excerpt ──
  const deleted = await call('DELETE', undefined, rawToken, excerptQ);
  check('DELETE excerpt succeeds', deleted.status === 200 && deleted.body.deleted === true, `status ${deleted.status}`);
  check('DELETE removed the row', (await pageRow()) === undefined);
  const again = await call('DELETE', undefined, rawToken, excerptQ);
  check('DELETE an already-deleted excerpt is a 404', again.status === 404, `status ${again.status}`);
  const blobAfter = await sql`SELECT data FROM app_data WHERE user_id = ${TEST_USER}`;
  check('DELETE removed it from the blob backup too', !JSON.stringify(blobAfter[0].data).includes(quoteP));
}

try {
  const src = await sql`SELECT data FROM app_data ORDER BY pg_column_size(data) DESC LIMIT 1`;
  const blob = src[0].data as Record<string, unknown>;
  delete blob.rev;
  // Point the copy at its fullest project. The source account's ACTIVE project
  // is whatever its owner last had open, and an empty one fails every check.
  const projects = (blob.projects ?? []) as Array<{ id: string; library?: unknown[] }>;
  const fullest = [...projects].sort((a, b) => (b.library?.length ?? 0) - (a.library?.length ?? 0))[0];
  if (fullest) blob.activeProjectId = fullest.id;
  // One article carries an uploaded PDF, to check pdfKey round-trips and GET signs it.
  const withPdf = (fullest?.library?.[0] ?? null) as { pdfKey?: string } | null;
  if (withPdf) withPdf.pdfKey = `${TEST_USER}/${crypto.randomUUID()}.pdf`;
  // The source account may have uploaded PDFs of its own.
  for (const a of (fullest?.library ?? []) as Array<{ id: string; pdfKey?: string }>) {
    if (a.pdfKey) pdfArticleIds.add(a.id);
  }
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
