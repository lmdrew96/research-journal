import { useState, useCallback, useEffect, useMemo, createContext, useContext } from 'react';
import type {
  AppUserData,
  QuestionUserData,
  QuestionStatus,
  ResearchNote,
  UserSource,
  JournalEntry,
  LibraryArticle,
  ArticleStatus,
} from '../types';
import { loadUserData, saveUserData, STORAGE_KEY } from '../lib/storage';
import { createId } from '../lib/ids';
import { getAllQuestions, getQuestionId } from '../data/research-themes';

function createDefaultQuestionData(): QuestionUserData {
  return {
    status: 'not_started',
    starred: false,
    notes: [],
    userSources: [],
  };
}

function useUserDataHook() {
  const [data, setData] = useState<AppUserData>(loadUserData);

  const persist = useCallback((updater: (prev: AppUserData) => AppUserData) => {
    setData((prev) => {
      const next = updater(prev);
      saveUserData(next);
      return next;
    });
  }, []);

  // Re-read localStorage when modified externally (e.g., by the browser extension)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setData(JSON.parse(e.newValue));
        } catch { /* ignore malformed data */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const getQuestionData = useCallback(
    (questionId: string): QuestionUserData => {
      return data.questions[questionId] || createDefaultQuestionData();
    },
    [data]
  );

  const setStatus = useCallback(
    (questionId: string, status: QuestionStatus) => {
      persist((prev) => ({
        ...prev,
        questions: {
          ...prev.questions,
          [questionId]: {
            ...(prev.questions[questionId] || createDefaultQuestionData()),
            status,
          },
        },
      }));
    },
    [persist]
  );

  const toggleStar = useCallback(
    (questionId: string) => {
      persist((prev) => {
        const existing = prev.questions[questionId] || createDefaultQuestionData();
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: { ...existing, starred: !existing.starred },
          },
        };
      });
    },
    [persist]
  );

  // Notes
  const addNote = useCallback(
    (questionId: string, content: string) => {
      const now = new Date().toISOString();
      const note: ResearchNote = {
        id: createId(),
        content,
        createdAt: now,
        updatedAt: now,
      };
      persist((prev) => {
        const existing = prev.questions[questionId] || createDefaultQuestionData();
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: {
              ...existing,
              notes: [note, ...existing.notes],
            },
          },
        };
      });
    },
    [persist]
  );

  const updateNote = useCallback(
    (questionId: string, noteId: string, content: string) => {
      persist((prev) => {
        const existing = prev.questions[questionId];
        if (!existing) return prev;
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: {
              ...existing,
              notes: existing.notes.map((n) =>
                n.id === noteId
                  ? { ...n, content, updatedAt: new Date().toISOString() }
                  : n
              ),
            },
          },
        };
      });
    },
    [persist]
  );

  const deleteNote = useCallback(
    (questionId: string, noteId: string) => {
      persist((prev) => {
        const existing = prev.questions[questionId];
        if (!existing) return prev;
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: {
              ...existing,
              notes: existing.notes.filter((n) => n.id !== noteId),
            },
          },
        };
      });
    },
    [persist]
  );

  // User sources
  const addSource = useCallback(
    (
      questionId: string,
      source: Omit<UserSource, 'id' | 'addedAt'>
    ) => {
      const newSource: UserSource = {
        ...source,
        id: createId(),
        addedAt: new Date().toISOString(),
      };
      persist((prev) => {
        const existing = prev.questions[questionId] || createDefaultQuestionData();
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: {
              ...existing,
              userSources: [...existing.userSources, newSource],
            },
          },
        };
      });
    },
    [persist]
  );

  const deleteSource = useCallback(
    (questionId: string, sourceId: string) => {
      persist((prev) => {
        const existing = prev.questions[questionId];
        if (!existing) return prev;
        return {
          ...prev,
          questions: {
            ...prev.questions,
            [questionId]: {
              ...existing,
              userSources: existing.userSources.filter((s) => s.id !== sourceId),
            },
          },
        };
      });
    },
    [persist]
  );

  // Journal
  const addJournalEntry = useCallback(
    (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const newEntry: JournalEntry = {
        ...entry,
        id: createId(),
        createdAt: now,
        updatedAt: now,
      };
      persist((prev) => ({
        ...prev,
        journal: [newEntry, ...prev.journal],
      }));
    },
    [persist]
  );

  const updateJournalEntry = useCallback(
    (entryId: string, content: string) => {
      persist((prev) => ({
        ...prev,
        journal: prev.journal.map((e) =>
          e.id === entryId
            ? { ...e, content, updatedAt: new Date().toISOString() }
            : e
        ),
      }));
    },
    [persist]
  );

  const deleteJournalEntry = useCallback(
    (entryId: string) => {
      persist((prev) => ({
        ...prev,
        journal: prev.journal.filter((e) => e.id !== entryId),
      }));
    },
    [persist]
  );

  // Library
  const addToLibrary = useCallback(
    (article: Omit<LibraryArticle, 'id' | 'savedAt' | 'updatedAt' | 'notes' | 'excerpts' | 'linkedQuestions' | 'tags' | 'aiSummary'>) => {
      const now = new Date().toISOString();
      const newArticle: LibraryArticle = {
        ...article,
        id: createId(),
        notes: '',
        excerpts: [],
        linkedQuestions: [],
        tags: [],
        aiSummary: null,
        savedAt: now,
        updatedAt: now,
      };
      persist((prev) => ({
        ...prev,
        library: [newArticle, ...prev.library],
      }));
    },
    [persist]
  );

  const isInLibrary = useCallback(
    (doi: string | null, title: string): boolean => {
      return data.library.some(
        (a) => (doi && a.doi === doi) || a.title.toLowerCase() === title.toLowerCase()
      );
    },
    [data]
  );

  const getArticle = useCallback(
    (articleId: string): LibraryArticle | undefined => {
      return data.library.find((a) => a.id === articleId);
    },
    [data]
  );

  const getArticlesForQuestion = useCallback(
    (questionId: string): LibraryArticle[] => {
      return data.library.filter((a) => a.linkedQuestions.includes(questionId));
    },
    [data]
  );

  const updateArticleStatus = useCallback(
    (articleId: string, status: ArticleStatus) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId ? { ...a, status, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persist]
  );

  const updateArticleNotes = useCallback(
    (articleId: string, notes: string) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId ? { ...a, notes, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persist]
  );

  const updateAiSummary = useCallback(
    (articleId: string, summary: string | null) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId ? { ...a, aiSummary: summary, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persist]
  );

  const deleteArticle = useCallback(
    (articleId: string) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.filter((a) => a.id !== articleId),
      }));
    },
    [persist]
  );

  const addExcerpt = useCallback(
    (articleId: string, quote: string, comment: string) => {
      const excerpt = {
        id: createId(),
        quote,
        comment,
        createdAt: new Date().toISOString(),
      };
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId
            ? { ...a, excerpts: [...a.excerpts, excerpt], updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persist]
  );

  const deleteExcerpt = useCallback(
    (articleId: string, excerptId: string) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId
            ? { ...a, excerpts: a.excerpts.filter((e) => e.id !== excerptId), updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persist]
  );

  const linkQuestion = useCallback(
    (articleId: string, questionId: string) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId && !a.linkedQuestions.includes(questionId)
            ? { ...a, linkedQuestions: [...a.linkedQuestions, questionId], updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persist]
  );

  const unlinkQuestion = useCallback(
    (articleId: string, questionId: string) => {
      persist((prev) => ({
        ...prev,
        library: prev.library.map((a) =>
          a.id === articleId
            ? { ...a, linkedQuestions: a.linkedQuestions.filter((q) => q !== questionId), updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persist]
  );

  // Stats
  const statusCounts = useMemo(() => {
    const allQ = getAllQuestions();
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
  }, [data]);

  // Import
  const importData = useCallback(
    (newData: AppUserData) => {
      persist(() => newData);
    },
    [persist]
  );

  return {
    data,
    getQuestionData,
    setStatus,
    toggleStar,
    addNote,
    updateNote,
    deleteNote,
    addSource,
    deleteSource,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    addToLibrary,
    isInLibrary,
    getArticle,
    getArticlesForQuestion,
    updateArticleStatus,
    updateArticleNotes,
    updateAiSummary,
    deleteArticle,
    addExcerpt,
    deleteExcerpt,
    linkQuestion,
    unlinkQuestion,
    statusCounts,
    totalNotes,
    importData,
  };
}

type UserDataContextType = ReturnType<typeof useUserDataHook>;

const UserDataContext = createContext<UserDataContextType | null>(null);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const value = useUserDataHook();
  return (
    <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
  );
}

export function useUserData(): UserDataContextType {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error('useUserData must be used within UserDataProvider');
  return ctx;
}
