import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';

// ── projects ────────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    // Original nanoid from the AppUserData blob — preserved so the recomposed
    // blob round-trips with identical IDs (they live in URLs and cross-refs).
    // Nullable: rows written before Phase 3 have no client_id until re-decomposed.
    clientId: text('client_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_projects_user').on(t.userId),
    uniqueIndex('uniq_projects_user_client').on(t.userId, t.clientId),
  ],
);

// ── themes ──────────────────────────────────────────────────────────────────

export const themes = pgTable(
  'themes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    name: text('name').notNull(),
    color: text('color').notNull(),
    icon: text('icon').notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_themes_project').on(t.projectId),
    uniqueIndex('uniq_themes_project_client').on(t.projectId, t.clientId),
  ],
);

// ── questions ───────────────────────────────────────────────────────────────

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    text: text('text').notNull(),
    why: text('why').notNull().default(''),
    appImplication: text('app_implication').notNull().default(''),
    // jsonb: simple string array of seed-tag labels (not user-curated)
    seedTags: jsonb('seed_tags').$type<string[]>().notNull().default([]),
    // jsonb: array of {text, doi} from seed data; not user-edited
    seedSources: jsonb('seed_sources')
      .$type<{ text: string; doi: string | null }[]>()
      .notNull()
      .default([]),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_questions_theme').on(t.themeId),
    uniqueIndex('uniq_questions_theme_client').on(t.themeId, t.clientId),
  ],
);

// ── question_user_data (1-1 with questions) ─────────────────────────────────

export const questionUserData = pgTable(
  'question_user_data',
  {
    questionId: uuid('question_id')
      .primaryKey()
      .references(() => questions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('not_started'),
    starred: boolean('starred').notNull().default(false),
    // AI-generated, just cached
    searchPhrases: jsonb('search_phrases').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'question_status_values',
      sql`${t.status} IN ('not_started','exploring','has_findings','concluded')`,
    ),
  ],
);

// ── research_notes ──────────────────────────────────────────────────────────

export const researchNotes = pgTable(
  'research_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    content: text('content').notNull(),
    // Index in the blob's notes array — preserves the client's display order
    // (newest-first by insertion, which timestamps alone can't reproduce on ties).
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_research_notes_question').on(t.questionId),
    uniqueIndex('uniq_research_notes_question_client').on(t.questionId, t.clientId),
  ],
);

// ── user_sources (user-added to questions) ──────────────────────────────────

export const userSources = pgTable(
  'user_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    text: text('text').notNull(),
    doi: text('doi'),
    url: text('url'),
    notes: text('notes').notNull().default(''),
    position: integer('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_user_sources_question').on(t.questionId),
    uniqueIndex('uniq_user_sources_question_client').on(t.questionId, t.clientId),
  ],
);

// ── journal_entries ─────────────────────────────────────────────────────────

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    content: text('content').notNull(),
    questionId: uuid('question_id').references(() => questions.id, {
      onDelete: 'set null',
    }),
    themeId: uuid('theme_id').references(() => themes.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_journal_entries_project_created').on(t.projectId, t.createdAt),
    index('idx_journal_entries_question').on(t.questionId),
    uniqueIndex('uniq_journal_entries_project_client').on(t.projectId, t.clientId),
  ],
);

// ── library_articles ────────────────────────────────────────────────────────

export const libraryArticles = pgTable(
  'library_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    title: text('title').notNull(),
    // string[] — display-only, not queried independently
    authors: jsonb('authors').$type<string[]>().notNull().default([]),
    year: integer('year'),
    journal: text('journal'),
    doi: text('doi'),
    url: text('url'),
    abstract: text('abstract'),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('to-read'),
    aiSummary: text('ai_summary'),
    isOpenAccess: boolean('is_open_access').notNull().default(false),
    unpaywallUrl: text('unpaywall_url'),
    unpaywallCheckedAt: timestamp('unpaywall_checked_at', { withTimezone: true }),
    position: integer('position').notNull().default(0),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_library_articles_project_status').on(t.projectId, t.status),
    index('idx_library_articles_doi').on(t.doi),
    uniqueIndex('uniq_library_articles_project_client').on(t.projectId, t.clientId),
    check(
      'article_status_values',
      sql`${t.status} IN ('to-read','reading','done','key-source')`,
    ),
  ],
);

// ── excerpts ────────────────────────────────────────────────────────────────

export const excerpts = pgTable(
  'excerpts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => libraryArticles.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    quote: text('quote').notNull(),
    comment: text('comment').notNull().default(''),
    // 'manual' | 'extension' | 'api'
    source: text('source').notNull().default('manual'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_excerpts_article').on(t.articleId),
    uniqueIndex('uniq_excerpts_article_client').on(t.articleId, t.clientId),
    check('excerpt_source_values', sql`${t.source} IN ('manual','extension','api')`),
  ],
);

// ── article_question_links (M:N) ────────────────────────────────────────────

export const articleQuestionLinks = pgTable(
  'article_question_links',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => libraryArticles.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.questionId] }),
    index('idx_article_question_by_question').on(t.questionId),
  ],
);

// ── tags (per-user namespace) ───────────────────────────────────────────────

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uniq_tags_user_name').on(t.userId, t.name)],
);

// ── article_tags (M:N) ──────────────────────────────────────────────────────

export const articleTags = pgTable(
  'article_tags',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => libraryArticles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.tagId] }),
    index('idx_article_tags_by_tag').on(t.tagId),
  ],
);

// ── journal_entry_tags (M:N) ────────────────────────────────────────────────

export const journalEntryTags = pgTable(
  'journal_entry_tags',
  {
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.journalEntryId, t.tagId] }),
    index('idx_journal_tags_by_tag').on(t.tagId),
  ],
);

// ── user_settings ───────────────────────────────────────────────────────────

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  activeProjectId: uuid('active_project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  // The blob's lastModified, verbatim. Lets the read path detect when the
  // relational copy is stale (e.g., /api/excerpts writes only the blob).
  lastModified: text('last_modified'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
