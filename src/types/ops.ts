import type { AppUserData, Project, ResearchTheme, ResearchQuestion, QuestionUserData, LibraryArticle, Study, JournalEntry } from './index.js';

/**
 * The delta vocabulary shared by the app and the serverless API.
 *
 * The app used to PUT the whole AppUserData document on every mutation, so the
 * payload scaled with total data rather than edit size — about 1KB per article,
 * uploaded in full every 500ms debounce. These ops describe what changed
 * instead.
 *
 * Granularity is deliberately the same one the decomposer already diffs at:
 * projects, themes, questions, per-question user data, articles, studies and
 * journal entries. Everything below that (excerpts, notes, sources, hypotheses,
 * decisions, tags, links) rides inside its parent's body, because the server
 * rebuilds a changed parent's children wholesale anyway. Adding finer ops would
 * buy nothing and double the vocabulary.
 *
 * Ops are DERIVED from a persist updater's (prev, next) pair, never written by
 * hand — see `diffToOps`. That is what keeps 50 call sites unchanged.
 */

export type EntityType =
  | 'project'
  | 'theme'
  | 'question'
  | 'questionUserData'
  | 'article'
  | 'study'
  | 'journalEntry';

/** The body carried by an upsert, by entity type. */
export interface EntityBodies {
  project: Omit<Project, 'themes' | 'questions' | 'journal' | 'library' | 'studies'>;
  theme: Omit<ResearchTheme, 'questions'>;
  question: ResearchQuestion;
  questionUserData: QuestionUserData;
  article: LibraryArticle;
  study: Study;
  journalEntry: JournalEntry;
}

export interface UpsertOp<T extends EntityType = EntityType> {
  op: 'upsert';
  type: T;
  /** Client id of the entity. For questionUserData this is the question's id. */
  id: string;
  /**
   * Client id of the owning project. Absent only for `project` itself.
   * Everything is scoped to a project, so the server never has to search.
   */
  projectId?: string;
  /** Client id of the immediate parent — a theme for a question, a study for its rows. */
  parentId?: string;
  /** Ordinal within its parent's array. The server writes it to `position`. */
  position: number;
  entity: EntityBodies[T];
}

/**
 * An entity whose content is unchanged but whose ordinal moved.
 *
 * Worth its own op because inserting at the head of a list shifts every
 * sibling: without this, adding one article re-sent all 50 (37KB). A move
 * carries about 60 bytes.
 */
export interface MoveOp {
  op: 'move';
  type: EntityType;
  id: string;
  projectId?: string;
  position: number;
}

export interface DeleteOp {
  op: 'delete';
  type: EntityType;
  id: string;
  projectId?: string;
}

/**
 * Top-level fields that live on `user_settings` rather than on any entity.
 * Always sent, because `lastModified` moves on every write.
 */
export interface SettingsOp {
  op: 'settings';
  activeProjectId: string;
  lastModified: string;
  preferences?: AppUserData['preferences'];
  viewState?: AppUserData['viewState'];
}

export type Op = UpsertOp | MoveOp | DeleteOp | SettingsOp;

/** What the client PATCHes to /api/data. */
export interface OpsPayload {
  /** The revision the ops were computed against. */
  baseRev: number;
  ops: Op[];
}

export type OpsResult =
  | { status: 'ok'; rev: number }
  /**
   * An op referenced something that no longer exists — the only way per-entity
   * writes can genuinely conflict. The client refetches and rebuilds.
   */
  | { status: 'stale'; rev: number; reason: string };

/** Rough byte cost of a payload, for logging and for the size assertions. */
export function opsSize(ops: Op[]): number {
  return JSON.stringify(ops).length;
}
