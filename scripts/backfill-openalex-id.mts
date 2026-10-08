// Record the OpenAlex work id (openAlexId) on library articles that lack one,
// so their citation trail resolves without a DOI lookup each time — and so
// DOI-less works OpenAlex does know get a trail at all.
//
// Per article without an openAlexId:
//   - DOI → OpenAlex, accepted only when the title agrees (the same check
//     journal_add_article applies — a mistyped DOI must not attach someone
//     else's work)
//   - otherwise title + lead author against OpenAlex (api/_enrich.ts
//     assessMatch, the same "confident match" rule)
//   - no confident match → left without one
// Nothing else on the article is touched.
//
// Runs as a dry run unless --apply is given. Apply re-reads the account right
// before writing and only sets ids that are still absent, so the slow lookups
// never sit inside the write's concurrency window. Writes go through
// readBlob/writeBlob like every other writer. Requires migration 0012.
//
//     npx tsx --env-file=.env scripts/backfill-openalex-id.mts            # dry run
//     npx tsx --env-file=.env scripts/backfill-openalex-id.mts --apply    # write
//     --user=<userId>        limit to one account
//     --project=<text>       limit to projects whose name contains <text>

import { neon } from '@neondatabase/serverless';
import { readBlob, writeBlob } from '../api/_blob-store.ts';
import { buildRecomposeQueries, assembleAppUserData } from '../api/_recomposer.ts';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import { assessMatch, surname, titlesAgree } from '../api/_enrich.ts';
import { lookupOpenAlexByDoi, openAlexIdOfPaper, searchOpenAlexByTitle } from '../api/_scholar.ts';
import type { AppUserData, LibraryArticle } from '../src/types/index.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const onlyUser = arg('user');
const onlyProject = arg('project')?.toLowerCase();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The OpenAlex id for an article, how it was found, and any lookup failure. */
async function resolve(
  article: LibraryArticle,
): Promise<{ id: string | null; via: string; note?: string }> {
  try {
    if (article.doi) {
      const paper = await lookupOpenAlexByDoi(article.doi);
      if (paper && titlesAgree(article.title, paper.title, 0.5)) {
        return { id: openAlexIdOfPaper(paper), via: 'doi' };
      }
    }
    const lead = article.authors[0] ? surname(article.authors[0]) || null : null;
    const query = { title: article.title, authors: article.authors, doi: article.doi };
    for (const paper of await searchOpenAlexByTitle(article.title, lead)) {
      const via = assessMatch(query, paper);
      if (via) return { id: openAlexIdOfPaper(paper), via };
    }
    return { id: null, via: 'no match' };
  } catch (err) {
    return { id: null, via: 'failed', note: err instanceof Error ? err.message : String(err) };
  }
}

async function readAccount(userId: string) {
  // Revision first, state second — see api/_blob-store.ts writeBlob.
  const snapshot = await readBlob(sql, userId);
  if (!snapshot) return null;
  const data: AppUserData | null = assembleAppUserData(
    await sql.transaction(buildRecomposeQueries(sql, userId)),
  );
  return data ? { snapshot, data } : null;
}

async function main(): Promise<void> {
  const users: Array<{ user_id: string }> = onlyUser
    ? [{ user_id: onlyUser }]
    : await sql`SELECT user_id FROM app_data ORDER BY user_id`;

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${users.length} account(s)\n`);
  const totals = { checked: 0, found: 0, unresolved: [] as string[], failed: 0 };
  let refused = 0;

  for (const { user_id: userId } of users) {
    const account = await readAccount(userId);
    if (!account) {
      console.log(`${userId}: no representable data, skipped\n`);
      continue;
    }

    const ids = new Map<string, string>();
    for (const project of account.data.projects) {
      if (onlyProject && !project.name.toLowerCase().includes(onlyProject)) continue;
      const missing = project.library.filter((a) => !a.openAlexId);
      if (missing.length === 0) continue;
      console.log(`${userId} · ${project.name} — ${missing.length} article(s) without an OpenAlex id`);

      for (const article of missing) {
        const r = await resolve(article);
        totals.checked++;
        console.log(`  [${r.id ?? r.via}${r.id ? ` · ${r.via}` : ''}] ${clip(article.title, 90)}`);
        if (r.note) console.log(`      note: ${r.note}`);
        if (r.id) {
          ids.set(article.id, r.id);
          totals.found++;
        } else if (r.via === 'failed') {
          totals.failed++;
        } else {
          totals.unresolved.push(`${project.name}: ${article.title}`);
        }
        // OpenAlex asks for polite pacing on unauthenticated use.
        await new Promise((res) => setTimeout(res, 150));
      }
      console.log('');
    }

    if (!apply || ids.size === 0) continue;

    // Apply against a fresh read, so the minutes of lookups above cannot race
    // an edit made in the app meanwhile.
    const fresh = await readAccount(userId);
    if (!fresh) continue;
    const now = new Date().toISOString();
    let written = 0;
    for (const project of fresh.data.projects) {
      for (const article of project.library) {
        const id = ids.get(article.id);
        if (id && !article.openAlexId) {
          article.openAlexId = id;
          article.updatedAt = now;
          written++;
        }
      }
    }
    if (written === 0) continue;
    fresh.data.lastModified = now;
    const decompose = await buildDecomposeQueries(sql, userId, fresh.data);
    const result = await writeBlob(sql, userId, fresh.data, fresh.snapshot.rev, decompose);
    if (result.ok) {
      console.log(`${userId}: written — ${written} article(s), revision ${fresh.snapshot.rev} → ${result.rev}\n`);
    } else {
      console.log(`${userId}: REFUSED — the account changed during the write (now revision ${result.current.rev}). Nothing was saved; re-run.\n`);
      refused++;
    }
  }

  console.log('── Summary ──');
  console.log(
    `${totals.checked} article(s) checked · ${totals.found} id(s) found · ` +
      `${totals.unresolved.length} unresolved · ${totals.failed} lookup failure(s)`,
  );
  if (totals.unresolved.length) {
    console.log('\nNo confident OpenAlex match (no citation trail):');
    for (const t of totals.unresolved) console.log(`  - ${t}`);
  }
  if (!apply) console.log('\nDry run — nothing written. Re-run with --apply to write.');
  if (refused) process.exitCode = 1;
}

await main();
