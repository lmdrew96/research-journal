// One-shot: convert articles still stored with the legacy status 'key-source'
// into status 'to-read' + is_key_source (Nae's choice for existing key sources,
// 2026-09-13). Requires migration 0008.
//
// Why a script and not the normal write path: the recomposer already reads a
// legacy row as to-read + key source, so an ordinary save compares the stored
// state with itself, sees nothing to change, and never rewrites the row. This
// upserts exactly the legacy rows, and writes the blob in the same guarded
// transaction (readBlob/writeBlob) so the backup is converted too. Re-running
// finds nothing left to do.
//
//     npx tsx --env-file=.env scripts/backfill-key-source.mts           # dry run
//     npx tsx --env-file=.env scripts/backfill-key-source.mts --apply   # write

import { neon } from '@neondatabase/serverless';
import { readBlob, writeBlob } from '../api/_blob-store.ts';
import { buildRecomposeQueries, assembleAppUserData } from '../api/_recomposer.ts';
import { upsertArticle } from '../api/_decomposer.ts';
import type { AppUserData, LibraryArticle } from '../src/types/index.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const users: Array<{ user_id: string }> = await sql`SELECT user_id FROM app_data ORDER BY user_id`;
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${users.length} account(s)\n`);
  let total = 0;
  let refused = 0;

  for (const { user_id: userId } of users) {
    // Revision, then state, then the rows to convert — all before the write,
    // so anything landing in between moves the revision and the write is refused.
    const snapshot = await readBlob(sql, userId);
    if (!snapshot) continue;
    const data: AppUserData | null = assembleAppUserData(
      await sql.transaction(buildRecomposeQueries(sql, userId)),
    );
    if (!data) {
      console.log(`${userId}: relational copy not representable, skipped`);
      continue;
    }

    const legacy: Array<{ id: string; project_id: string; client_id: string; position: number; project: string }> =
      await sql`SELECT a.id, a.project_id, a.client_id, a.position, p.name AS project
                FROM library_articles a JOIN projects p ON a.project_id = p.id
                WHERE p.user_id = ${userId} AND a.status = 'key-source'
                ORDER BY p.name, a.position`;
    console.log(`${userId}: ${legacy.length} legacy key-source article(s)`);
    if (legacy.length === 0) continue;

    const byClientId = new Map<string, LibraryArticle>(
      data.projects.flatMap((p) => p.library.map((a) => [a.id, a] as const)),
    );
    const upserts = legacy.flatMap((row) => {
      const article = byClientId.get(row.client_id);
      if (!article) return [];
      console.log(`  ${row.project}: ${article.title.slice(0, 80)}  → status ${article.status}, key source`);
      return [upsertArticle(sql, row.id, row.project_id, article, row.position)];
    });
    total += upserts.length;
    if (!apply) continue;

    data.lastModified = new Date().toISOString();
    const result = await writeBlob(sql, userId, data, snapshot.rev, upserts);
    if (result.ok) {
      console.log(`  written — revision ${snapshot.rev} → ${result.rev}`);
    } else {
      console.log(`  REFUSED — the account changed during the run (now revision ${result.current.rev}). Re-run.`);
      refused++;
    }
  }

  console.log(`\n${total} article(s) ${apply ? 'converted' : 'would be converted'}.` +
    (apply ? '' : ' Re-run with --apply to write.'));
  if (refused) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
