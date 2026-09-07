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
  UserPreferences,
  ProjectViewState,
} from '../types';
import {
  loadUserData,
  saveUserData,
  STORAGE_KEY,
  migrateData,
  loadUserDataForOwner,
  clearDataCache,
} from '../lib/storage';
import { createId } from '../lib/ids';
import { fetchRemoteData, pushRemoteData } from '../lib/api';
import { fetchOAVersion, bestUnpaywallUrl } from '../services/unpaywall';
import { applyPreferences, resolvePreferences, resolveViewState } from '../lib/preferences';
import { useUndo, describeItem } from './useUndo';

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
  const { getToken, userId } = useAuth();
  const { pushUndo } = useUndo();
  // Resolved once, at first render. `ownerChanged` means the cached blob
  // belonged to a different Clerk user and has been discarded; the mount effect
  // reads it to also drop the service worker's /api/data entry.
  const [initialLoad] = useState(() => loadUserDataForOwner(userId));
  const [data, setData] = useState<AppUserData>(initialLoad.data);
  const cacheResetDoneRef = useRef(false);
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

  /**
   * Read the active project as it stands right now, outside a state updater.
   *
   * Deletes need to capture what they are about to remove — and its index — so
   * undo can put it back exactly where it was. Doing that inside a `persist`
   * updater would mean a side effect in a function React is free to call twice,
   * so the capture reads the ref instead.
   */
  const snapshotProject = useCallback((): Project | null => {
    const d = latestDataRef.current;
    return d.projects.find((p) => p.id === d.activeProjectId) ?? d.projects[0] ?? null;
  }, []);

  // On mount: fetch from server, merge with localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A different account was cached on this device. Its localStorage copy is
      // already gone; the offline cache has to go too, or NetworkFirst can serve
      // their /api/data response to this user.
      if (initialLoad.ownerChanged && !cacheResetDoneRef.current) {
        cacheResetDoneRef.current = true;
        await clearDataCache();
      }
      const token = await getToken();
      const remote = await fetchRemoteData(token);
      if (cancelled) return;

      if (remote) {
        // Always migrate remote data — it may be in an older format (v1–v3)
        const migratedRemote = migrateData(remote as unknown as Record<string, unknown>);
        const remoteArticles = migratedRemote.projects?.reduce((sum, p) => sum + (p.library?.length ?? 0), 0) ?? 0;
        console.log('[load] Remote data fetched. Articles:', remoteArticles, 'lastModified:', migratedRemote.lastModified);
        const hasLocalData = localStorage.getItem(STORAGE_KEY) !== null;

        if (!hasLocalData) {
          console.log('[load] No local data — using remote.');
          setData(migratedRemote);
          saveUserData(migratedRemote);
        } else {
          const local = loadUserData();
          const localArticles = local.projects?.reduce((sum, p) => sum + (p.library?.length ?? 0), 0) ?? 0;
          const remoteTime = new Date(migratedRemote.lastModified || 0).getTime();
          const localTime = new Date(local.lastModified || 0).getTime();
          console.log('[load] Local articles:', localArticles, 'lastModified:', local.lastModified);
          console.log('[load] Decision: remote newer?', remoteTime > localTime, '(remote:', migratedRemote.lastModified, 'local:', local.lastModified, ')');

          if (remoteTime > localTime) {
            // Remote is strictly newer — use it
            console.log('[load] Using remote data.');
            setData(migratedRemote);
            saveUserData(migratedRemote);
          } else {
            // Local is same age or newer — push local up to Neon
            console.log('[load] Using local data, pushing to Neon.');
            schedulePush();
          }
        }
      } else if (window.location.hostname !== 'localhost') {
        console.log('[load] No remote data returned — pushing local to Neon.');
        schedulePush();
      }
    })();
    return () => { cancelled = true; };
  }, [schedulePush, getToken, initialLoad]);

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

  // ── Display preferences & remembered view state ──

  const preferences = useMemo(() => resolvePreferences(data), [data]);

  // Reflect onto the root element so density and motion are pure CSS, the way
  // data-theme already works — no component needs to know about them.
  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  const setPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      persist((prev) => ({
        ...prev,
        preferences: { ...resolvePreferences(prev), [key]: value },
      }));
    },
    [persist],
  );

  const viewState = useMemo(
    () => resolveViewState(data, data.activeProjectId),
    [data],
  );

  /**
   * Merge a patch into the active project's remembered view state.
   *
   * Writes go through `persist`, so they hit localStorage immediately and the
   * server on the usual 500ms debounce — a filter typed character by character
   * still results in one push.
   */
  const setViewState = useCallback(
    (patch: Partial<ProjectViewState>) => {
      // No-op guard. A view that seeds its state from here writes the same
      // values straight back on mount; without this, merely opening the
      // Library would bump lastModified and trigger a server push on every
      // single visit.
      const snapshot = latestDataRef.current;
      const current = resolveViewState(snapshot, snapshot.activeProjectId);
      if (JSON.stringify(current) === JSON.stringify({ ...current, ...patch })) return;

      persist((prev) => {
        const projectId = prev.activeProjectId;
        const prevState = resolveViewState(prev, projectId);
        return {
          ...prev,
          viewState: {
            ...(prev.viewState ?? {}),
            [projectId]: { ...prevState, ...patch },
          },
        };
      });
    },
    [persist],
  );

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
      const snapshot = latestDataRef.current;
      if (snapshot.projects.length <= 1) return; // can't delete the last project
      const index = snapshot.projects.findIndex((p) => p.id === projectId);
      const removed = index >= 0 ? snapshot.projects[index] : null;
      const previousActiveId = snapshot.activeProjectId;

      persist((prev) => {
        if (prev.projects.length <= 1) return prev; // can't delete the last project
        const remaining = prev.projects.filter((p) => p.id !== projectId);
        const newActiveId =
          prev.activeProjectId === projectId ? remaining[0].id : prev.activeProjectId;
        return { ...prev, projects: remaining, activeProjectId: newActiveId };
      });

      if (!removed) return;
      pushUndo({
        description: describeItem('project', removed.name),
        onUndo: () =>
          persist((prev) => {
            const restored = [...prev.projects];
            restored.splice(Math.min(index, restored.length), 0, removed);
            // Restoring the project also restores it as the active one, if it
            // was — otherwise undo would leave you looking at a different
            // project than the one you just got back.
            return { ...prev, projects: restored, activeProjectId: previousActiveId };
          }),
      });
    },
    [persist, pushUndo]
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
      const project = snapshotProject();
      const index = project?.themes.findIndex((t) => t.id === themeId) ?? -1;
      const removed = index >= 0 ? project!.themes[index] : null;
      // Capture the whole cascade, so undo restores the theme AND everything
      // that went with it rather than an empty shell.
      const removedUserData: Record<string, QuestionUserData> = {};
      if (removed) {
        for (const q of removed.questions) {
          const ud = project?.questions[q.id];
          if (ud) removedUserData[q.id] = ud;
        }
      }
      const deletedQIds = new Set((removed?.questions ?? []).map((q) => q.id));
      const relinkTargets = (project?.library ?? [])
        .filter((a) => a.linkedQuestions.some((q) => deletedQIds.has(q)))
        .map((a) => ({ articleId: a.id, linkedQuestions: [...a.linkedQuestions] }));

      persistProject((p) => {
        const theme = p.themes.find((t) => t.id === themeId);
        if (!theme) return p;
        const qIds = new Set(theme.questions.map((q) => q.id));
        const newQuestions = { ...p.questions };
        for (const qId of qIds) delete newQuestions[qId];
        const newLibrary = p.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => !qIds.has(q)),
        }));
        return {
          ...p,
          themes: p.themes.filter((t) => t.id !== themeId),
          questions: newQuestions,
          library: newLibrary,
        };
      });

      if (!removed) return;
      pushUndo({
        description: describeItem('theme', removed.theme),
        onUndo: () =>
          persistProject((p) => {
            const relink = new Map(relinkTargets.map((r) => [r.articleId, r.linkedQuestions]));
            const restoredThemes = [...p.themes];
            restoredThemes.splice(Math.min(index, restoredThemes.length), 0, removed);
            return {
              ...p,
              themes: restoredThemes,
              questions: { ...p.questions, ...removedUserData },
              library: p.library.map((a) =>
                relink.has(a.id) ? { ...a, linkedQuestions: relink.get(a.id)! } : a
              ),
            };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
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
      const project = snapshotProject();
      const themeQuestions = project?.themes.find((t) => t.id === themeId)?.questions ?? [];
      const index = themeQuestions.findIndex((q) => q.id === questionId);
      const removed = index >= 0 ? themeQuestions[index] : null;
      // The cascade: per-question user data, and every article that linked it.
      const removedUserData = project?.questions[questionId];
      const relinkTargets = (project?.library ?? [])
        .filter((a) => a.linkedQuestions.includes(questionId))
        .map((a) => ({ articleId: a.id, linkedQuestions: [...a.linkedQuestions] }));

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

      if (!removed) return;
      pushUndo({
        description: describeItem('question', removed.q),
        onUndo: () =>
          persistProject((p) => {
            const relink = new Map(relinkTargets.map((r) => [r.articleId, r.linkedQuestions]));
            return {
              ...p,
              themes: p.themes.map((t) => {
                if (t.id !== themeId) return t;
                const restored = [...t.questions];
                restored.splice(Math.min(index, restored.length), 0, removed);
                return { ...t, questions: restored };
              }),
              questions: removedUserData
                ? { ...p.questions, [questionId]: removedUserData }
                : p.questions,
              library: p.library.map((a) =>
                relink.has(a.id) ? { ...a, linkedQuestions: relink.get(a.id)! } : a
              ),
            };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
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
      const project = snapshotProject();
      const notes = project?.questions[questionId]?.notes ?? [];
      const index = notes.findIndex((n) => n.id === noteId);
      const removed = index >= 0 ? notes[index] : null;

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

      if (!removed) return;
      pushUndo({
        description: describeItem('note', removed.content),
        onUndo: () =>
          persistProject((p) => {
            const existing = p.questions[questionId];
            if (!existing) return p;
            const restored = [...existing.notes];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return {
              ...p,
              questions: { ...p.questions, [questionId]: { ...existing, notes: restored } },
            };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
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
      const project = snapshotProject();
      const sources = project?.questions[questionId]?.userSources ?? [];
      const index = sources.findIndex((s) => s.id === sourceId);
      const removed = index >= 0 ? sources[index] : null;

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

      if (!removed) return;
      pushUndo({
        description: describeItem('source', removed.text),
        onUndo: () =>
          persistProject((p) => {
            const existing = p.questions[questionId];
            if (!existing) return p;
            const restored = [...existing.userSources];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return {
              ...p,
              questions: { ...p.questions, [questionId]: { ...existing, userSources: restored } },
            };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
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
    (entryId: string, updates: { content?: string; tags?: string[] }) => {
      persistProject((p) => ({
        ...p,
        journal: p.journal.map((e) =>
          e.id === entryId ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
        ),
      }));
    },
    [persistProject]
  );

  const deleteJournalEntry = useCallback(
    (entryId: string) => {
      const journalNow = snapshotProject()?.journal ?? [];
      const index = journalNow.findIndex((e) => e.id === entryId);
      const removed = index >= 0 ? journalNow[index] : null;

      persistProject((p) => ({
        ...p,
        journal: p.journal.filter((e) => e.id !== entryId),
      }));

      if (!removed) return;
      pushUndo({
        description: describeItem('journal entry', removed.content),
        onUndo: () =>
          persistProject((p) => {
            const restored = [...p.journal];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return { ...p, journal: restored };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
  );

  // Library
  const checkUnpaywall = useCallback(
    async (articleId: string, doi: string): Promise<string | null> => {
      const result = await fetchOAVersion(doi);
      const url = bestUnpaywallUrl(result);
      const now = new Date().toISOString();
      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId
            ? { ...a, unpaywallUrl: url, unpaywallCheckedAt: now, updatedAt: now }
            : a
        ),
      }));
      return url;
    },
    [persistProject]
  );

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
        unpaywallUrl: null,
        unpaywallCheckedAt: null,
        savedAt: now,
        updatedAt: now,
      };
      persistProject((p) => ({ ...p, library: [newArticle, ...p.library] }));

      // Fire-and-forget: enrich with Unpaywall when not already OA and DOI is known.
      if (!newArticle.isOpenAccess && newArticle.doi) {
        void checkUnpaywall(newArticle.id, newArticle.doi);
      }
    },
    [persistProject, checkUnpaywall]
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
      const libraryNow = snapshotProject()?.library ?? [];
      const index = libraryNow.findIndex((a) => a.id === articleId);
      const removed = index >= 0 ? libraryNow[index] : null;

      persistProject((p) => ({
        ...p,
        library: p.library.filter((a) => a.id !== articleId),
      }));

      if (!removed) return;
      pushUndo({
        description: describeItem('article', removed.title),
        onUndo: () =>
          persistProject((p) => {
            const restored = [...p.library];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return { ...p, library: restored };
          }),
      });
    },
    [persistProject, snapshotProject, pushUndo]
  );

  const addExcerpt = useCallback(
    (articleId: string, quote: string, comment: string) => {
      persistProject((p) => {
        const article = p.library.find((a) => a.id === articleId);
        if (!article) return p;
        const incomingNorm = normalizeQuote(quote);
        const isDuplicate = article.excerpts.some((e) => normalizeQuote(e.quote) === incomingNorm);
        if (isDuplicate) return p;
        const excerpt = { id: createId(), quote, comment, createdAt: new Date().toISOString(), source: 'manual' as const };
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
      const excerpts = snapshotProject()?.library.find((a) => a.id === articleId)?.excerpts ?? [];
      const index = excerpts.findIndex((e) => e.id === excerptId);
      const removed = index >= 0 ? excerpts[index] : null;

      persistProject((p) => ({
        ...p,
        library: p.library.map((a) =>
          a.id === articleId
            ? { ...a, excerpts: a.excerpts.filter((e) => e.id !== excerptId), updatedAt: new Date().toISOString() }
            : a
        ),
      }));

      if (!removed) return;
      pushUndo({
        description: describeItem('excerpt', removed.quote),
        onUndo: () =>
          persistProject((p) => ({
            ...p,
            library: p.library.map((a) => {
              if (a.id !== articleId) return a;
              const restored = [...a.excerpts];
              restored.splice(Math.min(index, restored.length), 0, removed);
              return { ...a, excerpts: restored, updatedAt: new Date().toISOString() };
            }),
          })),
      });
    },
    [persistProject, snapshotProject, pushUndo]
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

  // Import — push immediately to Neon, don't debounce
  // (debounced push can be cancelled by a page refresh before it fires)
  const importData = useCallback(
    async (newData: AppUserData): Promise<boolean> => {
      const articleCount = newData.projects?.reduce((sum, p) => sum + (p.library?.length ?? 0), 0) ?? 0;
      console.log('[import] Starting import. Projects:', newData.projects?.length ?? 0, 'Articles:', articleCount, 'lastModified:', newData.lastModified);
      setData(newData);
      saveUserData(newData);
      latestDataRef.current = newData;
      setSyncStatus('saving');
      const token = await getToken();
      console.log('[import] Pushing to Neon. Token present:', !!token);
      const success = await pushRemoteData(newData, token);
      console.log('[import] Neon push result:', success ? 'SUCCESS' : 'FAILED');
      setSyncStatus(success ? 'saved' : 'error');
      return success;
    },
    [getToken]
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
    checkUnpaywall,
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
    // Display preferences & remembered view state
    preferences,
    setPreference,
    viewState,
    setViewState,
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
