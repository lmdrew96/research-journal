// Differential test for the delta write path.
//
// The claim being checked is exact: for any mutation, applying
// diffToOps(prev, next) must leave the relational tables in the SAME state as
// decomposing the whole `next` document. Two synthetic users get the identical
// sequence of mutations — one through the ops path, one through the
// whole-document path — and their recomposed state is compared after every
// step. A divergence anywhere means a delta is silently losing something.
//
//     npx tsx --env-file=.env scripts/smoke-ops.mts

import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import { buildRecomposeQueries, assembleAppUserData, findFirstDiff } from '../api/_recomposer.ts';
import { buildIdMapQueries, assembleIdMaps } from '../api/_id-maps.ts';
import { buildOpsQueries } from '../api/_ops.ts';
import { bumpRev, readBlob, refreshBlobFromRelational } from '../api/_blob-store.ts';
import { diffToOps } from '../src/lib/diff-to-ops.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

type Any = any;

const sql = neon(process.env.DATABASE_URL);
const U_OPS = `__ops_${randomUUID()}`;
const U_DOC = `__doc_${randomUUID()}`;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const stamp = (b: Any): Any => { b.lastModified = new Date().toISOString(); return b; };

async function recompose(user: string) {
  return assembleAppUserData(await (sql as Any).transaction(buildRecomposeQueries(sql, user)));
}

async function seed(user: string, blob: Any) {
  const rest = clone(blob);
  delete rest.rev;
  await sql`INSERT INTO app_data (user_id, data, updated_at)
            VALUES (${user}, jsonb_set(${JSON.stringify(rest)}::jsonb,'{rev}',to_jsonb(1::bigint)), now())`;
  await (sql as Any).transaction(await buildDecomposeQueries(sql, user, rest));
}

async function cleanup(user: string) {
  await sql`DELETE FROM tags WHERE user_id = ${user}`;
  await sql`DELETE FROM user_settings WHERE user_id = ${user}`;
  await sql`DELETE FROM projects WHERE user_id = ${user}`;
  await sql`DELETE FROM app_data WHERE user_id = ${user}`;
}

/**
 * Apply one mutation both ways and assert the two land identically.
 * Returns the ops payload size so the size claims can be checked too.
 */
async function step(label: string, prev: Any, next: Any): Promise<number> {
  // Whole-document path.
  await (sql as Any).transaction(await buildDecomposeQueries(sql, U_DOC, next));

  // Delta path.
  const ops = diffToOps(prev, next);
  const idResults = await (sql as Any).transaction(buildIdMapQueries(sql, U_OPS));
  const plan = buildOpsQueries(sql, U_OPS, ops, assembleIdMaps(idResults));
  if (plan.unresolved.length > 0) {
    check(`${label}: all ops resolved`, false, plan.unresolved.join(', '));
    return 0;
  }
  await (sql as Any).transaction(plan.queries);

  const viaOps = await recompose(U_OPS);
  const viaDoc = await recompose(U_DOC);
  const diff = !viaOps || !viaDoc ? 'a copy was not representable' : findFirstDiff(viaDoc, viaOps);

  const opsBytes = JSON.stringify(ops).length;
  const docBytes = JSON.stringify(next).length;
  check(
    `${label}`,
    !diff,
    diff ? String(diff) : `${ops.length} ops, ${opsBytes}B vs ${docBytes}B document`,
  );
  return opsBytes;
}

async function main() {
  console.log('\ndelta writes — ops path vs whole-document path\n');

  const src = await sql`SELECT data FROM app_data ORDER BY pg_column_size(data) DESC LIMIT 1`;
  const base = clone(src[0].data as Any);
  delete base.rev;
  const articles = (base.projects ?? []).reduce((s: number, p: Any) => s + (p.library?.length ?? 0), 0);
  console.log(`  fixture: ${base.projects.length} projects, ${articles} articles, ${JSON.stringify(base).length}B\n`);

  await seed(U_OPS, base);
  await seed(U_DOC, base);

  const start = await recompose(U_OPS);
  check('both users start identical', !findFirstDiff(start, await recompose(U_DOC)));

  let prev = clone(base);
  const proj = () => prev.projects.find((p: Any) => p.library?.length > 0);
  const sizes: Record<string, number> = {};

  // 1. Edit one article's notes — the canonical small edit.
  let next = clone(prev);
  next.projects.find((p: Any) => p.id === proj().id).library[0].notes = `edited ${Date.now()}`;
  sizes.editArticle = await step('edit one article', prev, stamp(next));
  prev = next;

  // 2. viewState only — opening the Library.
  next = clone(prev);
  next.viewState = { ...(next.viewState ?? {}), [next.activeProjectId]: { libraryFilter: 'oa' } };
  sizes.viewState = await step('filter change (viewState only)', prev, stamp(next));
  prev = next;

  // 3. Add an article with a tag.
  next = clone(prev);
  const newArticleId = `ops-art-${randomUUID()}`;
  next.projects.find((p: Any) => p.id === proj().id).library.unshift({
    id: newArticleId, title: 'Ops Test Article', authors: ['Tester, A.'], year: 2026,
    journal: null, doi: null, url: null, abstract: null, notes: '', excerpts: [],
    linkedQuestions: [], status: 'to-read', tags: ['ops-tag'], aiSummary: null,
    isOpenAccess: false, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  sizes.addArticle = await step('add an article (with a new tag)', prev, stamp(next));
  prev = next;

  // 4. Add an excerpt to that article — a child riding inside its parent.
  next = clone(prev);
  next.projects.find((p: Any) => p.id === proj().id).library
    .find((a: Any) => a.id === newArticleId).excerpts.push({
      id: `ops-exc-${randomUUID()}`, quote: 'a quote', comment: 'a comment',
      createdAt: new Date().toISOString(), source: 'manual',
    });
  sizes.addExcerpt = await step('add an excerpt', prev, stamp(next));
  prev = next;

  // 5. Link that article to an existing question.
  const someQuestion = prev.projects.flatMap((p: Any) => p.themes ?? [])
    .flatMap((t: Any) => t.questions ?? [])[0];
  if (someQuestion) {
    next = clone(prev);
    next.projects.find((p: Any) => p.id === proj().id).library
      .find((a: Any) => a.id === newArticleId).linkedQuestions.push(someQuestion.id);
    sizes.linkQuestion = await step('link the article to a question', prev, stamp(next));
    prev = next;
  }

  // 6. Question user data — star it and add a note.
  if (someQuestion) {
    next = clone(prev);
    const p0 = next.projects.find((p: Any) => (p.themes ?? []).some((t: Any) =>
      (t.questions ?? []).some((q: Any) => q.id === someQuestion.id)));
    p0.questions = p0.questions ?? {};
    p0.questions[someQuestion.id] = {
      status: 'exploring', starred: true, searchPhrases: ['a phrase'],
      notes: [{ id: `ops-note-${randomUUID()}`, content: 'a research note',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
      userSources: [{ id: `ops-src-${randomUUID()}`, text: 'a source', doi: null, url: null,
                      notes: '', addedAt: new Date().toISOString() }],
    };
    sizes.questionUserData = await step('star a question, add a note + source', prev, stamp(next));
    prev = next;
  }

  // 7. Rename a theme.
  next = clone(prev);
  const themeHost = next.projects.find((p: Any) => (p.themes ?? []).length > 0);
  if (themeHost) {
    themeHost.themes[0].theme = `Renamed ${Date.now()}`;
    sizes.renameTheme = await step('rename a theme', prev, stamp(next));
    prev = next;
  }

  // 8. Add a study with a hypothesis, a decision, and a supersede chain.
  next = clone(prev);
  const host = next.projects.find((p: Any) => p.id === proj().id);
  const h1 = `ops-h1-${randomUUID()}`;
  const h2 = `ops-h2-${randomUUID()}`;
  host.studies = host.studies ?? [];
  host.studies.push({
    id: `ops-study-${randomUUID()}`, title: 'Ops Study', status: 'planned',
    description: 'why', design: 'how', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), linkedQuestions: someQuestion ? [someQuestion.id] : [],
    hypotheses: [
      { id: h1, label: 'H1', statement: 'first', status: 'superseded', supersededBy: h2,
        questionId: someQuestion?.id ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: h2, label: 'H1', statement: 'revised', status: 'active', supersededBy: null,
        questionId: someQuestion?.id ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    decisions: [
      { id: `ops-d1-${randomUUID()}`, decision: 'chose X', alternativesRejected: 'Y', rationale: 'because',
        status: 'settled', supersededBy: null, hypothesisId: h2,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
  });
  sizes.addStudy = await step('add a study with a supersede chain', prev, stamp(next));
  prev = next;

  // 9. Journal entry with tags, linked to a question.
  next = clone(prev);
  const jHost = next.projects.find((p: Any) => p.id === proj().id);
  jHost.journal = jHost.journal ?? [];
  jHost.journal.unshift({
    id: `ops-j-${randomUUID()}`, content: 'a journal entry',
    questionId: someQuestion?.id ?? null, themeId: null, tags: ['ops-tag', 'journal-tag'],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  sizes.addJournal = await step('add a journal entry with tags', prev, stamp(next));
  prev = next;

  // 10. Reorder the library — content identical, positions all move.
  next = clone(prev);
  next.projects.find((p: Any) => p.id === proj().id).library.reverse();
  sizes.reorder = await step('reverse the library order', prev, stamp(next));
  prev = next;

  // 11. Delete the article we added.
  next = clone(prev);
  const dp = next.projects.find((p: Any) => p.id === proj().id);
  dp.library = dp.library.filter((a: Any) => a.id !== newArticleId);
  sizes.deleteArticle = await step('delete an article', prev, stamp(next));
  prev = next;

  // 12. Delete a whole project.
  if (prev.projects.length >= 2) {
    next = clone(prev);
    next.projects.pop();
    next.activeProjectId = next.projects[0].id;
    sizes.deleteProject = await step('delete a project', prev, stamp(next));
    prev = next;
  }

  // ── the size claim, which is the whole point ──
  const docBytes = JSON.stringify(prev).length;
  console.log('\n  payload, delta vs whole document:');
  for (const [k, v] of Object.entries(sizes)) {
    console.log(`    ${k.padEnd(18)} ${String(v).padStart(6)}B   (document: ${docBytes}B)`);
  }
  // ── the commit path: ops ride the same guard the document path does ──
  console.log('\n  -- commit: revision guard covers the ops --');

  const startRev = (await readBlob(sql, U_OPS))!.rev;
  const marker = clone(prev);
  marker.projects[0].name = `guarded-${Date.now()}`;
  const goodOps = diffToOps(prev, stamp(marker));
  const goodPlan = buildOpsQueries(sql, U_OPS, goodOps,
    assembleIdMaps(await (sql as Any).transaction(buildIdMapQueries(sql, U_OPS))));

  const okWrite = await bumpRev(sql, U_OPS, startRev, goodPlan.queries);
  check('ops on the current revision apply', okWrite.ok === true);
  check('the revision advanced', okWrite.ok && okWrite.rev === startRev + 1,
    okWrite.ok ? `rev ${okWrite.rev}` : '');
  const namesAfter = await sql`SELECT name FROM projects WHERE user_id = ${U_OPS} ORDER BY position`;
  check('and the rows changed', namesAfter[0].name === marker.projects[0].name,
    String(namesAfter[0].name));

  // Now the case D depends on: a stale base must roll the OPS back, not just
  // refuse the revision bump.
  const loser = clone(marker);
  loser.projects[0].name = 'LOSER-SHOULD-NOT-EXIST';
  const loserOps = diffToOps(marker, stamp(loser));
  const loserPlan = buildOpsQueries(sql, U_OPS, loserOps,
    assembleIdMaps(await (sql as Any).transaction(buildIdMapQueries(sql, U_OPS))));
  const rejected = await bumpRev(sql, U_OPS, startRev, loserPlan.queries);

  check('ops on a stale revision are rejected', rejected.ok === false);
  const namesFinal = await sql`SELECT name FROM projects WHERE user_id = ${U_OPS} ORDER BY position`;
  check(
    'and the ops rolled back with it — the loser reached no table',
    namesFinal[0].name !== 'LOSER-SHOULD-NOT-EXIST',
    `project is "${namesFinal[0].name}", ${loserPlan.queries.length} queries were in that transaction`,
  );

  // ── the blob backup tracks the rows after a delta write ──
  const afterRel = await recompose(U_OPS);
  await refreshBlobFromRelational(sql, U_OPS, afterRel!);
  const refreshed = await readBlob(sql, U_OPS);
  check('the blob backup refreshes from the rows',
    (refreshed!.data as Any).projects[0].name === marker.projects[0].name);
  const expectedRev = okWrite.ok ? okWrite.rev : -1;
  check('and the refresh preserves the revision', refreshed!.rev === expectedRev,
    `rev ${refreshed!.rev} vs ${expectedRev}`);

  check('a filter change sends well under 1KB', sizes.viewState < 1024, `${sizes.viewState}B`);
  check('a one-article edit sends far less than the document',
    sizes.editArticle < docBytes / 5, `${sizes.editArticle}B vs ${docBytes}B`);
  check('deleting an article is tiny', sizes.deleteArticle < 1024, `${sizes.deleteArticle}B`);
}

try {
  await main();
} finally {
  await cleanup(U_OPS);
  await cleanup(U_DOC);
  console.log('\ncleanup: test rows removed');
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
