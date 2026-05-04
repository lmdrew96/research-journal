import { randomUUID } from 'node:crypto';

// neon's `transaction()` has tightly bounded generics that don't compose
// across module boundaries cleanly; use `any` for the tag-template client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;

const QUESTION_STATUSES = new Set(['not_started', 'exploring', 'has_findings', 'concluded']);
const ARTICLE_STATUSES = new Set(['to-read', 'reading', 'done', 'key-source']);
const EXCERPT_SOURCES = new Set(['manual', 'extension', 'api']);

function newId(): string {
  return randomUUID();
}

function isoOrNow(v: unknown): string {
  if (typeof v === 'string' && v) return v;
  return new Date().toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Decomposes an AppUserData blob into the relational tables.
 *
 * Returns an array of deferred neon query objects for `sql.transaction([])`,
 * which executes them as a single HTTP round trip + Postgres transaction.
 *
 * Strategy: DELETE the user's existing relational rows (tags, user_settings,
 * projects — cascade handles everything downstream), then INSERT fresh from
 * the blob. Treats the blob as authoritative on every write. Per-user idMap
 * remaps the blob's nanoid/string IDs to fresh UUIDs.
 *
 * Idempotent and self-contained: relational state after a transaction matches
 * the blob exactly, regardless of prior state.
 */
export function buildDecomposeQueries(
  sql: SqlClient,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blob: any,
): DeferredQuery[] {
  const queries: DeferredQuery[] = [];
  const idMap = new Map<string, string>();
  const tagMap = new Map<string, string>();

  // DELETE existing rows first. Order matters because tags/user_settings
  // aren't cascaded by projects, but projects cascade everything else.
  queries.push(sql`DELETE FROM tags WHERE user_id = ${userId}`);
  queries.push(sql`DELETE FROM user_settings WHERE user_id = ${userId}`);
  queries.push(sql`DELETE FROM projects WHERE user_id = ${userId}`);

  const projects = arr(blob?.projects);

  for (let pIdx = 0; pIdx < projects.length; pIdx++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = projects[pIdx];
    const projectUuid = newId();
    idMap.set(p.id, projectUuid);

    queries.push(sql`
      INSERT INTO projects (id, user_id, name, description, icon, color, position, created_at, updated_at)
      VALUES (${projectUuid}, ${userId}, ${p.name ?? 'Untitled'}, ${p.description ?? ''},
              ${p.icon ?? 'brain'}, ${p.color ?? '#7B61FF'}, ${pIdx},
              ${isoOrNow(p.createdAt)}, ${isoOrNow(p.createdAt)})
    `);

    const themes = arr(p.themes);
    for (let tIdx = 0; tIdx < themes.length; tIdx++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t: any = themes[tIdx];
      const themeUuid = newId();
      idMap.set(t.id, themeUuid);

      queries.push(sql`
        INSERT INTO themes (id, project_id, name, color, icon, description, position)
        VALUES (${themeUuid}, ${projectUuid}, ${t.theme ?? t.name ?? 'Untitled theme'},
                ${t.color ?? '#7B61FF'}, ${t.icon ?? 'circle'},
                ${t.description ?? ''}, ${tIdx})
      `);

      const questions = arr(t.questions);
      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = questions[qIdx];
        const questionUuid = newId();
        idMap.set(q.id, questionUuid);

        queries.push(sql`
          INSERT INTO questions (id, theme_id, text, why, app_implication, seed_tags, seed_sources, position)
          VALUES (${questionUuid}, ${themeUuid}, ${q.q ?? q.text ?? ''},
                  ${q.why ?? ''}, ${q.appImplication ?? ''},
                  ${JSON.stringify(arr(q.tags))}::jsonb,
                  ${JSON.stringify(arr(q.sources))}::jsonb,
                  ${qIdx})
        `);
      }
    }

    // question_user_data + research_notes + user_sources
    const questionUserDataObj =
      p.questions && typeof p.questions === 'object' ? p.questions : {};
    for (const [oldQid, ud] of Object.entries(questionUserDataObj)) {
      const newQid = idMap.get(oldQid);
      if (!newQid) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u: any = ud;

      const status = QUESTION_STATUSES.has(u?.status) ? u.status : 'not_started';
      const starred = !!u?.starred;
      const searchPhrases = arr<string>(u?.searchPhrases);

      queries.push(sql`
        INSERT INTO question_user_data (question_id, status, starred, search_phrases, updated_at)
        VALUES (${newQid}, ${status}, ${starred}, ${JSON.stringify(searchPhrases)}::jsonb, now())
      `);

      for (const n of arr(u?.notes)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const note: any = n;
        queries.push(sql`
          INSERT INTO research_notes (id, question_id, content, created_at, updated_at)
          VALUES (${newId()}, ${newQid}, ${note.content ?? ''},
                  ${isoOrNow(note.createdAt)}, ${isoOrNow(note.updatedAt ?? note.createdAt)})
        `);
      }

      for (const s of arr(u?.userSources)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const src: any = s;
        queries.push(sql`
          INSERT INTO user_sources (id, question_id, text, doi, url, notes, added_at)
          VALUES (${newId()}, ${newQid}, ${src.text ?? ''},
                  ${src.doi ?? null}, ${src.url ?? null}, ${src.notes ?? ''},
                  ${isoOrNow(src.addedAt)})
        `);
      }
    }

    // library_articles + excerpts + article_question_links + article_tags
    for (const a of arr(p.library)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const art: any = a;
      const articleUuid = newId();
      idMap.set(art.id, articleUuid);

      const status = ARTICLE_STATUSES.has(art.status) ? art.status : 'to-read';

      queries.push(sql`
        INSERT INTO library_articles (id, project_id, title, authors, year, journal, doi, url,
                                      abstract, notes, status, ai_summary, is_open_access,
                                      unpaywall_url, unpaywall_checked_at, saved_at, updated_at)
        VALUES (${articleUuid}, ${projectUuid}, ${art.title ?? 'Untitled'},
                ${JSON.stringify(arr<string>(art.authors))}::jsonb,
                ${typeof art.year === 'number' ? art.year : null},
                ${art.journal ?? null}, ${art.doi ?? null}, ${art.url ?? null},
                ${art.abstract ?? null}, ${art.notes ?? ''}, ${status},
                ${art.aiSummary ?? null}, ${!!art.isOpenAccess},
                ${art.unpaywallUrl ?? null}, ${art.unpaywallCheckedAt ?? null},
                ${isoOrNow(art.savedAt)}, ${isoOrNow(art.updatedAt ?? art.savedAt)})
      `);

      for (const ex of arr(art.excerpts)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exc: any = ex;
        const source = EXCERPT_SOURCES.has(exc.source) ? exc.source : 'manual';
        queries.push(sql`
          INSERT INTO excerpts (id, article_id, quote, comment, source, created_at)
          VALUES (${newId()}, ${articleUuid}, ${exc.quote ?? ''},
                  ${exc.comment ?? ''}, ${source}, ${isoOrNow(exc.createdAt)})
        `);
      }

      for (const oldQid of arr<string>(art.linkedQuestions)) {
        const newQid = idMap.get(oldQid);
        if (!newQid) continue;
        queries.push(sql`
          INSERT INTO article_question_links (article_id, question_id)
          VALUES (${articleUuid}, ${newQid})
          ON CONFLICT DO NOTHING
        `);
      }

      for (const rawTag of arr<string>(art.tags)) {
        const tagName = String(rawTag ?? '').trim();
        if (!tagName) continue;
        let tagUuid = tagMap.get(tagName);
        if (!tagUuid) {
          tagUuid = newId();
          tagMap.set(tagName, tagUuid);
          queries.push(sql`
            INSERT INTO tags (id, user_id, name, color, created_at)
            VALUES (${tagUuid}, ${userId}, ${tagName}, ${null}, now())
            ON CONFLICT (user_id, name) DO NOTHING
          `);
        }
        queries.push(sql`
          INSERT INTO article_tags (article_id, tag_id)
          VALUES (${articleUuid}, ${tagUuid})
          ON CONFLICT DO NOTHING
        `);
      }
    }

    // journal_entries + journal_entry_tags
    for (const j of arr(p.journal)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry: any = j;
      const entryUuid = newId();
      idMap.set(entry.id, entryUuid);

      const questionFk = entry.questionId ? idMap.get(entry.questionId) ?? null : null;
      const themeFk = entry.themeId ? idMap.get(entry.themeId) ?? null : null;

      queries.push(sql`
        INSERT INTO journal_entries (id, project_id, content, question_id, theme_id, created_at, updated_at)
        VALUES (${entryUuid}, ${projectUuid}, ${entry.content ?? ''},
                ${questionFk}, ${themeFk},
                ${isoOrNow(entry.createdAt)}, ${isoOrNow(entry.updatedAt ?? entry.createdAt)})
      `);

      for (const rawTag of arr<string>(entry.tags)) {
        const tagName = String(rawTag ?? '').trim();
        if (!tagName) continue;
        let tagUuid = tagMap.get(tagName);
        if (!tagUuid) {
          tagUuid = newId();
          tagMap.set(tagName, tagUuid);
          queries.push(sql`
            INSERT INTO tags (id, user_id, name, color, created_at)
            VALUES (${tagUuid}, ${userId}, ${tagName}, ${null}, now())
            ON CONFLICT (user_id, name) DO NOTHING
          `);
        }
        queries.push(sql`
          INSERT INTO journal_entry_tags (journal_entry_id, tag_id)
          VALUES (${entryUuid}, ${tagUuid})
          ON CONFLICT DO NOTHING
        `);
      }
    }
  }

  // user_settings: active project FK
  const activeProjectFk = blob?.activeProjectId
    ? idMap.get(blob.activeProjectId) ?? null
    : null;
  queries.push(sql`
    INSERT INTO user_settings (user_id, active_project_id, updated_at)
    VALUES (${userId}, ${activeProjectFk}, now())
  `);

  return queries;
}
