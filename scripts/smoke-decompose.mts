// Proves the differential decomposer: same round-trip guarantee as the full
// rebuild, at a fraction of the writes, with stable row identity.
//
// Uses a real blob as the fixture — copied to a synthetic user_id that no Clerk
// account can hold, and deleted on the way out — so the shapes under test are
// the ones production actually stores, and no real account is ever written to.
//
//     npx tsx --env-file=.env scripts/smoke-decompose.mts

import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { buildDecomposeQueries, buildFullRebuildQueries } from '../api/_decomposer.ts';
import {
  buildRecomposeQueries,
  assembleAppUserData,
  canonicalizeBlob,
  findFirstDiff,
} from '../api/_recomposer.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const TEST_USER = `__difftest_${randomUUID()}`;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const stamp = <T extends { lastModified: string },>(b: T): T => {
  b.lastModified = new Date().toISOString();
  return b;
};

/** Decompose, then assert the relational copy reproduces the blob exactly. */
async function apply(blob: Any, label: string): Promise<number> {
  const queries = await buildDecomposeQueries(sql, TEST_USER, blob);
  await (sql as Any).transaction(queries);

  const relational = assembleAppUserData(
    await (sql as Any).transaction(buildRecomposeQueries(sql, TEST_USER)),
  );
  const expected = canonicalizeBlob(blob);
  const diff = !relational ? 'relational copy not ready' : findFirstDiff(expected, relational);
  check(`${label}: round-trip exact`, !diff, diff ? String(diff) : `${queries.length} queries`);
  return queries.length;
}

type Any = any;

async function articleUuids(): Promise<Map<string, string>> {
  const rows = await sql`
    SELECT a.id, a.client_id FROM library_articles a
    JOIN projects p ON a.project_id = p.id WHERE p.user_id = ${TEST_USER}
  `;
  return new Map(rows.map((r: Any) => [r.client_id as string, r.id as string]));
}

async function main() {
  console.log(`\ndifferential decomposer — test user ${TEST_USER}\n`);

  // Fixture: the largest real blob, so this exercises production shapes.
  const src = await sql`
    SELECT user_id, data FROM app_data
    ORDER BY pg_column_size(data) DESC LIMIT 1
  `;
  if (!src[0]) {
    console.error('No app_data rows to use as a fixture.');
    process.exit(1);
  }
  const base = clone(src[0].data as Any);
  const projects = base.projects ?? [];
  const articles = projects.reduce((s: number, p: Any) => s + (p.library?.length ?? 0), 0);
  console.log(`  fixture: ${projects.length} projects, ${articles} articles\n`);

  // ── baseline: what the old decomposer cost on every single write ──
  const fullCount = buildFullRebuildQueries(sql, TEST_USER, base).length;
  console.log(`  full rebuild (previous behaviour on EVERY write): ${fullCount} queries\n`);

  // ── 1. first write: nothing stored, so this must be a full rebuild ──
  const first = await apply(stamp(clone(base)), 'first write (cold)');
  check('cold write falls back to a full rebuild', first >= fullCount - 5, `${first} queries`);

  const uuidsAfterFirst = await articleUuids();
  check('articles got relational rows', uuidsAfterFirst.size === articles, `${uuidsAfterFirst.size} rows`);

  // ── 2. no-op: identical content, new lastModified ──
  const noop = await apply(stamp(clone(base)), 'no-op re-write');
  check('an unchanged blob costs 1 query', noop === 1, `${noop} queries`);

  // ── 3. THE case that made this urgent: a filter change ──
  const viewOnly = clone(base);
  viewOnly.viewState = { ...(viewOnly.viewState ?? {}), [viewOnly.activeProjectId]: { libraryFilter: 'oa' } };
  const viewCount = await apply(stamp(viewOnly), 'filter change (setViewState)');
  check('opening the Library costs 1 query, not 553', viewCount === 1, `${viewCount} queries`);

  // ── 4. edit one article's notes ──
  const edited = clone(viewOnly);
  const target = edited.projects.find((p: Any) => p.library?.length > 0);
  const targetArticle = target.library[0];
  targetArticle.notes = `edited by smoke-decompose ${Date.now()}`;
  const editCount = await apply(stamp(edited), 'edit one article');
  check('a one-article edit is a handful of queries', editCount < 15, `${editCount} queries`);

  // ── 5. row identity survives a write (the uuid-churn complaint) ──
  const uuidsAfterEdit = await articleUuids();
  const stable = [...uuidsAfterFirst].every(([cid, id]) => uuidsAfterEdit.get(cid) === id);
  check('every article kept its uuid across writes', stable);

  // ── 6. add an article ──
  const added = clone(edited);
  const newArticleId = `smoke-${randomUUID()}`;
  added.projects.find((p: Any) => p.id === target.id).library.push({
    id: newArticleId,
    title: 'Smoke test article',
    authors: ['Tester, A.'],
    year: 2026,
    journal: null,
    doi: null,
    url: null,
    abstract: null,
    notes: '',
    excerpts: [],
    linkedQuestions: [],
    status: 'to-read',
    tags: ['smoke-tag'],
    aiSummary: null,
    isOpenAccess: false,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const addCount = await apply(stamp(added), 'add an article');
  check('adding an article stays cheap', addCount < 15, `${addCount} queries`);

  // ── 7. delete it again ──
  const removed = clone(added);
  const proj = removed.projects.find((p: Any) => p.id === target.id);
  proj.library = proj.library.filter((a: Any) => a.id !== newArticleId);
  const delCount = await apply(stamp(removed), 'delete that article');
  check('deleting an article stays cheap', delCount < 15, `${delCount} queries`);
  check(
    'the deleted article is gone from the relational copy',
    !(await articleUuids()).has(newArticleId),
  );

  // ── 8. reorder — positions must follow even though content is identical ──
  const reordered = clone(removed);
  const rp = reordered.projects.find((p: Any) => p.id === target.id);
  if (rp.library.length >= 2) {
    rp.library.reverse();
    await apply(stamp(reordered), 'reverse the library order');
  }

  // ── 9. delete a whole project ──
  if (reordered.projects.length >= 2) {
    const pruned = clone(reordered);
    const dropped = pruned.projects.pop();
    pruned.activeProjectId = pruned.projects[0].id;
    const pruneCount = await apply(stamp(pruned), `delete project "${dropped.name}"`);
    check('deleting a project is a single cascading delete', pruneCount < 10, `${pruneCount} queries`);
  }
}

try {
  await main();
} finally {
  await sql`DELETE FROM tags WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM user_settings WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM projects WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM app_data WHERE user_id = ${TEST_USER}`;
  const left = await sql`
    SELECT 1 FROM projects WHERE user_id = ${TEST_USER}
    UNION ALL SELECT 1 FROM tags WHERE user_id = ${TEST_USER}
    UNION ALL SELECT 1 FROM user_settings WHERE user_id = ${TEST_USER}
  `;
  console.log(`\ncleanup: test rows ${left.length === 0 ? 'removed' : `STILL PRESENT (${left.length})`}`);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
