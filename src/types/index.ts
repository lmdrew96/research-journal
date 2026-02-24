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

export interface AppUserData {
  version: 1 | 2 | 3;
  themes: ResearchTheme[];
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];
  lastModified: string;
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
  savedAt: string;
  updatedAt: string;
}

export interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
}

export type ArticleStatus = 'to-read' | 'reading' | 'done' | 'key-source';

// View routing
export type View =
  | { name: 'dashboard' }
  | { name: 'questions' }
  | { name: 'question-detail'; questionId: string }
  | { name: 'journal' }
  | { name: 'search'; initialQuery?: string }
  | { name: 'library' }
  | { name: 'article-detail'; articleId: string }
  | { name: 'export' }
  | { name: 'manage-themes' };
