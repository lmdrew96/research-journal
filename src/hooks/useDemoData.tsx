import { useMemo, useCallback } from 'react';
import type {
  QuestionUserData,
  QuestionStatus,
  FlatQuestion,
  ResearchTheme,
  LibraryArticle,
} from '../types';
import { DEMO_DATA } from '../data/demo-data';
import { UserDataContext } from './useUserData';
import type { UserDataContextType, SyncStatus } from './useUserData';

function createDefaultQuestionData(): QuestionUserData {
  return {
    status: 'not_started',
    starred: false,
    notes: [],
    userSources: [],
  };
}

function flattenThemes(themes: ResearchTheme[]): FlatQuestion[] {
  return themes.flatMap((theme) =>
    theme.questions.map((q, i) => ({
      ...q,
      themeId: theme.id,
      themeLabel: theme.theme,
      themeColor: theme.color,
      questionIndex: i,
    }))
  );
}

const noop = () => {};

export function DemoDataProvider({ children }: { children: React.ReactNode }) {
  const data = DEMO_DATA;
  const activeProject = data.projects[0];

  const { themes, questions, journal, library } = activeProject;

  const getAllQuestions = useCallback((): FlatQuestion[] => {
    return flattenThemes(themes);
  }, [themes]);

  const getQuestionById = useCallback(
    (questionId: string): FlatQuestion | undefined => {
      return flattenThemes(themes).find((q) => q.id === questionId);
    },
    [themes]
  );

  const getThemeById = useCallback(
    (themeId: string): ResearchTheme | undefined => {
      return themes.find((t) => t.id === themeId);
    },
    [themes]
  );

  const getQuestionData = useCallback(
    (questionId: string): QuestionUserData => {
      return questions[questionId] || createDefaultQuestionData();
    },
    [questions]
  );

  const isInLibrary = useCallback(
    (doi: string | null, title: string): boolean => {
      return library.some(
        (a) => (doi && a.doi === doi) || a.title.toLowerCase() === title.toLowerCase()
      );
    },
    [library]
  );

  const getArticle = useCallback(
    (articleId: string): LibraryArticle | undefined => {
      return library.find((a) => a.id === articleId);
    },
    [library]
  );

  const getArticlesForQuestion = useCallback(
    (questionId: string): LibraryArticle[] => {
      return library.filter((a) => a.linkedQuestions.includes(questionId));
    },
    [library]
  );

  const statusCounts = useMemo(() => {
    const allQ = flattenThemes(themes);
    const counts: Record<QuestionStatus, number> = {
      not_started: 0,
      exploring: 0,
      has_findings: 0,
      concluded: 0,
    };
    for (const q of allQ) {
      const status = questions[q.id]?.status || 'not_started';
      counts[status]++;
    }
    return counts;
  }, [themes, questions]);

  const totalNotes = useMemo(() => {
    return Object.values(questions).reduce((sum, q) => sum + q.notes.length, 0);
  }, [questions]);

  const value: UserDataContextType = {
    data,
    activeProject,
    themes,
    questions,
    journal,
    library,
    // Project management (no-ops in demo)
    switchProject: noop,
    addProject: noop as UserDataContextType['addProject'],
    updateProject: noop,
    deleteProject: noop,
    // Theme/question helpers
    getAllQuestions,
    getQuestionById,
    getThemeById,
    // Theme CRUD (no-ops)
    addTheme: noop,
    updateTheme: noop,
    deleteTheme: noop,
    // Question CRUD (no-ops)
    addQuestion: noop,
    updateQuestion: noop,
    deleteQuestion: noop,
    // Question user data (no-ops)
    getQuestionData,
    setStatus: noop,
    toggleStar: noop,
    updateSearchPhrases: noop,
    addNote: noop,
    updateNote: noop,
    deleteNote: noop,
    addSource: noop,
    deleteSource: noop,
    // Journal (no-ops)
    addJournalEntry: noop,
    updateJournalEntry: noop,
    deleteJournalEntry: noop,
    // Library (no-ops)
    addToLibrary: noop,
    isInLibrary,
    getArticle,
    getArticlesForQuestion,
    updateArticleStatus: noop,
    updateArticleNotes: noop,
    updateArticleTags: noop,
    updateAiSummary: noop,
    deleteArticle: noop,
    addExcerpt: noop,
    deleteExcerpt: noop,
    linkQuestion: noop,
    unlinkQuestion: noop,
    // Stats
    statusCounts,
    totalNotes,
    // Import (no-op)
    importData: noop,
    syncStatus: 'saved' as SyncStatus,
  };

  return (
    <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
  );
}
