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

    // --- theme update / delete, exercised inside the temp project ---
    const themeId = theme.structuredContent.themeId;

    const renamed = await call('journal_update_theme', {
      themeId,
      theme: 'smoke-mcp theme (renamed)',
      description: 'renamed by the smoke test',
      color: '#B84A62',
      icon: 'compass',
    });
    console.log('journal_update_theme ->', renamed.isError ? `ERROR: ${renamed.content[0].text}` : 'ok');
    const afterRename = await call('journal_get_themes');
    const renamedTheme = afterRename.structuredContent.themes.find((t: any) => t.id === themeId);
    console.log('rename visible via journal_get_themes:',
      renamedTheme?.theme === 'smoke-mcp theme (renamed)',
      '| id stable:', renamedTheme?.id === themeId);
    const relRenamed = await sql`
      SELECT name, color, icon FROM themes WHERE client_id = ${themeId}
    `;
    console.log('rename reached the relational tables:',
      relRenamed[0]?.name === 'smoke-mcp theme (renamed)' &&
      relRenamed[0]?.color === '#B84A62' && relRenamed[0]?.icon === 'compass');

    // A no-op update must not claim it changed anything.
    const noop = await call('journal_update_theme', { themeId });
    console.log('empty journal_update_theme is a no-op:',
      noop.isError !== true && noop.structuredContent.changed.length === 0);

    // Delete must refuse while the theme still holds questions.
    // The field is `q`, not `question` — passing the wrong name fails schema
    // validation, and the whole refusal path below then silently tests nothing.
    const q = await call('journal_add_question', {
      themeId,
      q: 'smoke-mcp temp question',
    });
    console.log('temp question added:',
      q.isError !== true && typeof q.structuredContent?.questionId === 'string');
    // Read it back rather than trusting the response: the refusal assertion
    // below is only meaningful if the question is genuinely there.
    const withQuestion = await call('journal_get_questions');
    console.log('temp question visible on the theme:',
      withQuestion.structuredContent.questions.some(
        (item: any) => item.id === q.structuredContent?.questionId,
      ));
    const blocked = await call('journal_delete_theme', { themeId });
    console.log('journal_delete_theme refuses a non-empty theme:', blocked.isError === true);

    // There is no delete-question tool, so empty the theme through the store —
    // the same path the temp-project cleanup below uses.
    const emptying = await readData(userArg);
    for (const p of emptying.projects) {
      const t = p.themes.find((t) => t.id === themeId);
      if (t) t.questions = [];
    }
    await writeData(userArg, emptying);

    const dropped = await call('journal_delete_theme', { themeId });
    console.log('journal_delete_theme on an empty theme ->',
      dropped.isError ? `ERROR: ${dropped.content[0].text}` : 'ok');
    const afterDelete = await call('journal_get_themes');
    console.log('theme gone from journal_get_themes:',
      !afterDelete.structuredContent.themes.some((t: any) => t.id === themeId));
    // journal_delete_theme is a SOFT delete — the row stays with deleted_at
    // populated so "Recently deleted" can restore it. Asserting the row is
    // absent tests the opposite of the intended behaviour.
    const relDeleted = await sql`
      SELECT deleted_at FROM themes WHERE client_id = ${themeId}
    `;
    console.log('theme soft-deleted in the relational tables:',
      relDeleted.length === 1 && relDeleted[0].deleted_at !== null);

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

if (runWrites) {
  // --- study / hypothesis / decision tools ---
  const marker = `smoke-study-${Date.now()}`;
  const someQuestion = (await call('journal_get_questions')).structuredContent.questions[0];

  const madeStudy = await call('journal_add_study', {
    title: `smoke-mcp temp study ${marker}`,
    description: 'created by scripts/smoke-mcp.mts',
    design: '## Variables\n\nTrait score, contextual diversity.',
    status: 'in_progress',
  });
  const studyId = madeStudy.structuredContent.studyId;
  console.log('\njournal_add_study ->',
    madeStudy.isError ? `ERROR: ${madeStudy.content[0].text}` : studyId);

  try {
    // Relational dual-write, the same check the other tool families make.
    const relStudy = await sql`
      SELECT id, title, status, design FROM studies WHERE client_id = ${studyId}
    `;
    console.log('relational studies row:', relStudy.length === 1,
      '| status/design preserved:',
      relStudy[0]?.status === 'in_progress' && relStudy[0]?.design.includes('Trait score'));

    // Every MCP write re-decomposes the whole tree (DELETE + reinsert), so a
    // relational uuid captured before a write is stale after it. Re-resolve
    // through the stable client_id at each check rather than holding one.
    const studyUuid = async (): Promise<string | null> => {
      const r = await sql`SELECT id FROM studies WHERE client_id = ${studyId}`;
      return (r[0]?.id as string) ?? null;
    };

    // Link to a real question, and refuse a fake one.
    if (someQuestion) {
      const linked = await call('journal_link_study_question', {
        studyId, questionId: someQuestion.id, linked: true,
      });
      console.log('journal_link_study_question ->', linked.isError ? 'ERROR' : 'ok');
      const relLink = await sql`
        SELECT 1 FROM study_questions WHERE study_id = ${await studyUuid()}
      `;
      console.log('relational study_questions row:', relLink.length === 1);
    }
    const badLink = await call('journal_link_study_question', {
      studyId, questionId: 'nope-not-real', linked: true,
    });
    console.log('bad questionId rejected:', badLink.isError === true);

    // A revision chain, built the way a real session would build it.
    const h1 = await call('journal_add_hypothesis', {
      studyId,
      statement: 'v1 ADHD individuals seek out unassigned vocabulary',
      label: 'H1',
      questionId: someQuestion?.id ?? null,
    });
    const h1Id = h1.structuredContent.hypothesisId;
    console.log('journal_add_hypothesis ->', h1.isError ? `ERROR: ${h1.content[0].text}` : h1Id);

    const sup1 = await call('journal_supersede_hypothesis', {
      hypothesisId: h1Id,
      newStatement: 'v2 ADHD trait score predicts actively seeking vocabulary',
      rationale: 'group-membership phrasing contradicts the continuous-trait-score design',
    });
    const h2Id = sup1.structuredContent.newHypothesisId;
    console.log('journal_supersede_hypothesis ->', sup1.isError ? 'ERROR' : 'ok');

    const sup2 = await call('journal_supersede_hypothesis', {
      hypothesisId: h2Id,
      newStatement: 'v3 ADHD trait score predicts acquisition of untaught, low-CD items',
      rationale: 'claims a behaviour; the instrument measures a product',
    });
    const h3Id = sup2.structuredContent.newHypothesisId;

    // AC: superseding is ONE call — old row marked and pointed in the same write.
    const detail = await call('journal_get_study', { studyId });
    const hyps = detail.structuredContent.study.hypotheses;
    const byId = (id: string) => hyps.find((h: any) => h.id === id);
    console.log('supersede is atomic — old marked and pointed in one call:',
      byId(h1Id)?.status === 'superseded' && byId(h1Id)?.supersededBy === h2Id &&
      byId(h2Id)?.status === 'superseded' && byId(h2Id)?.supersededBy === h3Id &&
      byId(h3Id)?.status === 'active' && byId(h3Id)?.supersededBy === null);
    console.log('label and question carried forward:',
      byId(h3Id)?.label === 'H1' && byId(h3Id)?.questionId === (someQuestion?.id ?? null));

    // AC: rationale becomes a settled decision pointing at the NEW hypothesis.
    const rationaleDecisions = detail.structuredContent.study.decisions
      .filter((d: any) => d.rationale?.includes('contradicts the continuous'));
    console.log('rationale recorded as a decision on the new hypothesis:',
      rationaleDecisions.length === 1 &&
      rationaleDecisions[0].hypothesisId === h2Id &&
      rationaleDecisions[0].status === 'settled');

    // Superseding an already-superseded row must be refused, not chained sideways.
    const stale = await call('journal_supersede_hypothesis', {
      hypothesisId: h1Id, newStatement: 'branching off a dead link',
    });
    console.log('superseding an already-superseded hypothesis rejected:', stale.isError === true);

    // The chain reads back oldest -> newest with its rationales.
    const chain = await call('journal_get_hypothesis_chain', { hypothesisId: h2Id });
    const versions = chain.structuredContent.chain;
    console.log('journal_get_hypothesis_chain walks back to the head:',
      versions.length === 3 && versions[0].id === h1Id && versions[2].id === h3Id);

    // Relational side: superseded_by resolved through the self-FK.
    const relChain = await sql`
      SELECT h.client_id, sup.client_id AS superseded_by
      FROM hypotheses h
      LEFT JOIN hypotheses sup ON h.superseded_by = sup.id
      WHERE h.study_id = ${await studyUuid()} ORDER BY h.position
    `;
    console.log('relational chain intact:',
      relChain.length === 3 &&
      relChain[0].superseded_by === h2Id && relChain[1].superseded_by === h3Id &&
      relChain[2].superseded_by === null);

    // Open decisions — the "what haven't I settled" query.
    const open = await call('journal_add_decision', {
      studyId,
      decision: `Does EsPal expose a dispersion measure? ${marker}`,
    });
    console.log('journal_add_decision (open) ->', open.isError ? 'ERROR' : 'ok');
    const openList = await call('journal_get_open_decisions', { studyId });
    console.log('journal_get_open_decisions returns only the open one:',
      openList.structuredContent.decisions.length === 1 &&
      openList.structuredContent.decisions[0].id === open.structuredContent.decisionId);

    const supD = await call('journal_supersede_decision', {
      decisionId: open.structuredContent.decisionId,
      newDecision: 'Use EsPal contextual diversity, dispersion not needed',
      rationale: 'CD already captures what the dispersion measure would add',
    });
    console.log('journal_supersede_decision ->', supD.isError ? 'ERROR' : 'ok');
    const afterSup = await call('journal_get_open_decisions', { studyId });
    console.log('superseded decision leaves the open list:',
      !afterSup.structuredContent.decisions.some(
        (d: any) => d.id === open.structuredContent.decisionId));

    // AC: search covers study, hypothesis and decision text.
    const foundStudy = await call('journal_search', { query: marker });
    console.log('journal_search finds the study:',
      foundStudy.structuredContent.studies.some((s: any) => s.id === studyId));
    const foundHyp = await call('journal_search', { query: 'low-CD items' });
    console.log('journal_search matches hypothesis statements:',
      foundHyp.structuredContent.studies.some(
        (s: any) => s.matchedHypotheses.some((h: any) => h.id === h3Id)));
    const foundRat = await call('journal_search', { query: 'CD already captures' });
    console.log('journal_search matches decision rationale:',
      foundRat.structuredContent.studies.some(
        (s: any) => s.matchedDecisions.some((d: any) => d.matchedIn.includes('rationale'))));

    // Deleting a chain link clears the pointer at it rather than dangling.
    const delH = await call('journal_delete_hypothesis', { hypothesisId: h2Id });
    console.log('journal_delete_hypothesis clears inbound references:',
      delH.isError !== true && delH.structuredContent.clearedReferences >= 1);
    const afterDelH = await call('journal_get_study', { studyId });
    console.log('no dangling supersededBy left:',
      !afterDelH.structuredContent.study.hypotheses.some((h: any) => h.supersededBy === h2Id));
  } finally {
    const del = await call('journal_delete_study', { studyId });
    const goneStudy = await sql`SELECT 1 FROM studies WHERE client_id = ${studyId}`;
    const goneList = await call('journal_get_studies');
    console.log('cleanup — temp study removed (blob):',
      !goneList.structuredContent.studies.some((s: any) => s.id === studyId),
      '| (relational):', goneStudy.length === 0,
      '| delete reported:', del.isError ? 'ERROR' : 'ok');
    // Cascade: hypotheses and decisions must go with the study.
    const orphans = await sql`
      SELECT (SELECT count(*)::int FROM hypotheses h
              LEFT JOIN studies s ON h.study_id = s.id WHERE s.id IS NULL) AS h,
             (SELECT count(*)::int FROM decisions d
              LEFT JOIN studies s ON d.study_id = s.id WHERE s.id IS NULL) AS d
    `;
    console.log('no orphaned hypotheses/decisions:',
      orphans[0].h === 0 && orphans[0].d === 0);
  }
  console.log('\nSTUDY TOOLS OK');
}

  await client.close();
  server.close();
} finally {
  await dropKey();
  process.removeAllListeners('exit');
}
