// Static data types

export interface Source {
  text: string;
  doi: string | null;
}

export interface ResearchQuestion {
  id: string;
  q: string;
  why: string;
  appImplication: string;
  tags: string[];
  sources: Source[];
  /**
   * Other questions in the same project this one is related to.
   *
   * Untyped and symmetric: both questions carry each other's id, and the link
   * says only "see also", not why. Tags express loose grouping; this expresses
   * that two questions are one idea at different grain sizes, or two arrows of
   * one program — including across themes, which tags handle worst.
   *
   * Optional so data written before the field existed loads unchanged, and
   * omitted rather than stored as [] when empty so the relational round-trip
   * stays byte-comparable.
   */
  relatedQuestions?: string[];
}

export interface ResearchTheme {
  id: string;
  theme: string;
  color: string;
  icon: string;
  description: string;
  questions: ResearchQuestion[];
  /**
   * Soft delete. ISO timestamp when this theme was deleted, absent otherwise.
   *
   * The theme keeps its whole subtree while deleted — its questions stay in
   * `Project.questions` and article `linkedQuestions` are left alone — and the
   * theme's own flag is what hides them. That makes restore a matter of
   * clearing this field, and means the cascade cannot be half-restored.
   * Purged after PURGE_WINDOW_DAYS (see lib/storage.ts).
   */
  deletedAt?: string | null;
}

// Flattened question with theme context (for lists and search)
export interface FlatQuestion extends ResearchQuestion {
  themeId: string;
  themeLabel: string;
  themeColor: string;
  questionIndex: number;
}

// User-generated data types

export type QuestionStatus = 'not_started' | 'exploring' | 'has_findings' | 'concluded';

export interface ResearchNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSource {
  id: string;
  text: string;
  doi: string | null;
  url: string | null;
  notes: string;
  addedAt: string;
}

export interface QuestionUserData {
  status: QuestionStatus;
  starred: boolean;
  notes: ResearchNote[];
  userSources: UserSource[];
  searchPhrases?: string[];
}

export interface JournalEntry {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  questionId: string | null;
  themeId: string | null;
  tags: string[];
}

// Studies — original research Nae is designing herself
//
// Top-level within a project, siblings of articles rather than children of
// questions. An article is what someone else did about a question; a study is
// what you are doing about it — same relation to the question, opposite
// authorship, so studies mirror `LibraryArticle.linkedQuestions` exactly.
//
// Nesting under a question would not work: one study answers hypotheses filed
// under several different themes, and a parent-child edge forces picking one
// and lying about the rest.

export type StudyStatus =
  | 'planned'
  | 'in_progress'
  | 'collecting'
  | 'analyzing'
  | 'complete'
  | 'abandoned';

export type HypothesisStatus = 'active' | 'superseded' | 'retired';

export type DecisionStatus = 'open' | 'settled' | 'superseded';

export interface Hypothesis {
  id: string;
  /** 'H1', 'H2' — display label, not an identifier. */
  label: string | null;
  statement: string;
  status: HypothesisStatus;
  /**
   * The hypothesis that replaced this one. The reversal chain is the whole
   * point of the field: a note can hold a decision, only a pointer can hold a
   * revision history, so the current hypothesis is the active row and its
   * past is the chain hanging off it.
   */
  supersededBy: string | null;
  /** Which research question this hypothesis operationalizes. */
  questionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  /** What was chosen. */
  decision: string;
  /** What was not chosen. */
  alternativesRejected: string | null;
  /** WHY. This is the field that carries the value. */
  rationale: string | null;
  status: DecisionStatus;
  /** See Hypothesis.supersededBy — same chain, same reason. */
  supersededBy: string | null;
  /** Set when the decision changed one hypothesis rather than the study at large. */
  hypothesisId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Study {
  id: string;
  title: string;
  status: StudyStatus;
  /** Short framing. */
  description: string;
  /**
   * Variables, instruments and the analysis plan, as markdown prose.
   *
   * Deliberately unstructured for now. The graduation test for field → object
   * is "needs querying across studies, or needs its own history"; hypotheses
   * and decisions hit both and got tables, nothing in here has yet.
   */
  design: string;
  /** Mirrors LibraryArticle.linkedQuestions — many-to-many with questions. */
  linkedQuestions: string[];
  hypotheses: Hypothesis[];
  decisions: Decision[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  createdAt: string;
  themes: ResearchTheme[];
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];
  /**
   * Original research designed in this project.
   *
   * Optional so data written before studies existed loads unchanged, and
   * omitted rather than stored as [] when empty so the relational round-trip
   * stays byte-comparable. Read it as `project.studies ?? []`.
   */
  studies?: Study[];
  /** Soft delete — see ResearchTheme.deletedAt. Hides the entire project. */
  deletedAt?: string | null;
}

export interface AppUserData {
  version: 1 | 2 | 3 | 4;
  // v4+
  projects: Project[];
  activeProjectId: string;
  lastModified: string;
  /**
   * Display preferences. Optional so existing data loads unchanged — absent
   * means "the defaults", which reproduce the app's behaviour before these
   * controls existed.
   */
  preferences?: UserPreferences;
  /** Remembered view state, keyed by project id. */
  viewState?: Record<string, ProjectViewState>;
}

// ── Display preferences and remembered view state ───────────────────────────

export type DensityPreference = 'compact' | 'comfortable' | 'spacious';

/** 'auto' defers to the OS prefers-reduced-motion setting. */
export type MotionPreference = 'auto' | 'full' | 'reduced';

export interface UserPreferences {
  density: DensityPreference;
  motion: MotionPreference;
}

export interface LibraryViewState {
  status: string;
  question: string;
  tag: string;
  oaOnly: boolean;
  sort: string;
  search: string;
}

/** Per-project UI state the app restores rather than making the user rebuild. */
export interface ProjectViewState {
  library?: LibraryViewState;
  /** Which theme is open in Manage Themes. */
  expandedTheme?: string | null;
  /** Which question card is open in the Questions view. */
  expandedQuestion?: string | null;
}

// Library types

export interface LibraryArticle {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  notes: string;
  excerpts: Excerpt[];
  linkedQuestions: string[];
  status: ArticleStatus;
  tags: string[];
  aiSummary: string | null;
  isOpenAccess: boolean;
  unpaywallUrl?: string | null;
  unpaywallCheckedAt?: string | null;
  savedAt: string;
  updatedAt: string;
}

export interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
  source?: 'api' | 'extension' | 'manual';
}

export type ArticleStatus = 'to-read' | 'reading' | 'done' | 'key-source';

// View routing
export type View =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'questions'; themeId?: string }
  | { name: 'question-detail'; questionId: string }
  | { name: 'journal' }
  | { name: 'search'; initialQuery?: string }
  | { name: 'library' }
  | { name: 'article-detail'; articleId: string }
  | { name: 'studies' }
  | { name: 'study-detail'; studyId: string }
  | { name: 'export' }
  | { name: 'manage-themes' }
  | { name: 'manage-projects' }
  | { name: 'settings' }
  | { name: 'accounts' };
