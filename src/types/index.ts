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
  /** Who the question originated with. See Provenance. */
  provenance?: Provenance;
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

/**
 * Who an idea originated with — not who wrote it down.
 *
 * `convergent` means both arrived at it independently; `external` covers a
 * paper, a professor, a conversation elsewhere. Unset means "not recorded",
 * which is honest: there is deliberately no default, because defaulting to
 * `nae` would silently attribute Coru's contributions to her. Nuance beyond
 * four values goes in a note.
 *
 * Optional and omitted rather than stored as null when unset, so data written
 * before the field existed stays byte-comparable through the relational
 * round trip.
 */
export type Provenance = 'nae' | 'coru' | 'convergent' | 'external';

export interface Hypothesis {
  id: string;
  /** 'H1', 'H2' — display label, not an identifier. */
  label: string | null;
  statement: string;
  status: HypothesisStatus;
  /** See Provenance. Carried forward by a revision — revising doesn't change who had the idea. */
  provenance?: Provenance;
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
  /**
   * Set when the decision is about one design item — the cue count on the cue
   * list. Optional and omitted when unset, so decisions written before design
   * items existed stay byte-comparable through the relational round trip.
   */
  designItemId?: string;
  /** See Provenance. */
  provenance?: Provenance;
  createdAt: string;
  updatedAt: string;
}

/**
 * One piece of a study's design. Each kind is one section of the Design area;
 * the singletons (framework, participants, cleaning, analysis) hold at most one
 * live item, the lists (material, measure, step, variable) any number, in
 * array order.
 */
export type DesignItemKind =
  | 'framework'
  | 'participants'
  | 'material'
  | 'measure'
  | 'step'
  | 'variable'
  | 'cleaning'
  | 'analysis';

/** `superseded` marks a row a revision replaced — see Hypothesis.supersededBy. */
export type DesignItemStatus = 'open' | 'settled' | 'superseded';

export type VariableRole = 'predictor' | 'outcome' | 'moderator' | 'covariate';

/**
 * The fields a design item carries, by kind (DESIGN_FIELDS_BY_KIND in
 * api/_design-items.ts says which are valid for which). Every one is optional
 * and omitted when empty, never stored as '' or null, so the stored JSON and
 * the recomposed one are byte-comparable.
 */
export interface DesignItemFields {
  /** Free text: framework, response cleaning and analysis; notes on the others. */
  text?: string;
  /** Material, measure, step and variable. */
  name?: string;
  // Participants
  population?: string;
  proficiency?: string;
  languages?: string;
  inclusion?: string;
  exclusion?: string;
  targetN?: number;
  // Measure
  measures?: string;
  scoring?: string;
  // Procedure step
  minutes?: number;
  // Variable
  role?: VariableRole;
}

/**
 * Links (Variable → Measure, Measure → article, Analysis → hypothesis…) are not
 * fields here. They are Connections from the item, so they get the same delete
 * cascade every other edge has (api/_connections.ts).
 */
export interface DesignItem {
  id: string;
  kind: DesignItemKind;
  fields: DesignItemFields;
  status: DesignItemStatus;
  /** See Hypothesis.supersededBy — same chain, same reason. */
  supersededBy: string | null;
  /** See Provenance. Carried forward by a revision. */
  provenance?: Provenance;
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
   * The design as markdown prose — from before it was split into sections.
   *
   * Kept as the archived snapshot of the original text; the structured design
   * lives in `designItems`. The app shows it read-only.
   */
  design: string;
  /** Target length of one session, in minutes — what the Procedure total is held against. */
  targetSessionMinutes?: number;
  /** See Provenance. */
  provenance?: Provenance;
  /** Mirrors LibraryArticle.linkedQuestions — many-to-many with questions. */
  linkedQuestions: string[];
  hypotheses: Hypothesis[];
  decisions: Decision[];
  /**
   * The design, one item per piece. Optional and omitted when empty so studies
   * written before design items existed round-trip unchanged. Read it as
   * `study.designItems ?? []`.
   */
  designItems?: DesignItem[];
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
  /**
   * Typed "because" edges between things this project already holds. Optional
   * and omitted when empty, for the same byte-comparability reason as studies.
   * Read it as `project.connections ?? []`.
   */
  connections?: Connection[];
  /**
   * What Nae thinks — mostly harvested from chats with Coru, each labeled with
   * who it came from. Optional and omitted when empty, like studies.
   * Read it as `project.thoughts ?? []`.
   */
  thoughts?: Thought[];
  /** Soft delete — see ResearchTheme.deletedAt. Hides the entire project. */
  deletedAt?: string | null;
}

/**
 * One saved thought — the unit ThreadNotes now collects (the Reframe:
 * "where research chats land"). Mostly harvested at the end of a chat with
 * Coru, keeping only what Nae chose to keep.
 *
 * `provenance` is the point: it keeps Nae's thesis thinking distinguishable
 * from Coru's suggestions. Links are optional and many-to-many — a thought can
 * be about two papers and one thread at once.
 */
export interface Thought {
  id: string;
  /** Markdown. */
  text: string;
  /** Who it came from. See Provenance. */
  provenance?: Provenance;
  /** Library articles (Sources) it is about. */
  articleIds: string[];
  /** Questions (Threads in the app) it belongs to. */
  questionIds: string[];
  /** The study it bears on, if any. */
  studyId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Connections — Vertex's idea, folded in: Nae adds only the edges.

export type ConnectionNodeType =
  | 'article'
  | 'excerpt'
  | 'question'
  | 'hypothesis'
  | 'theme'
  | 'study'
  | 'design_item';

export type ConnectionRelation =
  | 'connects_to'
  | 'tension_with'
  | 'instance_of'
  | 'contradicts'
  | 'evidenced_by';

/**
 * One directed edge: `from` <relation> `to`, because <because>.
 *
 * Endpoints are client ids, the same ids the rest of the blob uses. They are
 * not foreign keys — an endpoint can be any of seven types — so deleting an item
 * removes its connections in the same write (see api/_connections.ts).
 */
export interface Connection {
  id: string;
  fromType: ConnectionNodeType;
  fromId: string;
  toType: ConnectionNodeType;
  toId: string;
  relation: ConnectionRelation;
  because: string;
  createdAt: string;
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
  /** ArticleSource or 'all'. Optional so view state saved before it existed restores. */
  source?: string;
  /** Show only key sources. Optional for the same reason. */
  keySourceOnly?: boolean;
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

/**
 * Where an article's metadata came from: a search provider, or typed in.
 *
 * The point is ground truth. Before this, telling a search-added article from a
 * hand-added one meant reading artifacts — a DOI, a stray JATS "Abstract "
 * prefix, empty tags. Rows saved before the field existed were stamped by
 * scripts/backfill-article-source.mts, so for those the value is inferred.
 */
export type ArticleSource = 'crossref' | 'openalex' | 'manual';

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
  /**
   * What the AI summary was generated from. Absent on summaries written before
   * v0.48.4, which may have come from the title alone — the UI flags those.
   */
  aiSummarySource?: SummarySource;
  isOpenAccess: boolean;
  /**
   * R2 object key of an uploaded PDF (`{userId}/{uuid}.pdf`) — a key, not a
   * URL, because signed URLs expire. Present only when a PDF is attached.
   */
  pdfKey?: string;
  /**
   * OpenAlex work id (`W…`), the handle for walking its citation trail. Set when
   * the metadata came from OpenAlex or by scripts/backfill-openalex-id.mts;
   * absent when unknown, so older data stays byte-comparable.
   */
  openAlexId?: string;
  unpaywallUrl?: string | null;
  unpaywallCheckedAt?: string | null;
  /**
   * See ArticleSource. Optional and omitted when unknown, so a blob written
   * before the field existed stays byte-comparable with the relational copy.
   */
  source?: ArticleSource;
  /**
   * A key source for the research, independent of reading status — so an
   * article can be Reading and a key source at once. Present only when true;
   * absent means not a key source, which keeps older data byte-comparable.
   */
  keySource?: true;
  savedAt: string;
  updatedAt: string;
}

export type SummarySource = 'abstract' | 'full-text';

/**
 * Who wrote an excerpt. 'api' is the legacy value from before external writers
 * named themselves; it now means only "came in through the API, unknown who".
 */
export type ExcerptSource = 'manual' | 'extension' | 'api' | 'marginalia' | 'mcp' | 'threadbrain';

export interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
  source?: ExcerptSource;
  /**
   * Page in the source document, set by readers that know it (Marginalia).
   * Present only when known, so older data stays byte-comparable.
   */
  page?: number;
}

/**
 * Reading progress only. 'key-source' used to be a fourth value, which made
 * "key source" and "still reading" mutually exclusive; it is now the separate
 * LibraryArticle.keySource flag. Stored data can still carry the legacy value —
 * the decomposer and recomposer read it as status 'to-read' plus the flag.
 */
export type ArticleStatus = 'to-read' | 'reading' | 'done';

// View routing
export type View =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'questions'; themeId?: string }
  | { name: 'question-detail'; questionId: string }
  | { name: 'journal' }
  | { name: 'search'; initialQuery?: string }
  | { name: 'library' }
  | { name: 'article-detail'; articleId: string; excerptId?: string }
  | { name: 'studies' }
  | { name: 'study-detail'; studyId: string }
  | { name: 'export' }
  | { name: 'changelog' }
  | { name: 'manage-themes' }
  | { name: 'manage-projects' }
  | { name: 'settings' }
  | { name: 'accounts' };
