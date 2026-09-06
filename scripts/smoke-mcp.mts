// End-to-end smoke test for the HTTP MCP endpoint. Mounts the real Vercel
// handler (api/mcp/[token].ts) on a local http server and drives it with the
// MCP SDK's Streamable HTTP client, against the real Neon database.
//
// Usage:
//   npx tsx --env-file=.env scripts/smoke-mcp.mts [--write]
//
// --write additionally exercises journal_add_excerpt / journal_add_note and
// then removes what it wrote, so the read-only run stays safe to repeat.
import http from 'node:http';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../api/mcp/[token].ts';

const runWrites = process.argv.includes('--write');
const userArg = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length);
if (!userArg) throw new Error('Pass --user=<clerkUserId> to say whose journal to test against.');

const sql = neon(process.env.DATABASE_URL!);

// Mint a throwaway key for the run and drop it in the finally block below, so
// no live credential to real research data outlives the test.
const token = 'rj_smoke_' + crypto.randomBytes(24).toString('hex');
const tokenId = crypto.randomUUID();
await sql`
  INSERT INTO api_keys (id, user_id, key_hash, name)
  VALUES (${tokenId}, ${userArg}, ${crypto.createHash('sha256').update(token).digest('hex')},
          'smoke-mcp (temporary)')
`;
const dropKey = async () => {
  await sql`DELETE FROM api_keys WHERE id = ${tokenId}`;
  console.log('\nephemeral key deleted:', tokenId);
};
process.on('exit', () => void dropKey());
console.log('minted ephemeral key for user:', userArg);

try {

// Minimal VercelRequest/VercelResponse shim over node's http primitives.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  (req as any).query = { token: url.pathname.split('/').pop() };
  (req as any).body = raw ? JSON.parse(raw) : undefined;
  (res as any).status = (code: number) => { res.statusCode = code; return res; };
  (res as any).json = (body: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  await (handler as any)(req, res);
});

await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}/api/mcp`;

// --- auth rejection ---
const bad = await fetch(`${base}/rj_not_a_real_key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
console.log('bad token ->', bad.status, (await bad.json() as any).error?.code);

// --- protocol ---
const client = new Client({ name: 'smoke-mcp', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/${token}`)));

const { tools } = await client.listTools();
console.log('\ntools/list ->', tools.length, 'tools');
const malformed = tools.filter((t) => t.inputSchema?.type !== 'object');
console.log('malformed inputSchema:', malformed.length, malformed.map((t) => t.name).join(', '));
const excerptSchema = tools.find((t) => t.name === 'journal_add_excerpt')?.inputSchema;
console.log('journal_add_excerpt required:', JSON.stringify((excerptSchema as any)?.required));

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as any;

const themes = await call('journal_get_themes');
console.log('\njournal_get_themes -> project:', themes.structuredContent.activeProject?.name,
  '| themes:', themes.structuredContent.themes.length);
const questions = await call('journal_get_questions');
console.log('journal_get_questions ->', questions.structuredContent.questions.length);
const lib = await call('journal_get_library');
console.log('journal_get_library ->', lib.structuredContent.library.length, 'articles');
const search = await call('journal_search', { query: 'language' });
console.log('journal_search("language") ->', search.structuredContent.results.length, 'results');
console.log('\nREAD PATH OK');

if (runWrites) {
  // Write against a throwaway article of our own so real library entries are
  // never touched. Deleting it at the end removes the excerpt and note with it.
  const created = await call('journal_add_article', {
    title: 'smoke-mcp temporary article — safe to delete',
    authors: ['scripts/smoke-mcp.mts'],
  });
  const articleId = created.structuredContent.articleId;
  console.log('\njournal_add_article ->', articleId);

  try {
    const ex = await call('journal_add_excerpt', {
      articleId,
      quote: 'smoke-test excerpt',
      comment: 'written by scripts/smoke-mcp.mts',
    });
    console.log('journal_add_excerpt ->',
      ex.isError ? `ERROR: ${ex.content[0].text}` : ex.structuredContent.excerptId);

    const note = await call('journal_add_note', { articleId, text: '[smoke-test note]' });
    console.log('journal_add_note ->', note.isError ? `ERROR: ${note.content[0].text}` : 'ok');

    // Re-read from the database, not from the in-memory response, so this
    // proves the write actually landed.
    const back = await call('journal_get_article', { id: articleId });
    const a = back.structuredContent.article;
    console.log('excerpt reads back:',
      a.excerpts.some((e: any) => e.id === ex.structuredContent.excerptId));
    console.log('note reads back:', a.notes.includes('[smoke-test note]'));

    // Relational dual-write check: the app reads from these tables, not the
    // blob, so an MCP write that only lands in app_data is riding the
    // newer-wins fallback rather than the main path.
    const relArticle = await sql`
      SELECT id, title, notes FROM library_articles WHERE client_id = ${articleId}
    `;
    console.log('relational library_articles row:', relArticle.length === 1);
    console.log('relational notes carry the MCP write:',
      (relArticle[0]?.notes ?? '').includes('[smoke-test note]'));

    const relExcerpt = await sql`
      SELECT quote FROM excerpts WHERE client_id = ${ex.structuredContent.excerptId}
    `;
    console.log('relational excerpts row:', relExcerpt.length === 1);

    // lastModified parity is what stops api/data.ts GET falling back to the blob.
    const parity = await sql`
      SELECT us.last_modified AS relational, ad.data->>'lastModified' AS blob
      FROM user_settings us JOIN app_data ad ON ad.user_id = us.user_id
      WHERE us.user_id = ${userArg}
    `;
    const rel = new Date(parity[0].relational as string).getTime();
    const blb = new Date(parity[0].blob as string).getTime();
    console.log('lastModified parity (blob not newer => no fallback):', blb <= rel);

    const del = await call('journal_delete_excerpt', {
      articleId,
      excerptId: ex.structuredContent.excerptId,
    });
    console.log('journal_delete_excerpt ->', del.isError ? 'ERROR' : 'ok');
  } finally {
    await call('journal_delete_article', { id: articleId });
    const gone = await call('journal_get_article', { id: articleId });
    console.log('cleanup — temp article removed:', gone.isError === true);
  }
  console.log('\nWRITE PATH OK');
}

  await client.close();
  server.close();
} finally {
  await dropKey();
  process.removeAllListeners('exit');
}
