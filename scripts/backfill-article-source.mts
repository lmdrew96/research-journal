// One-shot: stamp `source` on articles saved before the field existed.
//
// The value is INFERRED, not recorded. The in-app search path has always set
// both a DOI and a doi.org URL, and hand-added articles almost never have both,
// so: DOI and URL present -> 'crossref', otherwise 'manual'. Articles that
// already carry a source are left alone, which makes re-running a no-op.
//
// Writes go through the app's own path — readBlob, then writeBlob with the
// decomposer's queries in the same transaction — so the blob backup and the
// relational tables move together and a concurrent write is refused, never
// overwritten. Requires migration 0007 to be applied first.
//
//     npx tsx --env-file=.env scripts/backfill-article-source.mts           # dry run
//     npx tsx --env-file=.env scripts/backfill-article-source.mts --apply   # write
//     add --user=<userId> to limit either to one account

import { neon } from '@neondatabase/serverless';
import { readBlob, writeBlob } from '../api/_blob-store.ts';
import { buildRecomposeQueries, assembleAppUserData } from '../api/_recomposer.ts';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import type { AppUserData, ArticleSource } from '../src/types/index.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');
const onlyUser = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length);

const infer = (a: { doi: string | null; url: string | null }): ArticleSource =>
  a.doi && a.url ? 'crossref' : 'manual';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function main(): Promise<void> {
  const users: Array<{ user_id: string }> = onlyUser
    ? [{ user_id: onlyUser }]
    : await sql`SELECT user_id FROM app_data ORDER BY user_id`;

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${users.length} account(s)\n`);
  let total = 0;
  let failed = 0;

  for (const { user_id: userId } of users) {
    // Revision first, state second: if anything lands in between, the revision
    // moves and writeBlob refuses the write.
    const snapshot = await readBlob(sql, userId);
    if (!snapshot) {
      console.log(`${userId}: no data, skipped`);
      continue;
    }
    // The relational tables are the source of truth; the blob body is a backup.
    const data: AppUserData | null = assembleAppUserData(
      await sql.transaction(buildRecomposeQueries(sql, userId)),
    );
    if (!data) {
      console.log(`${userId}: relational copy not representable (pre-v4 data), skipped`);
      continue;
    }

    const changes: string[] = [];
    for (const project of data.projects) {
      for (const article of project.library) {
        if (article.source) continue;
        article.source = infer(article);
        changes.push(
          `  ${article.source.padEnd(8)}  ${clip(article.title, 70)}` +
            `  [${project.name}; doi ${article.doi ? 'yes' : 'no'}, url ${article.url ? 'yes' : 'no'}]`,
        );
      }
    }

    console.log(`${userId}: ${changes.length} article(s) to stamp`);
    for (const line of changes) console.log(line);
    total += changes.length;

    if (!apply || changes.length === 0) continue;

    data.lastModified = new Date().toISOString();
    const decompose = await buildDecomposeQueries(sql, userId, data);
    const result = await writeBlob(sql, userId, data, snapshot.rev, decompose);
    if (result.ok) {
      console.log(`  written — revision ${snapshot.rev} → ${result.rev}`);
    } else {
      // Someone wrote this account mid-run. Nothing was saved; re-running
      // picks up from their state and still skips anything already stamped.
      console.log(`  REFUSED — account changed during the run (now revision ${result.current.rev}). Re-run.`);
      failed++;
    }
  }

  console.log(
    `\n${total} article(s) ${apply ? 'stamped' : 'would be stamped'}` +
      (failed ? `; ${failed} account(s) refused, re-run to finish` : '') +
      (apply ? '' : '. Re-run with --apply to write.'),
  );
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
