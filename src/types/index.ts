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
  | { name: 'export' }
  | { name: 'manage-themes' }
  | { name: 'manage-projects' }
  | { name: 'settings' }
  | { name: 'accounts' };
