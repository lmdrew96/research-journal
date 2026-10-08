// Delete article PDFs in R2 that no article references any more.
//
// v0.49.0 leaves objects behind on purpose or by omission: Cancel after an
// upload in the Add-article form, Replace PDF (the old object stays), and
// article delete (kept so Undo can bring the PDF back). This finds them.
//
// An object is an orphan only when ALL of these hold:
//   - its key is referenced by no library_articles.pdf_key row, in any
//     project (deleted-but-restorable ones included)
//   - its key appears nowhere in the app_data backup blob either
//   - it is older than --min-age-days (default 7), so an Add-article form
//     still open, or an Undo, is never pulled out from under someone
//
// Deletes are permanent. Runs as a dry run unless --apply is given; the apply
// pass re-reads the references right before deleting.
//
//     npx tsx --env-file=.env scripts/sweep-orphan-pdfs.mts                 # dry run
//     npx tsx --env-file=.env scripts/sweep-orphan-pdfs.mts --apply         # delete
//     --min-age-days=<n>     only objects older than n days (default 7)

import { neon } from '@neondatabase/serverless';
import { deletePdf, listPdfObjects } from '../api/_r2.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');
const minAgeArg = process.argv.find((a) => a.startsWith('--min-age-days='))?.split('=')[1];
const minAgeDays = minAgeArg === undefined ? 7 : Number(minAgeArg);
if (!Number.isFinite(minAgeDays) || minAgeDays < 1) {
  console.error('--min-age-days must be a number of at least 1');
  process.exit(1);
}

const PDF_KEY_IN_TEXT = /[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.pdf/g;

/** Every key either store still points at. */
async function referencedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const rows = await sql`SELECT pdf_key FROM library_articles WHERE pdf_key IS NOT NULL`;
  for (const r of rows) keys.add(r.pdf_key);
  const blobs = await sql`SELECT data::text AS text FROM app_data`;
  for (const b of blobs) for (const [k] of b.text.matchAll(PDF_KEY_IN_TEXT)) keys.add(k);
  return keys;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

async function main(): Promise<void> {
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  const [objects, referenced] = await Promise.all([listPdfObjects(), referencedKeys()]);

  const orphans = objects.filter((o) => !referenced.has(o.key));
  const old = orphans.filter((o) => o.lastModified.getTime() < cutoff);
  const recent = orphans.filter((o) => o.lastModified.getTime() >= cutoff);

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${objects.length} object(s) in R2, ${referenced.size} referenced key(s)\n`);
  console.log(`Unreferenced and older than ${minAgeDays} day(s) — ${apply ? 'deleting' : 'would delete'}:`);
  for (const o of old) console.log(`  ${o.key}  ${mb(o.size)}  ${o.lastModified.toISOString()}`);
  if (old.length === 0) console.log('  (none)');
  if (recent.length > 0) {
    console.log(`\nUnreferenced but newer than ${minAgeDays} day(s) — kept for now:`);
    for (const o of recent) console.log(`  ${o.key}  ${mb(o.size)}  ${o.lastModified.toISOString()}`);
  }

  if (!apply || old.length === 0) {
    if (!apply) console.log('\nDry run — nothing deleted. Re-run with --apply to delete.');
    return;
  }

  // Re-check right before deleting: a PDF attached since the listing wins.
  const fresh = await referencedKeys();
  let deleted = 0;
  for (const o of old) {
    if (fresh.has(o.key)) {
      console.log(`  skipped ${o.key}: referenced again since the listing`);
      continue;
    }
    await deletePdf(o.key);
    deleted++;
  }
  console.log(`\nDeleted ${deleted} object(s), ${mb(old.reduce((n, o) => n + o.size, 0))}.`);
}

await main();
