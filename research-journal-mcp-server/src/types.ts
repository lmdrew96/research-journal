// Mirrors the Research Journal app's data model (src/types/index.ts)

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

export interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
}

export type ArticleStatus = 'to-read' | 'reading' | 'done' | 'key-source';

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

export interface AppUserData {
  version: number;
  themes: ResearchTheme[];
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];
  lastModified: string;
}
