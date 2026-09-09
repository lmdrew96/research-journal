// neon's transaction() has tightly bounded generics that don't compose across
// module boundaries; use `any` for the tag-template client, as _decomposer and
// _recomposer already do.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeferredQuery = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/**
 * client_id -> row uuid, per table, for one user.
 *
 * The blob addresses everything by the client-side id it generated; Postgres
 * addresses rows by uuid. Every entity table carries a `client_id` column and a
 * unique index on (parent, client_id) — that pairing exists precisely so an
 * incoming blob row can be matched to the row already stored, which is what
 * lets the decomposer update in place instead of dropping and rebuilding the
 * user's whole tree.
 *
 * `tags` is the one exception: it has no client_id and is keyed on (user_id,
 * name), so its map is name -> uuid.
 */
export interface IdMaps {
  projects: Map<string, string>;
  themes: Map<string, string>;
  questions: Map<string, string>;
  notes: Map<string, string>;
  sources: Map<string, string>;
  journal: Map<string, string>;
  articles: Map<string, string>;
  excerpts: Map<string, string>;
  studies: Map<string, string>;
  hypotheses: Map<string, string>;
  decisions: Map<string, string>;
  /** tag name -> uuid */
  tags: Map<string, string>;
}

/**
 * SELECTs that resolve every stored row's client_id to its uuid.
 *
 * Deliberately narrow — two columns per table, no content — so this stays cheap
 * enough to run before every write. Feed the results to `assembleIdMaps` in the
 * same order.
 */
export function buildIdMapQueries(sql: SqlClient, userId: string): DeferredQuery[] {
  return [
    sql`SELECT id, client_id FROM projects WHERE user_id = ${userId}`,
    sql`SELECT t.id, t.client_id FROM themes t
        JOIN projects p ON t.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT q.id, q.client_id FROM questions q
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT n.id, n.client_id FROM research_notes n
        JOIN questions q ON n.question_id = q.id
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT s.id, s.client_id FROM user_sources s
        JOIN questions q ON s.question_id = q.id
        JOIN themes t ON q.theme_id = t.id
        JOIN projects p ON t.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT j.id, j.client_id FROM journal_entries j
        JOIN projects p ON j.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT a.id, a.client_id FROM library_articles a
        JOIN projects p ON a.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT e.id, e.client_id FROM excerpts e
        JOIN library_articles a ON e.article_id = a.id
        JOIN projects p ON a.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT s.id, s.client_id FROM studies s
        JOIN projects p ON s.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT h.id, h.client_id FROM hypotheses h
        JOIN studies s ON h.study_id = s.id
        JOIN projects p ON s.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT d.id, d.client_id FROM decisions d
        JOIN studies s ON d.study_id = s.id
        JOIN projects p ON s.project_id = p.id WHERE p.user_id = ${userId}`,
    sql`SELECT id, name FROM tags WHERE user_id = ${userId}`,
  ];
}

function toMap(rows: Row[], key: 'client_id' | 'name'): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows ?? []) {
    const k = r[key];
    // Rows written before client_id existed can't be addressed by the blob.
    // Leaving them unmapped makes them look new, which is correct: the caller
    // falls back to a full rebuild when the relational copy isn't usable.
    if (typeof k === 'string' && k) m.set(k, r.id as string);
  }
  return m;
}

export function assembleIdMaps(results: Row[][]): IdMaps {
  const [
    projects, themes, questions, notes, sources, journal,
    articles, excerpts, studies, hypotheses, decisions, tags,
  ] = results;
  return {
    projects: toMap(projects, 'client_id'),
    themes: toMap(themes, 'client_id'),
    questions: toMap(questions, 'client_id'),
    notes: toMap(notes, 'client_id'),
    sources: toMap(sources, 'client_id'),
    journal: toMap(journal, 'client_id'),
    articles: toMap(articles, 'client_id'),
    excerpts: toMap(excerpts, 'client_id'),
    studies: toMap(studies, 'client_id'),
    hypotheses: toMap(hypotheses, 'client_id'),
    decisions: toMap(decisions, 'client_id'),
    tags: toMap(tags, 'name'),
  };
}
