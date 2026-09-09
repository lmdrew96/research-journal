// Exercises the app_data concurrency guard (api/_blob-store.ts) end to end
// against the real database.
//
// Everything happens under a synthetic user_id that no Clerk account can hold,
// and its rows are deleted on the way out — this never touches a real account's
// data, and needs no --user. Run it after any change to the guard's SQL:
//
//     npx tsx --env-file=.env scripts/smoke-cas.mts
//
// tsx, not `node --experimental-strip-types`: api/ uses .js specifiers that
// only resolve through tsx's loader (same reason smoke-mcp.mts runs that way).

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AppUserData } from '../src/types/index.ts';
import { readBlob, writeBlob, revOf, parseIfMatch, REV_FORCE } from '../api/_blob-store.ts';
import { readData, writeData } from '../api/_mcp/store.ts';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const [k, ...rest] = line.split('=');
    if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim();
  }
} catch {
  /* .env optional if env vars are already set */
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const TEST_USER = `__cas_selftest_${randomUUID()}`;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function blob(marker: string): AppUserData {
  return {
    version: 4,
    projects: [
      {
        id: 'p1',
        name: marker,
        description: '',
        icon: 'brain',
        color: '#7B61FF',
        createdAt: new Date().toISOString(),
        themes: [],
        questions: {},
        journal: [],
        library: [],
      },
    ],
    activeProjectId: 'p1',
    lastModified: new Date().toISOString(),
  } as AppUserData;
}

const nameOf = (d: AppUserData) => d.projects[0]?.name;

async function main() {
  console.log(`\napp_data concurrency guard — test user ${TEST_USER}\n`);

  // ── parseIfMatch (pure) ──
  check('parseIfMatch("3") -> 3', parseIfMatch('3') === 3);
  check('parseIfMatch("0") -> 0', parseIfMatch('0') === 0);
  check('parseIfMatch(undefined) -> force', parseIfMatch(undefined) === REV_FORCE);
  check('parseIfMatch("*") -> force', parseIfMatch('*') === REV_FORCE);
  check('parseIfMatch("garbage") -> force', parseIfMatch('garbage') === REV_FORCE);
  check('parseIfMatch("-1") -> force', parseIfMatch('-1') === REV_FORCE);

  // ── no row yet ──
  check('readBlob on a missing row is null', (await readBlob(sql, TEST_USER)) === null);

  // ── first write creates the row at rev 1 ──
  const first = await writeBlob(sql, TEST_USER, blob('one'), 0);
  check('first write applies', first.ok === true);
  check('first write lands at rev 1', first.ok && first.rev === 1, first.ok ? `rev ${first.rev}` : '');

  const afterFirst = await readBlob(sql, TEST_USER);
  check('row reads back at rev 1', afterFirst?.rev === 1, `rev ${afterFirst?.rev}`);
  check('row reads back its content', nameOf(afterFirst!.data) === 'one');
  check('rev is carried inside the blob JSON', revOf(afterFirst!.data) === 1);

  // ── a write on the current rev applies ──
  const second = await writeBlob(sql, TEST_USER, blob('two'), 1);
  check('write on the current rev applies', second.ok === true);
  check('rev advances to 2', second.ok && second.rev === 2, second.ok ? `rev ${second.rev}` : '');

  // ── THE BUG: a write on a stale rev must be refused, not applied ──
  const stale = await writeBlob(sql, TEST_USER, blob('STALE'), 1);
  check('write on a stale rev is REFUSED', stale.ok === false);
  check(
    'refusal reports the winning revision',
    !stale.ok && stale.current.rev === 2,
    !stale.ok ? `rev ${stale.current.rev}` : '',
  );
  check(
    'refusal hands back the winning blob',
    !stale.ok && nameOf(stale.current.data) === 'two',
    !stale.ok ? `name ${nameOf(stale.current.data)}` : '',
  );

  const afterStale = await readBlob(sql, TEST_USER);
  check('a refused write changed NOTHING', nameOf(afterStale!.data) === 'two', `name ${nameOf(afterStale!.data)}`);
  check('a refused write did not advance the rev', afterStale?.rev === 2, `rev ${afterStale?.rev}`);

  // ── a write from the future is refused too (not just older ones) ──
  const ahead = await writeBlob(sql, TEST_USER, blob('AHEAD'), 99);
  check('write claiming an unreachable rev is refused', ahead.ok === false);
  check('and still changed nothing', nameOf((await readBlob(sql, TEST_USER))!.data) === 'two');

  // ── rebase: re-read, re-apply, succeed ──
  const base = await readBlob(sql, TEST_USER);
  const rebased = await writeBlob(sql, TEST_USER, blob('rebased'), base!.rev);
  check('re-reading and retrying succeeds', rebased.ok === true);
  check('rev advances to 3', rebased.ok && rebased.rev === 3, rebased.ok ? `rev ${rebased.rev}` : '');

  // ── force overwrites regardless of base, and keeps rev monotonic ──
  const forced = await writeBlob(sql, TEST_USER, blob('forced'), REV_FORCE);
  check('forced write applies over any base', forced.ok === true);
  check('forced write still advances the rev', forced.ok && forced.rev === 4, forced.ok ? `rev ${forced.rev}` : '');
  check('forced write replaced the content', nameOf((await readBlob(sql, TEST_USER))!.data) === 'forced');

  // ── a legacy row (no rev field) reads as 0 and bootstraps cleanly ──
  await sql`UPDATE app_data SET data = data - 'rev' WHERE user_id = ${TEST_USER}`;
  const legacy = await readBlob(sql, TEST_USER);
  check('a pre-guard row reads as rev 0', legacy?.rev === 0, `rev ${legacy?.rev}`);
  const bootstrapped = await writeBlob(sql, TEST_USER, blob('bootstrapped'), 0);
  check('a client quoting rev 0 can write to a pre-guard row', bootstrapped.ok === true);
  check('and it is stamped rev 1', bootstrapped.ok && bootstrapped.rev === 1, bootstrapped.ok ? `rev ${bootstrapped.rev}` : '');

  // ── two racers, one winner (the real scenario) ──
  const racerBase = (await readBlob(sql, TEST_USER))!.rev;
  const [a, b] = await Promise.all([
    writeBlob(sql, TEST_USER, blob('racer-A'), racerBase),
    writeBlob(sql, TEST_USER, blob('racer-B'), racerBase),
  ]);
  const winners = [a, b].filter((r) => r.ok).length;
  check('exactly one concurrent writer wins', winners === 1, `${winners} won`);
  const final = await readBlob(sql, TEST_USER);
  check(
    'the loser did not overwrite the winner',
    ['racer-A', 'racer-B'].includes(nameOf(final!.data) as string),
    `name ${nameOf(final!.data)}, rev ${final!.rev}`,
  );

  // ── REGRESSION: patch 3b846c37, reproduced through the real MCP store ──
  //
  // The original loss: the MCP reads the blob, the app pushes its own copy
  // while the tool is still running, and the MCP's write then lands on top and
  // erases the app's. Studies surfaced it because they were new, but nothing
  // about the mechanism was studies-specific.
  console.log('\n  -- regression: MCP write vs. a concurrent app push --');

  await writeBlob(sql, TEST_USER, blob('before-anything'), REV_FORCE);

  // 1. An MCP tool reads. readData records the revision it read at.
  const mcpData = await readData(TEST_USER);
  const mcpBaseRev = (await readBlob(sql, TEST_USER))!.rev;

  // 2. The app's debounced push lands while the tool is still working.
  const appPush = await writeBlob(sql, TEST_USER, blob('app-wrote-this'), mcpBaseRev);
  check('the app push applies (it is based on the current rev)', appPush.ok === true);

  // 3. The tool finishes its mutation and writes. Before this patch it
  //    overwrote the app's work without a word.
  mcpData.projects[0].name = 'mcp-wrote-this';
  let mcpThrew: Error | null = null;
  try {
    await writeData(TEST_USER, mcpData);
  } catch (e) {
    mcpThrew = e as Error;
  }

  check('the stale MCP write is REJECTED, not applied', mcpThrew !== null);
  check(
    'the rejection names both revisions so the cause is legible',
    !!mcpThrew && /revision \d+.*revision \d+/s.test(mcpThrew.message),
    mcpThrew ? mcpThrew.message.slice(0, 80) + '…' : 'no error thrown',
  );

  const afterRegression = await readBlob(sql, TEST_USER);
  check(
    "the app's write SURVIVED",
    nameOf(afterRegression!.data) === 'app-wrote-this',
    `name ${nameOf(afterRegression!.data)}`,
  );

  // 4. And the documented recovery works: re-run the tool, it re-reads, and
  //    the same mutation now applies on top of the app's write.
  const retryData = await readData(TEST_USER);
  retryData.projects[0].name = 'mcp-wrote-this';
  await writeData(TEST_USER, retryData);
  check(
    're-running the tool applies it on top of the app write',
    nameOf((await readBlob(sql, TEST_USER))!.data) === 'mcp-wrote-this',
  );
}

try {
  await main();
} finally {
  // writeData dual-writes to the relational tables, so the synthetic user has
  // rows outside app_data too. projects cascades; tags and user_settings do not.
  await sql`DELETE FROM tags WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM user_settings WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM projects WHERE user_id = ${TEST_USER}`;
  await sql`DELETE FROM app_data WHERE user_id = ${TEST_USER}`;
  const left = await sql`
    SELECT 1 FROM app_data WHERE user_id = ${TEST_USER}
    UNION ALL SELECT 1 FROM projects WHERE user_id = ${TEST_USER}
    UNION ALL SELECT 1 FROM tags WHERE user_id = ${TEST_USER}
    UNION ALL SELECT 1 FROM user_settings WHERE user_id = ${TEST_USER}
  `;
  console.log(`\ncleanup: test rows ${left.length === 0 ? 'removed' : `STILL PRESENT (${left.length}) — remove them manually`}`);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
