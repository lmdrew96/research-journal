// Reconcile existing article metadata against OpenAlex and Crossref.
//
// FILL, NEVER OVERWRITE. Only fields that are empty are touched; notes are
// never touched. Several abstracts are hand-written neutral summaries and
// several notes carry editorial content moved out of abstracts, and a sweep
// that overwrote either would destroy real work.
//
// Per article:
//   - confident match (same rule as journal_add_article — api/_enrich.ts) →
//     fill empty fields; a 'manual' source becomes the provider it came from
//   - no confident match → tag 'unverified-metadata'
//   - 'abstract-missing' articles: the placeholder counts as empty, and the
//     tag comes off once a real abstract is found
//   - a journal field written as a citation ("In R. Day (Ed.), …") is flagged
//     for review by hand, never normalized — it holds information a venue
//     name would lose
//
// Runs as a dry run unless --apply is given. Apply re-reads the account right
// before writing and re-checks that each field is still empty, so the slow
// lookups never sit inside the write's concurrency window. Writes go through
// readBlob/writeBlob like every other writer. Requires migration 0007.
//
//     npx tsx --env-file=.env scripts/backfill-article-metadata.mts            # dry run
//     npx tsx --env-file=.env scripts/backfill-article-metadata.mts --apply    # write
//     --user=<userId>        limit to one account
//     --project=<text>       limit to projects whose name contains <text>

import { neon } from '@neondatabase/serverless';
import { readBlob, writeBlob } from '../api/_blob-store.ts';
import { buildRecomposeQueries, assembleAppUserData } from '../api/_recomposer.ts';
import { buildDecomposeQueries } from '../api/_decomposer.ts';
import {
  findMetadataMatch,
  fillEmptyFields,
  UNVERIFIED_METADATA_TAG,
  type ArticleMetadata,
  type MetadataMatch,
} from '../api/_enrich.ts';
import type { AppUserData, LibraryArticle, ArticleSource } from '../src/types/index.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql: any = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const onlyUser = arg('user');
const onlyProject = arg('project')?.toLowerCase();

const ABSTRACT_MISSING_TAG = 'abstract-missing';
/** "In R. Day (Ed.), Talking to Learn", "…, pp. 125-144" — a citation, not a venue name. */
const CITATION_LIKE_JOURNAL = /^\s*in\s|\(eds?\.\)|\beds?\.\s|\bpp\.\s/i;

interface Proposal {
  articleId: string;
  match: MetadataMatch | null;
  filled: Array<keyof ArticleMetadata>;
  metadata: ArticleMetadata;
  addTags: string[];
  removeTags: string[];
  source: ArticleSource | null;
  reviewJournal: boolean;
  notes: string[];
}

const metadataOf = (a: LibraryArticle): ArticleMetadata => ({
  authors: a.authors,
  year: a.year,
  journal: a.journal,
  doi: a.doi,
  url: a.url,
  // A placeholder left where editorial text was cleared out is not an abstract.
  abstract: a.tags.includes(ABSTRACT_MISSING_TAG) ? null : a.abstract,
  isOpenAccess: a.isOpenAccess,
});

function isEmpty(m: ArticleMetadata, field: keyof ArticleMetadata): boolean {
  const v = m[field];
  if (field === 'authors') return (v as string[]).length === 0;
  if (field === 'isOpenAccess') return v === false;
  return v === null || String(v).trim() === '';
}

async function propose(article: LibraryArticle): Promise<Proposal> {
  const given = metadataOf(article);
  const { match, notes } = await findMetadataMatch({
    title: article.title,
    authors: article.authors,
    doi: article.doi,
  });
  // A stored `false` for open access is the default, not a finding, so the
  // lookup may upgrade it.
  const { metadata, filled } = match
    ? fillEmptyFields(given, match, false)
    : { metadata: given, filled: [] as Array<keyof ArticleMetadata> };

  const addTags: string[] = [];
  const removeTags: string[] = [];
  if (!match && !article.tags.includes(UNVERIFIED_METADATA_TAG)) addTags.push(UNVERIFIED_METADATA_TAG);
  if (match && article.tags.includes(UNVERIFIED_METADATA_TAG)) removeTags.push(UNVERIFIED_METADATA_TAG);
  if (filled.includes('abstract') && article.tags.includes(ABSTRACT_MISSING_TAG)) {
    removeTags.push(ABSTRACT_MISSING_TAG);
  }

  // Metadata now came from a provider. That supersedes 'manual', including a
  // 'manual' the source backfill inferred. A provider label is left alone.
  const source =
    match && filled.length > 0 && (!article.source || article.source === 'manual')
      ? match.provider
      : null;

  return {
    articleId: article.id,
    match,
    filled,
    metadata,
    addTags,
    removeTags,
    source,
    reviewJournal: !!article.journal && CITATION_LIKE_JOURNAL.test(article.journal),
    notes,
  };
}

const hasChanges = (p: Proposal) =>
  p.filled.length > 0 || p.addTags.length > 0 || p.removeTags.length > 0 || p.source !== null;

/** Applies a proposal to a freshly read article; returns the fields actually filled. */
function applyProposal(article: LibraryArticle, p: Proposal, now: string): Array<keyof ArticleMetadata> {
  const fresh = metadataOf(article);
  // Anything filled in by hand since the dry read wins.
  const applied = p.filled.filter((f) => isEmpty(fresh, f));
  for (const f of applied) Object.assign(article, { [f]: p.metadata[f] });

  const tags = article.tags.filter((t) => !p.removeTags.includes(t));
  for (const t of p.addTags) if (!tags.includes(t)) tags.push(t);
  const tagsChanged = tags.length !== article.tags.length || tags.some((t, i) => t !== article.tags[i]);
  article.tags = tags;

  if (p.source) article.source = p.source;
  if (applied.length > 0 || tagsChanged || p.source) article.updatedAt = now;
  return applied;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (v: unknown) =>
  Array.isArray(v) ? clip(v.join('; '), 80) : typeof v === 'string' ? JSON.stringify(clip(v, 80)) : String(v);
const providerName = (p: string) => (p === 'openalex' ? 'OpenAlex' : 'Crossref');

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
  const totals = { articles: 0, matched: 0, withFills: 0, unresolved: [] as string[], review: [] as string[] };
  let refused = 0;

  for (const { user_id: userId } of users) {
    const account = await readAccount(userId);
    if (!account) {
      console.log(`${userId}: no representable data, skipped\n`);
      continue;
    }

    const proposals = new Map<string, Proposal>();
    for (const project of account.data.projects) {
      if (onlyProject && !project.name.toLowerCase().includes(onlyProject)) continue;
      if (project.library.length === 0) continue;
      console.log(`${userId} · ${project.name} — ${project.library.length} article(s)`);

      for (const article of project.library) {
        const p = await propose(article);
        proposals.set(article.id, p);
        totals.articles++;

        const label = p.match
          ? `${providerName(p.match.provider)} · ${p.match.via}`
          : 'no match';
        const complete = p.match && !hasChanges(p) ? ' — already complete' : '';
        console.log(`  [${label}] ${clip(article.title, 90)}${complete}`);
        if (p.match) {
          totals.matched++;
          const found = p.match.paper;
          console.log(
            `      matched: ${clip(found.title, 70)} (${found.authors[0]?.name ?? 'no authors'}, ${found.year ?? 'n.d.'})`,
          );
        } else {
          totals.unresolved.push(`${project.name}: ${article.title}`);
        }
        if (p.filled.length > 0) {
          totals.withFills++;
          for (const f of p.filled) {
            const from = f === 'abstract' && p.match?.abstractFrom ? ` [from ${providerName(p.match.abstractFrom)}]` : '';
            console.log(`      fill ${f}: ${show(p.metadata[f])}${from}`);
          }
        }
        if (p.addTags.length || p.removeTags.length) {
          console.log(`      tags: ${[...p.addTags.map((t) => `+${t}`), ...p.removeTags.map((t) => `-${t}`)].join(' ')}`);
        }
        if (p.source) console.log(`      source: ${article.source ?? '(none)'} → ${p.source}`);
        if (p.reviewJournal) {
          totals.review.push(`${project.name}: ${article.title} — ${article.journal}`);
          console.log(`      REVIEW journal by hand (reads like a citation): ${show(article.journal)}`);
        }
        for (const n of p.notes) console.log(`      note: ${n}`);

        // Both providers ask for polite pacing on unauthenticated use.
        await new Promise((r) => setTimeout(r, 150));
      }
      console.log('');
    }

    const changed = [...proposals.values()].filter(hasChanges);
    if (!apply || changed.length === 0) continue;

    // Apply against a fresh read, so the minutes of lookups above cannot race
    // an edit made in the app meanwhile.
    const fresh = await readAccount(userId);
    if (!fresh) continue;
    const now = new Date().toISOString();
    let fieldsWritten = 0;
    for (const project of fresh.data.projects) {
      for (const article of project.library) {
        const p = proposals.get(article.id);
        if (p && hasChanges(p)) fieldsWritten += applyProposal(article, p, now).length;
      }
    }
    fresh.data.lastModified = now;
    const decompose = await buildDecomposeQueries(sql, userId, fresh.data);
    const result = await writeBlob(sql, userId, fresh.data, fresh.snapshot.rev, decompose);
    if (result.ok) {
      console.log(`${userId}: written — ${changed.length} article(s), ${fieldsWritten} field(s), revision ${fresh.snapshot.rev} → ${result.rev}\n`);
    } else {
      console.log(`${userId}: REFUSED — the account changed during the write (now revision ${result.current.rev}). Nothing was saved; re-run.\n`);
      refused++;
    }
  }

  console.log('── Summary ──');
  console.log(`${totals.articles} article(s) checked · ${totals.matched} matched · ${totals.withFills} with fields to fill · ${totals.unresolved.length} unresolved`);
  if (totals.unresolved.length) {
    console.log(`\nUnresolved (tagged ${UNVERIFIED_METADATA_TAG}):`);
    for (const t of totals.unresolved) console.log(`  - ${t}`);
  }
  if (totals.review.length) {
    console.log('\nJournal fields to review by hand:');
    for (const t of totals.review) console.log(`  - ${t}`);
  }
  if (!apply) console.log('\nDry run — nothing was written. Re-run with --apply to write.');
  if (refused) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
