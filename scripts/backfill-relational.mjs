#!/usr/bin/env node
// Backfill the JSON-blob `app_data` table into the new relational schema.
//
// Per-user, one row at a time. Builds an idMap so all old nanoid/string IDs
// are remapped to fresh UUIDs and FKs resolve correctly. Idempotent: skips
// users who already have rows in `projects`. Pass --reset to wipe a user's
// relational data first; --dry-run to count without writing.
//
// Usage:
//   node scripts/backfill-relational.mjs [--dry-run] [--reset] [--user=<userId>]

import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Load .env manually (no dotenv dep)
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const [k, ...rest] = line.split('=');
    if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim();
  }
} catch {
  // .env optional if env vars are already set
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const reset = args.has('--reset');
const userFilter = [...args].find((a) => a.startsWith('--user='))?.slice('--user='.length);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const QUESTION_STATUSES = new Set(['not_started', 'exploring', 'has_findings', 'concluded']);
const ARTICLE_STATUSES = new Set(['to-read', 'reading', 'done', 'key-source']);
const EXCERPT_SOURCES = new Set(['manual', 'extension', 'api']);

function newId() {
  return randomUUID();
}

function isoOrNow(v) {
  if (typeof v === 'string' && v) return v;
  return new Date().toISOString();
}

async function resetUser(userId) {
  // Tags and user_settings aren't cascaded by projects; clear them explicitly.
  // article_tags, journal_entry_tags cascade from tags. article_question_links,
  // excerpts, library_articles, journal_entries, themes, questions,
  // question_user_data, research_notes, user_sources cascade from projects.
  await sql`DELETE FROM tags WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_settings WHERE user_id = ${userId}`;
  await sql`DELETE FROM projects WHERE user_id = ${userId}`;
}

async function userIsAlreadyMigrated(userId) {
  const rows = await sql`SELECT 1 FROM projects WHERE user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

async function backfillUser(userId, blob) {
  const idMap = new Map(); // oldId -> newUuid (for projects, themes, questions, articles, journal entries)
  const tagMap = new Map(); // tagName -> tagUuid (per-user tag dedup)

  const stats = {
    projects: 0,
    themes: 0,
    questions: 0,
    questionUserData: 0,
    researchNotes: 0,
    userSources: 0,
    libraryArticles: 0,
    excerpts: 0,
    articleQuestionLinks: 0,
    droppedArticleLinks: 0,
    tags: 0,
    articleTags: 0,
    journalEntries: 0,
    journalEntryTags: 0,
    nulledJournalQuestionRefs: 0,
    nulledJournalThemeRefs: 0,
  };

  const projects = Array.isArray(blob?.projects) ? blob.projects : [];

  // Pass 1: create projects, themes, questions (fills idMap for FK resolution)
  for (let pIdx = 0; pIdx < projects.length; pIdx++) {
    const p = projects[pIdx];
    const projectUuid = newId();
    idMap.set(p.id, projectUuid);
    stats.projects++;

    if (!dryRun) {
      await sql`
        INSERT INTO projects (id, user_id, name, description, icon, color, position, created_at, updated_at)
        VALUES (${projectUuid}, ${userId}, ${p.name ?? 'Untitled'}, ${p.description ?? ''},
                ${p.icon ?? 'brain'}, ${p.color ?? '#7B61FF'}, ${pIdx},
                ${isoOrNow(p.createdAt)}, ${isoOrNow(p.createdAt)})
      `;
    }

    const themes = Array.isArray(p.themes) ? p.themes : [];
    for (let tIdx = 0; tIdx < themes.length; tIdx++) {
      const t = themes[tIdx];
      const themeUuid = newId();
      idMap.set(t.id, themeUuid);
      stats.themes++;

      if (!dryRun) {
        await sql`
          INSERT INTO themes (id, project_id, name, color, icon, description, position)
          VALUES (${themeUuid}, ${projectUuid}, ${t.theme ?? t.name ?? 'Untitled theme'},
                  ${t.color ?? '#7B61FF'}, ${t.icon ?? 'circle'},
                  ${t.description ?? ''}, ${tIdx})
        `;
      }

      const questions = Array.isArray(t.questions) ? t.questions : [];
      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const q = questions[qIdx];
        const questionUuid = newId();
        idMap.set(q.id, questionUuid);
        stats.questions++;

        const seedTags = Array.isArray(q.tags) ? q.tags : [];
        const seedSources = Array.isArray(q.sources) ? q.sources : [];

        if (!dryRun) {
          await sql`
            INSERT INTO questions (id, theme_id, text, why, app_implication, seed_tags, seed_sources, position)
            VALUES (${questionUuid}, ${themeUuid}, ${q.q ?? q.text ?? ''},
                    ${q.why ?? ''}, ${q.appImplication ?? ''},
                    ${JSON.stringify(seedTags)}::jsonb, ${JSON.stringify(seedSources)}::jsonb,
                    ${qIdx})
          `;
        }
      }
    }

    // question_user_data, research_notes, user_sources (FK on questions, mapped above)
    const questionUserDataMap = p.questions && typeof p.questions === 'object' ? p.questions : {};
    for (const [oldQid, ud] of Object.entries(questionUserDataMap)) {
      const newQid = idMap.get(oldQid);
      if (!newQid) continue; // user_data for a deleted question — skip

      const status = QUESTION_STATUSES.has(ud?.status) ? ud.status : 'not_started';
      const starred = !!ud?.starred;
      const searchPhrases = Array.isArray(ud?.searchPhrases) ? ud.searchPhrases : [];

      stats.questionUserData++;
      if (!dryRun) {
        await sql`
          INSERT INTO question_user_data (question_id, status, starred, search_phrases, updated_at)
          VALUES (${newQid}, ${status}, ${starred}, ${JSON.stringify(searchPhrases)}::jsonb, now())
        `;
      }

      const notes = Array.isArray(ud?.notes) ? ud.notes : [];
      for (const n of notes) {
        stats.researchNotes++;
        if (!dryRun) {
          await sql`
            INSERT INTO research_notes (id, question_id, content, created_at, updated_at)
            VALUES (${newId()}, ${newQid}, ${n.content ?? ''},
                    ${isoOrNow(n.createdAt)}, ${isoOrNow(n.updatedAt ?? n.createdAt)})
          `;
        }
      }

      const userSources = Array.isArray(ud?.userSources) ? ud.userSources : [];
      for (const s of userSources) {
        stats.userSources++;
        if (!dryRun) {
          await sql`
            INSERT INTO user_sources (id, question_id, text, doi, url, notes, added_at)
            VALUES (${newId()}, ${newQid}, ${s.text ?? ''},
                    ${s.doi ?? null}, ${s.url ?? null}, ${s.notes ?? ''},
                    ${isoOrNow(s.addedAt)})
          `;
        }
      }
    }

    // library articles (FK on projects)
    const library = Array.isArray(p.library) ? p.library : [];
    for (const a of library) {
      const articleUuid = newId();
      idMap.set(a.id, articleUuid);
      stats.libraryArticles++;

      const status = ARTICLE_STATUSES.has(a.status) ? a.status : 'to-read';
      const authors = Array.isArray(a.authors) ? a.authors : [];

      if (!dryRun) {
        await sql`
          INSERT INTO library_articles (id, project_id, title, authors, year, journal, doi, url,
                                        abstract, notes, status, ai_summary, is_open_access,
                                        unpaywall_url, unpaywall_checked_at, saved_at, updated_at)
          VALUES (${articleUuid}, ${projectUuid}, ${a.title ?? 'Untitled'},
                  ${JSON.stringify(authors)}::jsonb,
                  ${typeof a.year === 'number' ? a.year : null}, ${a.journal ?? null},
                  ${a.doi ?? null}, ${a.url ?? null}, ${a.abstract ?? null},
                  ${a.notes ?? ''}, ${status}, ${a.aiSummary ?? null},
                  ${!!a.isOpenAccess}, ${a.unpaywallUrl ?? null},
                  ${a.unpaywallCheckedAt ?? null},
                  ${isoOrNow(a.savedAt)}, ${isoOrNow(a.updatedAt ?? a.savedAt)})
        `;
      }

      // excerpts
      const excerpts = Array.isArray(a.excerpts) ? a.excerpts : [];
      for (const ex of excerpts) {
        const source = EXCERPT_SOURCES.has(ex.source) ? ex.source : 'manual';
        stats.excerpts++;
        if (!dryRun) {
          await sql`
            INSERT INTO excerpts (id, article_id, quote, comment, source, created_at)
            VALUES (${newId()}, ${articleUuid}, ${ex.quote ?? ''},
                    ${ex.comment ?? ''}, ${source}, ${isoOrNow(ex.createdAt)})
          `;
        }
      }

      // article_question_links
      const linkedQs = Array.isArray(a.linkedQuestions) ? a.linkedQuestions : [];
      for (const oldQid of linkedQs) {
        const newQid = idMap.get(oldQid);
        if (!newQid) {
          stats.droppedArticleLinks++;
          continue;
        }
        stats.articleQuestionLinks++;
        if (!dryRun) {
          await sql`
            INSERT INTO article_question_links (article_id, question_id)
            VALUES (${articleUuid}, ${newQid})
            ON CONFLICT DO NOTHING
          `;
        }
      }

      // article_tags (de-duplicate tag names per user)
      const articleTagNames = Array.isArray(a.tags) ? a.tags : [];
      for (const rawTag of articleTagNames) {
        const tagName = String(rawTag ?? '').trim();
        if (!tagName) continue;
        let tagUuid = tagMap.get(tagName);
        if (!tagUuid) {
          tagUuid = newId();
          tagMap.set(tagName, tagUuid);
          stats.tags++;
          if (!dryRun) {
            await sql`
              INSERT INTO tags (id, user_id, name, color, created_at)
              VALUES (${tagUuid}, ${userId}, ${tagName}, ${null}, now())
              ON CONFLICT (user_id, name) DO NOTHING
            `;
          }
        }
        stats.articleTags++;
        if (!dryRun) {
          await sql`
            INSERT INTO article_tags (article_id, tag_id)
            VALUES (${articleUuid}, ${tagUuid})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    // journal entries (FK on projects; nullable FKs to questions/themes)
    const journal = Array.isArray(p.journal) ? p.journal : [];
    for (const j of journal) {
      const entryUuid = newId();
      idMap.set(j.id, entryUuid);

      let questionFk = null;
      if (j.questionId) {
        questionFk = idMap.get(j.questionId) ?? null;
        if (!questionFk) stats.nulledJournalQuestionRefs++;
      }
      let themeFk = null;
      if (j.themeId) {
        themeFk = idMap.get(j.themeId) ?? null;
        if (!themeFk) stats.nulledJournalThemeRefs++;
      }

      stats.journalEntries++;
      if (!dryRun) {
        await sql`
          INSERT INTO journal_entries (id, project_id, content, question_id, theme_id, created_at, updated_at)
          VALUES (${entryUuid}, ${projectUuid}, ${j.content ?? ''},
                  ${questionFk}, ${themeFk},
                  ${isoOrNow(j.createdAt)}, ${isoOrNow(j.updatedAt ?? j.createdAt)})
        `;
      }

      const journalTagNames = Array.isArray(j.tags) ? j.tags : [];
      for (const rawTag of journalTagNames) {
        const tagName = String(rawTag ?? '').trim();
        if (!tagName) continue;
        let tagUuid = tagMap.get(tagName);
        if (!tagUuid) {
          tagUuid = newId();
          tagMap.set(tagName, tagUuid);
          stats.tags++;
          if (!dryRun) {
            await sql`
              INSERT INTO tags (id, user_id, name, color, created_at)
              VALUES (${tagUuid}, ${userId}, ${tagName}, ${null}, now())
              ON CONFLICT (user_id, name) DO NOTHING
            `;
          }
        }
        stats.journalEntryTags++;
        if (!dryRun) {
          await sql`
            INSERT INTO journal_entry_tags (journal_entry_id, tag_id)
            VALUES (${entryUuid}, ${tagUuid})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }
  }

  // user_settings (one per user)
  const activeProjectFk = blob?.activeProjectId ? idMap.get(blob.activeProjectId) ?? null : null;
  if (!dryRun) {
    await sql`
      INSERT INTO user_settings (user_id, active_project_id, updated_at)
      VALUES (${userId}, ${activeProjectFk}, now())
      ON CONFLICT (user_id) DO UPDATE
      SET active_project_id = EXCLUDED.active_project_id, updated_at = now()
    `;
  }

  return stats;
}

async function main() {
  console.log(
    `Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}${reset ? ' (reset first)' : ''}` +
      `${userFilter ? ` (user filter: ${userFilter})` : ''}`,
  );

  const rows = userFilter
    ? await sql`SELECT user_id, data FROM app_data WHERE user_id = ${userFilter} ORDER BY user_id`
    : await sql`SELECT user_id, data FROM app_data ORDER BY user_id`;

  console.log(`Source rows: ${rows.length}\n`);

  const totals = {};
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { user_id: userId, data } = row;
    process.stdout.write(`User ${userId}: `);

    if (reset && !dryRun) {
      await resetUser(userId);
      process.stdout.write('reset; ');
    }

    if (!reset && (await userIsAlreadyMigrated(userId))) {
      console.log('already migrated, skipping');
      skipped++;
      continue;
    }

    const stats = await backfillUser(userId, data);
    migrated++;
    console.log(
      `projects=${stats.projects} themes=${stats.themes} questions=${stats.questions} ` +
        `qData=${stats.questionUserData} notes=${stats.researchNotes} userSrc=${stats.userSources} ` +
        `articles=${stats.libraryArticles} excerpts=${stats.excerpts} ` +
        `qLinks=${stats.articleQuestionLinks}${stats.droppedArticleLinks ? `(dropped:${stats.droppedArticleLinks})` : ''} ` +
        `tags=${stats.tags} articleTags=${stats.articleTags} ` +
        `journal=${stats.journalEntries}${stats.nulledJournalQuestionRefs ? `(qNull:${stats.nulledJournalQuestionRefs})` : ''}${stats.nulledJournalThemeRefs ? `(tNull:${stats.nulledJournalThemeRefs})` : ''} ` +
        `journalTags=${stats.journalEntryTags}`,
    );

    for (const [k, v] of Object.entries(stats)) totals[k] = (totals[k] ?? 0) + v;
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`);
  console.log('Totals:', totals);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
