import type {
  AppUserData,
  Project,
  ResearchTheme,
  QuestionUserData,
  QuestionStatus,
  JournalEntry,
  LibraryArticle,
  Excerpt,
  ArticleStatus,
} from '../src/types/index.js';

// Same rationale as _decomposer.ts: neon's tag-template client doesn't compose
// across module boundaries cleanly; use `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const QUESTION_STATUSES = new Set(['not_started', 'exploring', 'has_findings', 'concluded']);
const ARTICLE_STATUSES = new Set(['to-read', 'reading', 'done', 'key-source']);
const EXCERPT_SOURCES = new Set(['manual', 'extension', 'api']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Neon returns timestamptz as JS Date; normalize everything to the client's ISO format. */
function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toISOString();
  }
  return '';
}

/**
 * The SELECTs that rebuild a user's AppUserData from the relational tables.
 * Run via `sql.transaction([...])` (one HTTP round trip, consistent snapshot)
 * and feed the results to `assembleAppUserData` in the same order.
 *
 * Child rows are ordered by `position` so per-parent array order matches the
 * blob arrays the decomposer was fed.
 */
export function buildRecomposeQueries(sql: SqlClient, userId: string): DeferredQuery[] {
  return [
    sql`SELECT s.last_modified, p.client_id AS active_project_client_id
        FROM user_settings s LEFT JOIN projects p ON s.active_project_id = p.id
        WHERE s.user_id = ${userId}`,
    sql`SELECT id, client_id, name, description, icon, color, created_at
        FROM projects WHERE user_id = ${userId} ORDER BY position`,
    sql`SELECT t.id, t.client_id, t.project_id, t.name, t.color, t.icon, t.description
        FROM themes t JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY t.position`,
    sql`SELECT q.id, q.client_id, q.theme_id, q.text, q.why, q.app_implication, q.seed_tags, q.seed_sources
        FROM questions q
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY q.position`,
    sql`SELECT d.question_id, d.status, d.starred, d.search_phrases
        FROM question_user_data d
        JOIN questions q ON d.question_id = q.id
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ${userId}`,
    sql`SELECT n.client_id, n.question_id, n.content, n.created_at, n.updated_at
        FROM research_notes n
        JOIN questions q ON n.question_id = q.id
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY n.position`,
    sql`SELECT s.client_id, s.question_id, s.text, s.doi, s.url, s.notes, s.added_at
        FROM user_sources s
        JOIN questions q ON s.question_id = q.id
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY s.position`,
    sql`SELECT j.id, j.client_id, j.project_id, j.content, j.created_at, j.updated_at,
               q.client_id AS question_client_id, t.client_id AS theme_client_id
        FROM journal_entries j
        LEFT JOIN questions q ON j.question_id = q.id
        LEFT JOIN themes t ON j.theme_id = t.id
        JOIN projects p ON j.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY j.position`,
    sql`SELECT a.id, a.client_id, a.project_id, a.title, a.authors, a.year, a.journal, a.doi, a.url,
               a.abstract, a.notes, a.status, a.ai_summary, a.is_open_access,
               a.unpaywall_url, a.unpaywall_checked_at, a.saved_at, a.updated_at
        FROM library_articles a JOIN projects p ON a.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY a.position`,
    sql`SELECT e.client_id, e.article_id, e.quote, e.comment, e.source, e.created_at
        FROM excerpts e
        JOIN library_articles a ON e.article_id = a.id
        JOIN projects p ON a.project_id = p.id
        WHERE p.user_id = ${userId} ORDER BY e.position`,
    sql`SELECT l.article_id, q.client_id AS question_client_id
        FROM article_question_links l
        JOIN library_articles a ON l.article_id = a.id
        JOIN projects p ON a.project_id = p.id
        JOIN questions q ON l.question_id = q.id
        WHERE p.user_id = ${userId} ORDER BY l.position`,
    sql`SELECT at.article_id, tg.name
        FROM article_tags at JOIN tags tg ON at.tag_id = tg.id
        WHERE tg.user_id = ${userId} ORDER BY at.position`,
    sql`SELECT jt.journal_entry_id, tg.name
        FROM journal_entry_tags jt JOIN tags tg ON jt.tag_id = tg.id
        WHERE tg.user_id = ${userId} ORDER BY jt.position`,
  ];
}

/**
 * Rebuilds an AppUserData blob from the result sets of `buildRecomposeQueries`.
 *
 * Returns null when the relational copy can't faithfully represent the blob
 * yet — rows written before Phase 3 (no client_id) or no user_settings
 * lastModified. Callers must fall back to the blob in that case.
 */
export function assembleAppUserData(results: Row[][]): AppUserData | null {
  const [
    settingsRows,
    projectRows,
    themeRows,
    questionRows,
    qudRows,
    noteRows,
    sourceRows,
    journalRows,
    articleRows,
    excerptRows,
    linkRows,
    articleTagRows,
    journalTagRows,
  ] = results;

  const settings = settingsRows?.[0];
  if (!settings || typeof settings.last_modified !== 'string' || !settings.last_modified) return null;
  if (!Array.isArray(projectRows) || projectRows.length === 0) return null;

  const projects: Project[] = [];
  const projectsByUuid = new Map<string, Project>();
  for (const r of projectRows) {
    if (!r.client_id) return null;
    const project: Project = {
      id: r.client_id,
      name: r.name,
      description: r.description,
      icon: r.icon,
      color: r.color,
      createdAt: iso(r.created_at),
      themes: [],
      questions: {},
      journal: [],
      library: [],
    };
    projects.push(project);
    projectsByUuid.set(r.id, project);
  }

  const themesByUuid = new Map<string, { theme: ResearchTheme; project: Project }>();
  for (const r of themeRows) {
    if (!r.client_id) return null;
    const project = projectsByUuid.get(r.project_id);
    if (!project) return null;
    const theme: ResearchTheme = {
      id: r.client_id,
      theme: r.name,
      color: r.color,
      icon: r.icon,
      description: r.description,
      questions: [],
    };
    project.themes.push(theme);
    themesByUuid.set(r.id, { theme, project });
  }

  const questionsByUuid = new Map<string, { clientId: string; project: Project }>();
  for (const r of questionRows) {
    if (!r.client_id) return null;
    const owner = themesByUuid.get(r.theme_id);
    if (!owner) return null;
    owner.theme.questions.push({
      id: r.client_id,
      q: r.text,
      why: r.why,
      appImplication: r.app_implication,
      tags: arr<string>(r.seed_tags),
      sources: arr(r.seed_sources),
    });
    questionsByUuid.set(r.id, { clientId: r.client_id, project: owner.project });
  }

  for (const r of qudRows) {
    const q = questionsByUuid.get(r.question_id);
    if (!q) return null;
    q.project.questions[q.clientId] = {
      status: r.status as QuestionStatus,
      starred: !!r.starred,
      notes: [],
      userSources: [],
      searchPhrases: arr<string>(r.search_phrases),
    };
  }

  for (const r of noteRows) {
    if (!r.client_id) return null;
    const q = questionsByUuid.get(r.question_id);
    const ud = q ? q.project.questions[q.clientId] : undefined;
    if (!ud) return null;
    ud.notes.push({
      id: r.client_id,
      content: r.content,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    });
  }

  for (const r of sourceRows) {
    if (!r.client_id) return null;
    const q = questionsByUuid.get(r.question_id);
    const ud = q ? q.project.questions[q.clientId] : undefined;
    if (!ud) return null;
    ud.userSources.push({
      id: r.client_id,
      text: r.text,
      doi: r.doi,
      url: r.url,
      notes: r.notes,
      addedAt: iso(r.added_at),
    });
  }

  const journalByUuid = new Map<string, JournalEntry>();
  for (const r of journalRows) {
    if (!r.client_id) return null;
    const project = projectsByUuid.get(r.project_id);
    if (!project) return null;
    const entry: JournalEntry = {
      id: r.client_id,
      content: r.content,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      questionId: r.question_client_id ?? null,
      themeId: r.theme_client_id ?? null,
      tags: [],
    };
    project.journal.push(entry);
    journalByUuid.set(r.id, entry);
  }

  const articlesByUuid = new Map<string, LibraryArticle>();
  for (const r of articleRows) {
    if (!r.client_id) return null;
    const project = projectsByUuid.get(r.project_id);
    if (!project) return null;
    const article: LibraryArticle = {
      id: r.client_id,
      title: r.title,
      authors: arr<string>(r.authors),
      year: r.year,
      journal: r.journal,
      doi: r.doi,
      url: r.url,
      abstract: r.abstract,
      notes: r.notes,
      excerpts: [],
      linkedQuestions: [],
      status: r.status as ArticleStatus,
      tags: [],
      aiSummary: r.ai_summary,
      isOpenAccess: !!r.is_open_access,
      unpaywallUrl: r.unpaywall_url,
      unpaywallCheckedAt: r.unpaywall_checked_at ? iso(r.unpaywall_checked_at) : null,
      savedAt: iso(r.saved_at),
      updatedAt: iso(r.updated_at),
    };
    project.library.push(article);
    articlesByUuid.set(r.id, article);
  }

  for (const r of excerptRows) {
    if (!r.client_id) return null;
    const article = articlesByUuid.get(r.article_id);
    if (!article) return null;
    article.excerpts.push({
      id: r.client_id,
      quote: r.quote,
      comment: r.comment,
      createdAt: iso(r.created_at),
      source: r.source as Excerpt['source'],
    });
  }

  for (const r of linkRows) {
    const article = articlesByUuid.get(r.article_id);
    if (!article || !r.question_client_id) return null;
    article.linkedQuestions.push(r.question_client_id);
  }

  for (const r of articleTagRows) {
    const article = articlesByUuid.get(r.article_id);
    if (!article) return null;
    article.tags.push(r.name);
  }

  for (const r of journalTagRows) {
    const entry = journalByUuid.get(r.journal_entry_id);
    if (!entry) return null;
    entry.tags.push(r.name);
  }

  return {
    version: 4,
    projects,
    activeProjectId: settings.active_project_client_id ?? '',
    lastModified: settings.last_modified,
  };
}

function normTags(v: unknown): string[] {
  const out: string[] = [];
  for (const raw of arr(v)) {
    const name = String(raw ?? '').trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function dedup(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Applies the decomposer's normalizations to a raw blob so it can be compared
 * field-for-field against `assembleAppUserData` output: defaulted fields filled
 * in, invalid enum values coerced, tags trimmed/deduped, and references to
 * unknown questions/themes dropped — exactly what one decompose → recompose
 * round trip produces. Returns null when the blob isn't v4 (the relational
 * schema only represents v4).
 *
 * Mirrors the decomposer's sequential idMap: a reference is "known" only if
 * its target appears in the same or an earlier project.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canonicalizeBlob(blob: any): AppUserData | null {
  if (!blob || blob.version !== 4 || !Array.isArray(blob.projects)) return null;
  if (typeof blob.lastModified !== 'string' || !blob.lastModified) return null;

  const knownProjects = new Set<string>();
  const knownThemes = new Set<string>();
  const knownQuestions = new Set<string>();
  // questionId -> the project whose themes own it (where recompose attaches user data)
  const questionOwner = new Map<string, Project>();

  const projects: Project[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of blob.projects as any[]) {
    knownProjects.add(p.id);
    const project: Project = {
      id: p.id,
      name: p.name ?? 'Untitled',
      description: p.description ?? '',
      icon: p.icon ?? 'brain',
      color: p.color ?? '#7B61FF',
      createdAt: p.createdAt,
      themes: [],
      questions: {},
      journal: [],
      library: [],
    };
    projects.push(project);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of arr<any>(p.themes)) {
      knownThemes.add(t.id);
      const theme: ResearchTheme = {
        id: t.id,
        theme: t.theme ?? t.name ?? 'Untitled theme',
        color: t.color ?? '#7B61FF',
        icon: t.icon ?? 'circle',
        description: t.description ?? '',
        questions: [],
      };
      project.themes.push(theme);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const q of arr<any>(t.questions)) {
        knownQuestions.add(q.id);
        questionOwner.set(q.id, project);
        theme.questions.push({
          id: q.id,
          q: q.q ?? q.text ?? '',
          why: q.why ?? '',
          appImplication: q.appImplication ?? '',
          tags: arr<string>(q.tags),
          sources: arr(q.sources),
        });
      }
    }

    const questionUserDataObj =
      p.questions && typeof p.questions === 'object' ? p.questions : {};
    for (const [qid, ud] of Object.entries(questionUserDataObj)) {
      const owner = questionOwner.get(qid);
      if (!owner) continue; // user data for a deleted/unknown question — decomposer drops it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u: any = ud;
      const entry: QuestionUserData = {
        status: QUESTION_STATUSES.has(u?.status) ? u.status : 'not_started',
        starred: !!u?.starred,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notes: arr<any>(u?.notes).map((n) => ({
          id: n.id,
          content: n.content ?? '',
          createdAt: n.createdAt,
          updatedAt: n.updatedAt ?? n.createdAt,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userSources: arr<any>(u?.userSources).map((s) => ({
          id: s.id,
          text: s.text ?? '',
          doi: s.doi ?? null,
          url: s.url ?? null,
          notes: s.notes ?? '',
          addedAt: s.addedAt,
        })),
        searchPhrases: arr<string>(u?.searchPhrases),
      };
      owner.questions[qid] = entry;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of arr<any>(p.library)) {
      project.library.push({
        id: a.id,
        title: a.title ?? 'Untitled',
        authors: arr<string>(a.authors),
        year: typeof a.year === 'number' ? a.year : null,
        journal: a.journal ?? null,
        doi: a.doi ?? null,
        url: a.url ?? null,
        abstract: a.abstract ?? null,
        notes: a.notes ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        excerpts: arr<any>(a.excerpts).map((ex) => ({
          id: ex.id,
          quote: ex.quote ?? '',
          comment: ex.comment ?? '',
          createdAt: ex.createdAt,
          source: EXCERPT_SOURCES.has(ex.source) ? ex.source : 'manual',
        })),
        linkedQuestions: dedup(arr<string>(a.linkedQuestions).filter((q) => knownQuestions.has(q))),
        status: ARTICLE_STATUSES.has(a.status) ? a.status : 'to-read',
        tags: normTags(a.tags),
        aiSummary: a.aiSummary ?? null,
        isOpenAccess: !!a.isOpenAccess,
        unpaywallUrl: a.unpaywallUrl ?? null,
        unpaywallCheckedAt: a.unpaywallCheckedAt ?? null,
        savedAt: a.savedAt,
        updatedAt: a.updatedAt ?? a.savedAt,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const j of arr<any>(p.journal)) {
      project.journal.push({
        id: j.id,
        content: j.content ?? '',
        createdAt: j.createdAt,
        updatedAt: j.updatedAt ?? j.createdAt,
        questionId: j.questionId && knownQuestions.has(j.questionId) ? j.questionId : null,
        themeId: j.themeId && knownThemes.has(j.themeId) ? j.themeId : null,
        tags: normTags(j.tags),
      });
    }
  }

  return {
    version: 4,
    projects,
    activeProjectId: knownProjects.has(blob.activeProjectId) ? blob.activeProjectId : '',
    lastModified: blob.lastModified,
  };
}

function show(v: unknown): string {
  const s = JSON.stringify(v) ?? 'undefined';
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function isEmptyish(v: unknown): boolean {
  return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
}

/**
 * Deep-compares the canonicalized blob against the recomposed data and returns
 * the path of the first difference, or null when they match.
 *
 * null, undefined, missing keys, and empty arrays are treated as equivalent —
 * the client reads all of these identically (`??`, optional fields), and the
 * relational round trip can't distinguish them.
 */
export function findFirstDiff(expected: unknown, actual: unknown, path = '$'): string | null {
  if (isEmptyish(expected) && isEmptyish(actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return `${path}.length (${expected.length} vs ${actual.length})`;
    }
    for (let i = 0; i < expected.length; i++) {
      const d = findFirstDiff(expected[i], actual[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (
    expected && actual &&
    typeof expected === 'object' && typeof actual === 'object' &&
    !Array.isArray(expected) && !Array.isArray(actual)
  ) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
      const d = findFirstDiff(
        (expected as Record<string, unknown>)[k],
        (actual as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (d) return d;
    }
    return null;
  }
  return Object.is(expected, actual) ? null : `${path} (${show(expected)} vs ${show(actual)})`;
}
