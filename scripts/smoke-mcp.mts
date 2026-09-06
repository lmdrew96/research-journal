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
import { readData, writeData } from '../api/_mcp/store.ts';

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

if (runWrites) {
  // --- project tools ---
  const before = await call('journal_list_projects');
  const originalActive = before.structuredContent.projects.find((p: any) => p.isActive);
  console.log('\njournal_list_projects ->', before.structuredContent.projects.length,
    'projects | active:', originalActive?.name);

  const made = await call('journal_add_project', {
    name: 'smoke-mcp temp project',
    description: 'created by scripts/smoke-mcp.mts',
    icon: 'flame',
    color: '#1ABC9C',
  });
  const newProjectId = made.structuredContent.projectId;
  console.log('journal_add_project ->', newProjectId, '| activated:', made.structuredContent.isActive);

  try {
    // AC3: a write immediately after creation must land in the NEW project.
    const theme = await call('journal_add_theme', { theme: 'smoke-mcp theme' });
    console.log('journal_add_theme into the new project ->',
      theme.isError ? `ERROR: ${theme.content[0].text}` : 'ok');
    const themes = await call('journal_get_themes');
    console.log('new project owns the theme:',
      themes.structuredContent.activeProject.id === newProjectId &&
      themes.structuredContent.themes.length === 1);

    // AC4: relational tables must reflect the new project and the active switch.
    const relProject = await sql`
      SELECT id, name, icon, color FROM projects WHERE client_id = ${newProjectId}
    `;
    console.log('relational projects row:', relProject.length === 1,
      '| icon/color preserved:', relProject[0]?.icon === 'flame' && relProject[0]?.color === '#1ABC9C');
    const relThemes = await sql`
      SELECT name FROM themes WHERE project_id = ${relProject[0]?.id ?? null}
    `;
    console.log('relational themes row under it:', relThemes.length === 1);
    const relActive = await sql`
      SELECT active_project_id FROM user_settings WHERE user_id = ${userArg}
    `;
    console.log('relational active_project_id points at it:',
      relActive[0]?.active_project_id === relProject[0]?.id);

    // AC2: switch back and confirm by reading it back, not by trusting the response.
    const back = await call('journal_set_active_project', { projectId: originalActive.id });
    console.log('journal_set_active_project ->', back.isError ? 'ERROR' : 'ok',
      '| changed:', back.structuredContent.changed);
    const confirm = await call('journal_get_themes');
    console.log('active project read back as original:',
      confirm.structuredContent.activeProject.id === originalActive.id);

    // Idempotency: switching to the already-active project is a no-op.
    const again = await call('journal_set_active_project', { projectId: originalActive.id });
    console.log('re-switch is a no-op:', again.structuredContent.changed === false);

    // Unknown id must be rejected, not silently accepted.
    const bogus = await call('journal_set_active_project', { projectId: 'does-not-exist' });
    console.log('unknown project id rejected:', bogus.isError === true);
  } finally {
    // No delete-project tool exists by design, so strip the temp project through
    // the normal store path — which keeps the relational tables in step.
    const data = await readData(userArg);
    data.projects = data.projects.filter((p) => p.id !== newProjectId);
    data.activeProjectId = originalActive.id;
    await writeData(userArg, data);
    const gone = await sql`SELECT 1 FROM projects WHERE client_id = ${newProjectId}`;
    const after = await call('journal_list_projects');
    console.log('cleanup — temp project removed (blob):',
      !after.structuredContent.projects.some((p: any) => p.id === newProjectId),
      '| (relational):', gone.length === 0);
  }
  console.log('\nPROJECT TOOLS OK');
}

if (runWrites) {
  // --- journal entry tools ---
  const themesNow = await call('journal_get_themes');
  const someTheme = themesNow.structuredContent.themes[0];
  const marker = `smoke-mcp-${Date.now()}`;

  const added = await call('journal_add_entry', {
    content: `Sourceless observation ${marker} — no article needed.`,
    themeId: someTheme?.id ?? null,
    tags: ['smoke-test', ' smoke-test ', '', 'latin'],
  });
  const entryId = added.structuredContent.entryId;
  console.log('\njournal_add_entry ->', added.isError ? `ERROR: ${added.content[0].text}` : entryId);

  try {
    // Re-read from the DB rather than trusting the write response.
    const listed = await call('journal_get_entries');
    const found = listed.structuredContent.entries.find((e: any) => e.id === entryId);
    console.log('entry reads back:', !!found);
    console.log('tags trimmed + de-duplicated:',
      JSON.stringify(found?.tags) === JSON.stringify(['smoke-test', 'latin']));
    console.log('theme link resolved to a name:', found?.themeName === (someTheme?.theme ?? null));

    // AC3: filters
    const byTag = await call('journal_get_entries', { tag: 'latin' });
    console.log('filter by tag:', byTag.structuredContent.entries.some((e: any) => e.id === entryId));
    const byTheme = await call('journal_get_entries', { themeId: someTheme?.id });
    console.log('filter by theme:', byTheme.structuredContent.entries.some((e: any) => e.id === entryId));
    const byMissing = await call('journal_get_entries', { tag: 'no-such-tag-here' });
    console.log('filter excludes non-matches:', byMissing.structuredContent.entries.length === 0);

    // AC4: search covers entries
    const found2 = await call('journal_search', { query: marker });
    console.log('journal_search finds the entry:',
      found2.structuredContent.entries.some((e: any) => e.id === entryId));
    console.log('search still returns articles separately:',
      Array.isArray(found2.structuredContent.results));

    // AC5: dangling links rejected
    const bad = await call('journal_add_entry', { content: 'x', questionId: 'nope-not-real' });
    console.log('bad questionId rejected:', bad.isError === true);
    const bad2 = await call('journal_add_entry', { content: 'x', themeId: 'nope-not-real' });
    console.log('bad themeId rejected:', bad2.isError === true);

    // update: unlink via explicit null, and confirm omitted fields survive
    const upd = await call('journal_update_entry', { id: entryId, themeId: null });
    console.log('journal_update_entry (unlink) ->', upd.isError ? 'ERROR' : 'ok');
    const after = await call('journal_get_entries');
    const updated = after.structuredContent.entries.find((e: any) => e.id === entryId);
    console.log('theme unlinked:', updated?.themeId === null);
    console.log('content survived an unrelated update:', updated?.content.includes(marker));

    // AC: relational dual-write reaches journal_entries + journal_entry_tags
    const relEntry = await sql`
      SELECT id, content FROM journal_entries WHERE client_id = ${entryId}
    `;
    console.log('relational journal_entries row:', relEntry.length === 1);
    const relTags = await sql`
      SELECT t.name FROM journal_entry_tags jt
      JOIN tags t ON t.id = jt.tag_id
      WHERE jt.journal_entry_id = ${relEntry[0]?.id ?? null}
      ORDER BY t.name
    `;
    console.log('relational journal_entry_tags rows:',
      relTags.map((r: any) => r.name).join(',') === 'latin,smoke-test');
  } finally {
    const del = await call('journal_delete_entry', { id: entryId });
    const gone = await sql`SELECT 1 FROM journal_entries WHERE client_id = ${entryId}`;
    const check = await call('journal_get_entries');
    console.log('cleanup — entry removed (blob):',
      !check.structuredContent.entries.some((e: any) => e.id === entryId),
      '| (relational):', gone.length === 0,
      '| delete reported:', del.isError ? 'ERROR' : 'ok');
  }
  console.log('\nJOURNAL ENTRY TOOLS OK');
}

  await client.close();
  server.close();
} finally {
  await dropKey();
  process.removeAllListeners('exit');
}
