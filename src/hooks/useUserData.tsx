import { useState, useCallback, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type {
  AppUserData,
  Project,
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
import { loadUserData, saveUserData, STORAGE_KEY, migrateData } from '../lib/storage';
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

function normalizeQuote(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getActiveProject(data: AppUserData): Project {
  return (
    data.projects.find((p) => p.id === data.activeProjectId) ||
    data.projects[0]
  );
}

function useUserDataHook() {
  const { getToken } = useAuth();
  const [data, setData] = useState<AppUserData>(loadUserData);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      const token = await getToken();
      const success = await pushRemoteData(latestDataRef.current, token);
      setSyncStatus(success ? 'saved' : 'error');
    }, 500);
  }, [getToken]);

  const persist = useCallback((updater: (prev: AppUserData) => AppUserData) => {
    setData((prev) => {
      const next = updater(prev);
      saveUserData(next);
      schedulePush();
      return next;
    });
  }, [schedulePush]);

  // Helper: update only the active project's data
  const persistProject = useCallback(
    (updater: (project: Project) => Project) => {
      persist((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === prev.activeProjectId ? updater(p) : p
        ),
      }));
    },
    [persist]
  );

  // On mount: fetch from server, merge with localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      const remote = await fetchRemoteData(token);
      if (cancelled) return;

      if (remote) {
        // Always migrate remote data — it may be in an older format (v1–v3)
        const migratedRemote = migrateData(remote as unknown as Record<string, unknown>);
        const hasLocalData = localStorage.getItem(STORAGE_KEY) !== null;

        if (!hasLocalData) {
          setData(migratedRemote);
          saveUserData(migratedRemote);
        } else {
          const local = loadUserData();
          const remoteTime = new Date(migratedRemote.lastModified || 0).getTime();
          const localTime = new Date(local.lastModified || 0).getTime();

          if (remoteTime > localTime) {
            // Remote is strictly newer — use it
            setData(migratedRemote);
            saveUserData(migratedRemote);
          } else {
            // Local is same age or newer — push local up to Neon
            schedulePush();
          }
        }
      } else if (window.location.hostname !== 'localhost') {
        schedulePush();
      }
    })();
    return () => { cancelled = true; };
  }, [schedulePush, getToken]);

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

  // Poll for remote changes (e.g., excerpts written by ThreadBrain via /api/excerpts)
  useEffect(() => {
    if (window.location.hostname === 'localhost') return;

    const POLL_MS = 30_000;

    const runPoll = async () => {
      if (document.visibilityState !== 'visible') return;
      const token = await getToken();
      const remote = await fetchRemoteData(token);
      if (!remote) return;

      const migratedRemote = migrateData(remote as unknown as Record<string, unknown>);
      const remoteTime = new Date(migratedRemote.lastModified || 0).getTime();
      const localTime = new Date(latestDataRef.current.lastModified || 0).getTime();

      if (remoteTime > localTime) {
        setData(migratedRemote);
        saveUserData(migratedRemote);
        // Do NOT call schedulePush() — would create an infinite push loop
      }
    };

    pollIntervalRef.current = setInterval(runPoll, POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runPoll();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [getToken]); // latestDataRef is a ref (always current); migrateData/saveUserData/fetchRemoteData are module-level stable

  // ── Active project ──

  const activeProject = useMemo(() => getActiveProject(data), [data]);

  // Convenience accessors for the active project's data
  const themes = activeProject.themes;
  const questions = activeProject.questions;
  const journal = activeProject.journal;
  const library = activeProject.library;

  // ── Project CRUD ──

  const switchProject = useCallback(
    (projectId: string) => {
      persist((prev) => ({ ...prev, activeProjectId: projectId }));
    },
    [persist]
  );

  const addProject = useCallback(
    (project: Omit<Project, 'id' | 'createdAt' | 'themes' | 'questions' | 'journal' | 'library'>) => {
      const newProject: Project = {
        ...project,
        id: createId(),
        createdAt: new Date().toISOString(),
        themes: [],
        questions: {},
        journal: [],
        library: [],
      };
      persist((prev) => ({
        ...prev,
        projects: [...prev.projects, newProject],
        activeProjectId: newProject.id,
      }));
      return newProject.id;
    },
    [persist]
  );

  const updateProject = useCallback(
    (projectId: string, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'themes' | 'questions' | 'journal' | 'library'>>) => {
      persist((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      }));
    },
    [persist]
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      persist((prev) => {
        if (prev.projects.length <= 1) return prev; // can't delete the last project
        const remaining = prev.projects.filter((p) => p.id !== projectId);
        const newActiveId =
          prev.activeProjectId === projectId ? remaining[0].id : prev.activeProjectId;
        return { ...prev, projects: remaining, activeProjectId: newActiveId };
      });
    },
    [persist]
  );

  // ── Theme/question helpers ──

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

  // ── Theme CRUD ──

  const addTheme = useCallback(
    (theme: Omit<ResearchTheme, 'questions'> & { questions?: ResearchQuestion[] }) => {
      const newTheme: ResearchTheme = { ...theme, questions: theme.questions || [] };
      persistProject((p) => ({ ...p, themes: [...p.themes, newTheme] }));
    },
    [persistProject]
  );

  const updateTheme = useCallback(
    (themeId: string, updates: Partial<Omit<ResearchTheme, 'id' | 'questions'>>) => {
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) => (t.id === themeId ? { ...t, ...updates } : t)),
      }));
    },
    [persistProject]
  );

  const deleteTheme = useCallback(
    (themeId: string) => {
      persistProject((p) => {
        const theme = p.themes.find((t) => t.id === themeId);
        if (!theme) return p;
        const deletedQIds = new Set(theme.questions.map((q) => q.id));
        const newQuestions = { ...p.questions };
        for (const qId of deletedQIds) delete newQuestions[qId];
        const newLibrary = p.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => !deletedQIds.has(q)),
        }));
        return {
          ...p,
          themes: p.themes.filter((t) => t.id !== themeId),
          questions: newQuestions,
          library: newLibrary,
        };
      });
    },
    [persistProject]
  );

  // ── Question CRUD ──

  const addQuestion = useCallback(
    (themeId: string, question: Omit<ResearchQuestion, 'id'>) => {
      const newQuestion: ResearchQuestion = { ...question, id: createId() };
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) =>
          t.id === themeId ? { ...t, questions: [...t.questions, newQuestion] } : t
        ),
      }));
    },
    [persistProject]
  );

  const updateQuestion = useCallback(
    (themeId: string, questionId: string, updates: Partial<Omit<ResearchQuestion, 'id'>>) => {
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) =>
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
    [persistProject]
  );

  const deleteQuestion = useCallback(
    (themeId: string, questionId: string) => {
      persistProject((p) => {
        const newQuestions = { ...p.questions };
        delete newQuestions[questionId];
        const newLibrary = p.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => q !== questionId),
        }));
        return {
          ...p,
          themes: p.themes.map((t) =>
            t.id === themeId
              ? { ...t, questions: t.questions.filter((q) => q.id !== questionId) }
              : t
          ),
          questions: newQuestions,
          library: newLibrary,
        };
      });
    },
    [persistProject]
  );

  // ── Question user data ──

  const getQuestionData = useCallback(
    (questionId: string): QuestionUserData => {
      return questions[questionId] || createDefaultQuestionData();
    },
    [questions]
  );

  const setStatus = useCallback(
    (questionId: string, status: QuestionStatus) => {
      persistProject((p) => ({
        ...p,
        questions: {
          ...p.questions,
          [questionId]: {
            ...(p.questions[questionId] || createDefaultQuestionData()),
            status,
          },
        },
      }));
    },
    [persistProject]
  );

  const toggleStar = useCallback(
    (questionId: string) => {
      persistProject((p) => {
        const existing = p.questions[questionId] || createDefaultQuestionData();
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: { ...existing, starred: !existing.starred },
          },
        };
      });
    },
    [persistProject]
  );

  const updateSearchPhrases = useCallback(
    (questionId: string, phrases: string[]) => {
      persistProject((p) => ({
        ...p,
        questions: {
          ...p.questions,
          [questionId]: {
            ...(p.questions[questionId] || createDefaultQuestionData()),
            searchPhrases: phrases,
          },
        },
      }));
    },
    [persistProject]
  );

  // Notes
  const addNote = useCallback(
    (questionId: string, content: string) => {
      const now = new Date().toISOString();
      const note: ResearchNote = { id: createId(), content, createdAt: now, updatedAt: now };
      persistProject((p) => {
        const existing = p.questions[questionId] || createDefaultQuestionData();
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: { ...existing, notes: [note, ...existing.notes] },
          },
        };
      });
    },
    [persistProject]
  );

  const updateNote = useCallback(
    (questionId: string, noteId: string, content: string) => {
      persistProject((p) => {
        const existing = p.questions[questionId];
        if (!existing) return p;
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: {
              ...existing,
              notes: existing.notes.map((n) =>
                n.id === noteId ? { ...n, content, updatedAt: new Date().toISOString() } : n
              ),
            },
          },
        };
      });
    },
    [persistProject]
  );

  const deleteNote = useCallback(
    (questionId: string, noteId: string) => {
      persistProject((p) => {
        const existing = p.questions[questionId];
        if (!existing) return p;
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: { ...existing, notes: existing.notes.filter((n) => n.id !== noteId) },
          },
        };
      });
    },
    [persistProject]
  );

  // User sources
  const addSource = useCallback(
    (questionId: string, source: Omit<UserSource, 'id' | 'addedAt'>) => {
      const newSource: UserSource = { ...source, id: createId(), addedAt: new Date().toISOString() };
      persistProject((p) => {
        const existing = p.questions[questionId] || createDefaultQuestionData();
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: { ...existing, userSources: [...existing.userSources, newSource] },
          },
        };
      });
    },
    [persistProject]
  );

  const deleteSource = useCallback(
    (questionId: string, sourceId: string) => {
      persistProject((p) => {
        const existing = p.questions[questionId];
        if (!existing) return p;
        return {
          ...p,
          questions: {
            ...p.questions,
            [questionId]: {
              ...existing,
              userSources: existing.userSources.filter((s) => s.id !== sourceId),
            },
          },
        };
      });
    },
    [persistProject]
  );

  // Journal
  const addJournalEntry = useCallback(
    (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const newEntry: JournalEntry = { ...entry, id: createId(), createdAt: now, updatedAt: now };
      persistProject((p) => ({ ...p, journal: [newEntry, ...p.journal] }));
    },
    [persistProject]
  );

  const updateJournalEntry = useCallback(
    (entryId: string, content: string) => {
      persistProject((p) => ({
        ...p,
        journal: p.journal.map((e) =>
          e.id === entryId ? { ...e, content, updatedAt: new Date().toISOString() } : e
        ),
      }));
    },
    [persistProject]
  );

  const deleteJournalEntry = useCallback(
    (entryId: string) => {
      persistProject((p) => ({
        ...p,
        journal: p.journal.filter((e) => e.id !== entryId),
      }));
    },
    [persistProject]
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
      persistProject((p) => ({ ...p, library: [newArticle, ...p.library] }));
    },
    [persistProject]
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

  const updateArticleStatus = useCallback(
    (articleId: string, status: ArticleStatus) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId ? { ...a, status, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persistProject]
  );

  const updateArticleNotes = useCallback(
    (articleId: string, notes: string) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId ? { ...a, notes, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persistProject]
  );

  const updateArticleTags = useCallback(
    (articleId: string, tags: string[]) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId ? { ...a, tags, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persistProject]
  );

  const updateAiSummary = useCallback(
    (articleId: string, summary: string | null) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId ? { ...a, aiSummary: summary, updatedAt: new Date().toISOString() } : a
        ),
      }));
    },
    [persistProject]
  );

  const deleteArticle = useCallback(
    (articleId: string) => {
      persistProject((p) => ({
        ...p,
        library: p.library.filter((a) => a.id !== articleId),
      }));
    },
    [persistProject]
  );

  const addExcerpt = useCallback(
    (articleId: string, quote: string, comment: string) => {
      persistProject((p) => {
        const article = p.library.find((a) => a.id === articleId);
        if (!article) return p;
        const incomingNorm = normalizeQuote(quote);
        const isDuplicate = article.excerpts.some((e) => normalizeQuote(e.quote) === incomingNorm);
        if (isDuplicate) return p;
        const excerpt = { id: createId(), quote, comment, createdAt: new Date().toISOString() };
        return {
          ...p,
          library: p.library.map((a) =>
            a.id === articleId
              ? { ...a, excerpts: [...a.excerpts, excerpt], updatedAt: new Date().toISOString() }
              : a
          ),
        };
      });
    },
    [persistProject]
  );

  const deleteExcerpt = useCallback(
    (articleId: string, excerptId: string) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId
            ? { ...a, excerpts: a.excerpts.filter((e) => e.id !== excerptId), updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persistProject]
  );

  const linkQuestion = useCallback(
    (articleId: string, questionId: string) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId && !a.linkedQuestions.includes(questionId)
            ? { ...a, linkedQuestions: [...a.linkedQuestions, questionId], updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persistProject]
  );

  const unlinkQuestion = useCallback(
    (articleId: string, questionId: string) => {
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId
            ? { ...a, linkedQuestions: a.linkedQuestions.filter((q) => q !== questionId), updatedAt: new Date().toISOString() }
            : a
        ),
      }));
    },
    [persistProject]
  );

  // Stats
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

  // Import
  const importData = useCallback(
    (newData: AppUserData) => {
      persist(() => newData);
    },
    [persist]
  );

  return {
    data,
    // Active project
    activeProject,
    themes,
    questions,
    journal,
    library,
    // Project management
    switchProject,
    addProject,
    updateProject,
    deleteProject,
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
    updateArticleTags,
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

export type UserDataContextType = ReturnType<typeof useUserDataHook>;

export const UserDataContext = createContext<UserDataContextType | null>(null);

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
