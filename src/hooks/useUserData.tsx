import { useState, useCallback, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import type {
  AppUserData,
  QuestionUserData,
  QuestionStatus,
  ResearchNote,
  UserSource,
  JournalEntry,
  LibraryArticle,
  ArticleStatus,
  FlatQuestion,
  ResearchTheme,
  ResearchQuestion,
} from '../types';
import { loadUserData, saveUserData, STORAGE_KEY } from '../lib/storage';
import { createId } from '../lib/ids';
import { fetchRemoteData, pushRemoteData } from '../lib/api';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'offline';

function createDefaultQuestionData(): QuestionUserData {
  return {
    status: 'not_started',
    starred: false,
    notes: [],
    userSources: [],
  };
}

// ── Helper: flatten themes into FlatQuestion[] ──

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

function useUserDataHook() {
  const [data, setData] = useState<AppUserData>(loadUserData);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<AppUserData>(data);

  // Keep ref in sync with state
  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  // Debounced push to server
  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    setSyncStatus('saving');
    pushTimerRef.current = setTimeout(async () => {
      const success = await pushRemoteData(latestDataRef.current);
      setSyncStatus(success ? 'saved' : 'error');
    }, 500);
  }, []);

  const persist = useCallback((updater: (prev: AppUserData) => AppUserData) => {
    setData((prev) => {
      const next = updater(prev);
      saveUserData(next);
      schedulePush();
      return next;
    });
  }, [schedulePush]);

  // On mount: fetch from server, merge with localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchRemoteData();
      if (cancelled) return;

      if (remote) {
        // Server has data — use whichever is newer
        const local = loadUserData();
        const remoteTime = new Date(remote.lastModified || 0).getTime();
        const localTime = new Date(local.lastModified || 0).getTime();

        if (remoteTime >= localTime) {
          setData(remote);
          saveUserData(remote);
        } else {
          // Local is newer (e.g., offline edits) — push to server
          schedulePush();
        }
      } else if (window.location.hostname !== 'localhost') {
        // Server is empty — push local data as initial seed
        schedulePush();
      }
    })();
    return () => { cancelled = true; };
  }, [schedulePush]);

  // Re-read localStorage when modified externally (e.g., by the browser extension)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setData(parsed);
          schedulePush();
        } catch { /* ignore malformed data */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [schedulePush]);

  // ── Theme/question helpers (replaces research-themes.ts helpers) ──

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

  // ── Theme CRUD ──

  const addTheme = useCallback(
    (theme: Omit<ResearchTheme, 'questions'> & { questions?: ResearchQuestion[] }) => {
      const newTheme: ResearchTheme = {
        ...theme,
        questions: theme.questions || [],
      };
      persist((prev) => ({
        ...prev,
        themes: [...prev.themes, newTheme],
      }));
    },
    [persist]
  );

  const updateTheme = useCallback(
    (themeId: string, updates: Partial<Omit<ResearchTheme, 'id' | 'questions'>>) => {
      persist((prev) => ({
        ...prev,
        themes: prev.themes.map((t) =>
          t.id === themeId ? { ...t, ...updates } : t
        ),
      }));
    },
    [persist]
  );

  const deleteTheme = useCallback(
    (themeId: string) => {
      persist((prev) => {
        const theme = prev.themes.find((t) => t.id === themeId);
        if (!theme) return prev;

        // Collect all question IDs that belong to this theme
        const deletedQIds = new Set(theme.questions.map((q) => q.id));

        // Clean up question user data and article links
        const newQuestions = { ...prev.questions };
        for (const qId of deletedQIds) {
          delete newQuestions[qId];
        }

        const newLibrary = prev.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => !deletedQIds.has(q)),
        }));

        return {
          ...prev,
          themes: prev.themes.filter((t) => t.id !== themeId),
          questions: newQuestions,
          library: newLibrary,
        };
      });
    },
    [persist]
  );

  // ── Question CRUD ──

  const addQuestion = useCallback(
    (themeId: string, question: Omit<ResearchQuestion, 'id'>) => {
      const newQuestion: ResearchQuestion = {
        ...question,
        id: createId(),
      };
      persist((prev) => ({
        ...prev,
        themes: prev.themes.map((t) =>
          t.id === themeId
            ? { ...t, questions: [...t.questions, newQuestion] }
            : t
        ),
      }));
    },
    [persist]
  );

  const updateQuestion = useCallback(
    (themeId: string, questionId: string, updates: Partial<Omit<ResearchQuestion, 'id'>>) => {
      persist((prev) => ({
        ...prev,
        themes: prev.themes.map((t) =>
          t.id === themeId
            ? {
                ...t,
                questions: t.questions.map((q) =>
                  q.id === questionId ? { ...q, ...updates } : q
                ),
              }
            : t
        ),
      }));
    },
    [persist]
  );

  const deleteQuestion = useCallback(
    (themeId: string, questionId: string) => {
      persist((prev) => {
        const newQuestions = { ...prev.questions };
        delete newQuestions[questionId];

        const newLibrary = prev.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => q !== questionId),
        }));

        return {
          ...prev,
          themes: prev.themes.map((t) =>
            t.id === themeId
              ? { ...t, questions: t.questions.filter((q) => q.id !== questionId) }
              : t
          ),
          questions: newQuestions,
          library: newLibrary,
        };
      });
    },
    [persist]
  );

  // ── Question user data ──

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

  // Search phrases
  const updateSearchPhrases = useCallback(
    (questionId: string, phrases: string[]) => {
      persist((prev) => ({
        ...prev,
        questions: {
          ...prev.questions,
          [questionId]: {
            ...(prev.questions[questionId] || createDefaultQuestionData()),
            searchPhrases: phrases,
          },
        },
      }));
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
    (article: Omit<LibraryArticle, 'id' | 'savedAt' | 'updatedAt' | 'notes' | 'excerpts' | 'linkedQuestions' | 'tags' | 'aiSummary' | 'isOpenAccess'> & { isOpenAccess?: boolean }) => {
      const now = new Date().toISOString();
      const newArticle: LibraryArticle = {
        ...article,
        id: createId(),
        notes: '',
        excerpts: [],
        linkedQuestions: [],
        tags: [],
        aiSummary: null,
        isOpenAccess: article.isOpenAccess ?? false,
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
    // Theme/question helpers
    getAllQuestions,
    getQuestionById,
    getThemeById,
    // Theme CRUD
    addTheme,
    updateTheme,
    deleteTheme,
    // Question CRUD
    addQuestion,
    updateQuestion,
    deleteQuestion,
    // Question user data
    getQuestionData,
    setStatus,
    toggleStar,
    updateSearchPhrases,
    addNote,
    updateNote,
    deleteNote,
    addSource,
    deleteSource,
    // Journal
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    // Library
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
    // Stats
    statusCounts,
    totalNotes,
    // Import
    importData,
    // Sync
    syncStatus,
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
