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

  const getAllQuestions = useCallback((): FlatQuestion[] => {
    return flattenThemes(data.themes);
  }, [data.themes]);

  const getQuestionById = useCallback(
    (questionId: string): FlatQuestion | undefined => {
      return flattenThemes(data.themes).find((q) => q.id === questionId);
    },
    [data.themes]
  );

  const getThemeById = useCallback(
    (themeId: string): ResearchTheme | undefined => {
      return data.themes.find((t) => t.id === themeId);
    },
    [data.themes]
  );

  const getQuestionData = useCallback(
    (questionId: string): QuestionUserData => {
      return data.questions[questionId] || createDefaultQuestionData();
    },
    [data.questions]
  );

  const isInLibrary = useCallback(
    (doi: string | null, title: string): boolean => {
      return data.library.some(
        (a) => (doi && a.doi === doi) || a.title.toLowerCase() === title.toLowerCase()
      );
    },
    [data.library]
  );

  const getArticle = useCallback(
    (articleId: string): LibraryArticle | undefined => {
      return data.library.find((a) => a.id === articleId);
    },
    [data.library]
  );

  const getArticlesForQuestion = useCallback(
    (questionId: string): LibraryArticle[] => {
      return data.library.filter((a) => a.linkedQuestions.includes(questionId));
    },
    [data.library]
  );

  const statusCounts = useMemo(() => {
    const allQ = flattenThemes(data.themes);
    const counts: Record<QuestionStatus, number> = {
      not_started: 0,
      exploring: 0,
      has_findings: 0,
      concluded: 0,
    };
    for (const q of allQ) {
      const qData = data.questions[q.id];
      const status = qData?.status || 'not_started';
      counts[status]++;
    }
    return counts;
  }, [data]);

  const totalNotes = useMemo(() => {
    return Object.values(data.questions).reduce(
      (sum, q) => sum + q.notes.length,
      0
    );
  }, [data.questions]);

  const value: UserDataContextType = {
    data,
    getAllQuestions,
    getQuestionById,
    getThemeById,
    addTheme: noop,
    updateTheme: noop,
    deleteTheme: noop,
    addQuestion: noop,
    updateQuestion: noop,
    deleteQuestion: noop,
    getQuestionData,
    setStatus: noop,
    toggleStar: noop,
    updateSearchPhrases: noop,
    addNote: noop,
    updateNote: noop,
    deleteNote: noop,
    addSource: noop,
    deleteSource: noop,
    addJournalEntry: noop,
    updateJournalEntry: noop,
    deleteJournalEntry: noop,
    addToLibrary: noop,
    isInLibrary,
    getArticle,
    getArticlesForQuestion,
    updateArticleStatus: noop,
    updateArticleNotes: noop,
    updateAiSummary: noop,
    deleteArticle: noop,
    addExcerpt: noop,
    deleteExcerpt: noop,
    linkQuestion: noop,
    unlinkQuestion: noop,
    statusCounts,
    totalNotes,
    importData: noop,
    syncStatus: 'saved' as SyncStatus,
  };

  return (
    <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
  );
}