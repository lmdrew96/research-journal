// Re-decompose each user's blob into the relational tables (using the real
// Phase 2 writer from api/_decomposer.ts) and verify the Phase 3 recomposer
// reproduces the blob exactly. Replaces the old backfill-relational.mjs, whose
// duplicated logic predates client_id/position columns.
//
// Usage:
//   node --experimental-strip-types scripts/verify-relational.mts [--user=<userId>] [--verify-only]
//
// --verify-only skips the decompose step and just checks current relational state.
// Exits non-zero if any user fails verification.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import {
  buildRecomposeQueries,
  assembleAppUserData,
  canonicalizeBlob,
  findFirstDiff,
} from '../api/_recomposer.ts';

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

const args = new Set(process.argv.slice(2));
const verifyOnly = args.has('--verify-only');
const userFilter = [...args].find((a) => a.startsWith('--user='))?.slice('--user='.length);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const rows = userFilter
  ? await sql`SELECT user_id, data FROM app_data WHERE user_id = ${userFilter} ORDER BY user_id`
  : await sql`SELECT user_id, data FROM app_data ORDER BY user_id`;

console.log(`Mode: ${verifyOnly ? 'VERIFY ONLY' : 'DECOMPOSE + VERIFY'} — ${rows.length} user(s)\n`);

let failures = 0;

for (const row of rows) {
  const { user_id: userId, data: blob } = row;
  process.stdout.write(`User ${userId}: `);

  if (!verifyOnly) {
    const t0 = Date.now();
    const queries = buildDecomposeQueries(sql, userId, blob);
    // @ts-expect-error neon-http transaction signature
    await sql.transaction(queries);
    process.stdout.write(`decomposed (${queries.length} queries, ${Date.now() - t0}ms); `);
  }

  const t1 = Date.now();
  // @ts-expect-error neon-http transaction signature
  const results = await sql.transaction(buildRecomposeQueries(sql, userId));
  const relational = assembleAppUserData(results);
  const tRead = Date.now() - t1;

  if (!relational) {
    console.log(`NOT READY (missing client_ids or user_settings.last_modified) [${tRead}ms]`);
    failures++;
    continue;
  }

  const expected = canonicalizeBlob(blob);
  if (!expected) {
    console.log(`SKIP — blob is not v4 (version: ${blob?.version})`);
    continue;
  }

  if (relational.lastModified !== expected.lastModified) {
    console.log(`STALE — relational lastModified ${relational.lastModified} vs blob ${expected.lastModified}`);
    failures++;
    continue;
  }

  const diff = findFirstDiff(expected, relational);
  if (diff) {
    console.log(`MISMATCH at ${diff} [${tRead}ms]`);
    failures++;
  } else {
    const articles = relational.projects.reduce((sum, p) => sum + p.library.length, 0);
    console.log(`OK — round-trip verified (${relational.projects.length} projects, ${articles} articles) [${tRead}ms]`);
  }
}

console.log(`\n${failures === 0 ? 'All users verified.' : `${failures} user(s) FAILED verification.`}`);
process.exit(failures === 0 ? 0 : 1);
