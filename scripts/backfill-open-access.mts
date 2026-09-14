// Check every article with a DOI against OpenAlex for open access, and record
// the answer: correct the Open Access badge in either direction, and fill the
// free-version link.
//
// OpenAlex's open-access data is Unpaywall's, and it replaced the separate
// Unpaywall calls. Existing badges came partly from Crossref, which read any
// PDF link as "open access" — often wrong. Articles OpenAlex has no record of
// are left exactly as they are.
//
// Dry run by default. Apply re-reads each account right before writing and
// re-applies the answers to fresh data, so the minutes of lookups never race
// an edit made in the app. Writes go through readBlob/writeBlob with the
// decomposer's queries, which keeps user_settings in step with the blob.
//
//     npx tsx --env-file=.env scripts/backfill-open-access.mts           # dry run
//     npx tsx --env-file=.env scripts/backfill-open-access.mts --apply   # write

import { neon } from '@neondatabase/serverless';
import { readBlob, writeBlob } from '../api/_blob-store.ts';
import { buildRecomposeQueries, assembleAppUserData } from '../api/_recomposer.ts';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import { lookupOpenAccess, type OpenAccessInfo } from '../api/_scholar.ts';
import type { AppUserData } from '../src/types/index.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function readAccount(userId: string) {
  const snapshot = await readBlob(sql, userId);
  if (!snapshot) return null;
  const data: AppUserData | null = assembleAppUserData(
    await sql.transaction(buildRecomposeQueries(sql, userId)),
  );
  return data ? { snapshot, data } : null;
}

async function main(): Promise<void> {
  const users: Array<{ user_id: string }> = await sql`SELECT user_id FROM app_data ORDER BY user_id`;
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${users.length} account(s)\n`);
  const totals = { checked: 0, badgeOn: 0, badgeOff: 0, links: 0, noRecord: 0, failed: 0 };
  let refused = 0;

  for (const { user_id: userId } of users) {
    const account = await readAccount(userId);
    if (!account) continue;

    // article id → OpenAlex's answer, for articles whose stored state differs.
    const answers = new Map<string, OpenAccessInfo>();

    for (const project of account.data.projects) {
      const withDoi = project.library.filter((a) => a.doi);
      if (withDoi.length === 0) continue;
      console.log(`${userId} · ${project.name} — ${withDoi.length} article(s) with a DOI`);

      for (const article of withDoi) {
        totals.checked++;
        let info: OpenAccessInfo | null;
        try {
          info = await lookupOpenAccess(article.doi!);
        } catch (err) {
          totals.failed++;
          console.log(`  [failed] ${clip(article.title, 80)} — ${err instanceof Error ? err.message : err}`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 150));

        if (!info) {
          totals.noRecord++;
          console.log(`  [no OpenAlex record] ${clip(article.title, 80)} — left unchanged`);
          continue;
        }

        const changes: string[] = [];
        if (info.isOpenAccess !== article.isOpenAccess) {
          changes.push(`Open Access badge ${article.isOpenAccess ? 'on → off' : 'off → on'}`);
          if (info.isOpenAccess) totals.badgeOn++;
          else totals.badgeOff++;
        }
        if ((info.url ?? null) !== (article.unpaywallUrl ?? null)) {
          changes.push(info.url ? `free version: ${info.url}` : 'free version link removed');
          if (info.url) totals.links++;
        }
        if (!article.unpaywallCheckedAt) changes.push('marked checked');

        if (changes.length === 0) continue;
        answers.set(article.id, info);
        console.log(`  ${clip(article.title, 80)}`);
        for (const c of changes) console.log(`      ${c}`);
      }
      console.log('');
    }

    if (!apply || answers.size === 0) continue;

    const fresh = await readAccount(userId);
    if (!fresh) continue;
    const now = new Date().toISOString();
    let written = 0;
    for (const project of fresh.data.projects) {
      for (const article of project.library) {
        const info = answers.get(article.id);
        if (!info) continue;
        article.isOpenAccess = info.isOpenAccess;
        article.unpaywallUrl = info.url;
        article.unpaywallCheckedAt = now;
        article.updatedAt = now;
        written++;
      }
    }
    fresh.data.lastModified = now;
    const decompose = await buildDecomposeQueries(sql, userId, fresh.data);
    const result = await writeBlob(sql, userId, fresh.data, fresh.snapshot.rev, decompose);
    console.log(
      result.ok
        ? `${userId}: written — ${written} article(s), revision ${fresh.snapshot.rev} → ${result.rev}\n`
        : `${userId}: REFUSED — account changed during the write (now revision ${result.current.rev}). Re-run.\n`,
    );
    if (!result.ok) refused++;
  }

  console.log('── Summary ──');
  console.log(
    `${totals.checked} DOI(s) checked · badge turned on ${totals.badgeOn} · turned off ${totals.badgeOff} · ` +
      `free links ${totals.links} · no OpenAlex record ${totals.noRecord} · lookup failed ${totals.failed}`,
  );
  if (!apply) console.log('\nDry run — nothing was written. Re-run with --apply to write.');
  if (refused) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
