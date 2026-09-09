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
  Study,
  StudyStatus,
  Hypothesis,
  Decision,
  DecisionStatus,
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
export type BackendStatus = 'unknown' | 'ok' | 'unavailable';

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

/**
 * Nulls every pointer at `removedId` inside a study.
 *
 * Called after deleting a hypothesis or decision so the revision chain never
 * dangles — the app-side equivalent of the ON DELETE SET NULL that the
 * superseded_by and hypothesis_id foreign keys carry in Postgres.
 */
function clearReferencesTo(study: Study, removedId: string): Study {
  return {
    ...study,
    hypotheses: study.hypotheses.map((h) =>
      h.supersededBy === removedId ? { ...h, supersededBy: null } : h
    ),
    decisions: study.decisions.map((d) => {
      if (d.supersededBy !== removedId && d.hypothesisId !== removedId) return d;
      return {
        ...d,
        supersededBy: d.supersededBy === removedId ? null : d.supersededBy,
        hypothesisId: d.hypothesisId === removedId ? null : d.hypothesisId,
      };
    }),
  };
}

const isLive = <T extends { deletedAt?: string | null }>(x: T): boolean => !x.deletedAt;

function getActiveProject(data: AppUserData): Project {
  const live = data.projects.filter(isLive);
  return (
    live.find((p) => p.id === data.activeProjectId) ||
    live[0] ||
    // Everything is soft-deleted. Falling back to a deleted project beats
    // returning undefined and crashing every consumer of activeProject.
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
  // Whether /api/* is actually answering. 'unknown' until the first attempt
  // resolves; 'unavailable' means what is on screen is local-only and may not
  // be this account's real data, which the app has to say out loud.
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('unknown');
  const [backendReason, setBackendReason] = useState<string | null>(null);
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
      const result = await pushRemoteData(latestDataRef.current, token);
      if (result.status === 'ok') {
        setSyncStatus('saved');
        setBackendStatus('ok');
      } else {
        setSyncStatus('offline');
        setBackendStatus('unavailable');
        setBackendReason(result.reason);
      }
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
      const result = await fetchRemoteData(token);
      if (cancelled) return;

      if (result.status === 'unavailable') {
        // Do NOT schedulePush and do NOT let seeded defaults pass for real data.
        // Whatever is on screen came from localStorage (or is a fresh seed), and
        // the user has to be told, or an empty seed reads as "my research is gone".
        console.error('[load] Backend unavailable —', result.reason);
        setBackendStatus('unavailable');
        setBackendReason(result.reason);
        setSyncStatus('offline');
        return;
      }

      setBackendStatus('ok');
      setBackendReason(null);

      if (result.status === 'ok') {
        const remote = result.data;
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
      } else {
        // status === 'empty': the backend is healthy and has no row for this
        // user yet, so seeding local data up is the correct thing to do.
        console.log('[load] No remote data for this user — pushing local to Neon.');
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
    if (backendStatus !== 'ok') return;

    const POLL_MS = 30_000;

    const runPoll = async () => {
      if (document.visibilityState !== 'visible') return;
      const token = await getToken();
      const result = await fetchRemoteData(token);
      if (result.status !== 'ok') return;

      const migratedRemote = migrateData(result.data as unknown as Record<string, unknown>);
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
  }, [getToken, backendStatus]); // latestDataRef is a ref (always current); migrateData/saveUserData/fetchRemoteData are module-level stable

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

  // Convenience accessors for the active project's data.
  // `themes` excludes soft-deleted ones: this is the single chokepoint every
  // view reads through, so filtering here hides them from counts, filters,
  // search and export in one place.
  const themes = useMemo(() => activeProject.themes.filter(isLive), [activeProject]);
  const deletedThemes = useMemo(
    () => activeProject.themes.filter((t) => !isLive(t)),
    [activeProject]
  );
  const visibleProjects = useMemo(() => data.projects.filter(isLive), [data.projects]);
  const deletedProjects = useMemo(() => data.projects.filter((p) => !isLive(p)), [data.projects]);
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
      // "Last project" means the last LIVE one — a soft-deleted project still
      // sits in the array but must not count as somewhere to fall back to.
      const live = snapshot.projects.filter((p) => !p.deletedAt);
      if (live.length <= 1) return;
      const removed = snapshot.projects.find((p) => p.id === projectId);
      if (!removed || removed.deletedAt) return;

      const deletedAt = new Date().toISOString();
      persist((prev) => {
        if (prev.projects.filter((p) => !p.deletedAt).length <= 1) return prev;
        const projects = prev.projects.map((p) =>
          p.id === projectId ? { ...p, deletedAt } : p
        );
        const nextActive =
          prev.activeProjectId === projectId
            ? projects.find((p) => !p.deletedAt)!.id
            : prev.activeProjectId;
        return { ...prev, projects, activeProjectId: nextActive };
      });

      pushUndo({
        description: describeItem('project', removed.name),
        onUndo: () => restoreProject(projectId),
      });
    },
    // restoreProject is declared below and is stable; referencing it here is
    // safe because onUndo only runs after render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist, pushUndo]
  );

  /**
   * Clears a project's soft-delete flag and makes it active again.
   *
   * Restoring is just clearing the flag because the delete never took the
   * subtree apart — see ResearchTheme.deletedAt. There is no partial-restore
   * case to get wrong.
   */
  const restoreProject = useCallback(
    (projectId: string) => {
      persist((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, deletedAt: null } : p
        ),
        activeProjectId: projectId,
      }));
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

  /**
   * Soft-deletes a theme.
   *
   * Deliberately does NOT take the cascade apart. The questions stay in
   * `project.questions` and article `linkedQuestions` are untouched; the
   * theme's own `deletedAt` is what hides them, because `themes` is the single
   * accessor every view reads through. The alternative — marking the whole
   * subtree and filtering it in a dozen places — is where orphans come from.
   */
  const deleteTheme = useCallback(
    (themeId: string) => {
      const project = snapshotProject();
      const removed = project?.themes.find((t) => t.id === themeId);
      if (!removed || removed.deletedAt) return;

      const deletedAt = new Date().toISOString();
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) => (t.id === themeId ? { ...t, deletedAt } : t)),
      }));

      pushUndo({
        description: describeItem('theme', removed.theme),
        onUndo: () =>
          persistProject((p) => ({
            ...p,
            themes: p.themes.map((t) => (t.id === themeId ? { ...t, deletedAt: null } : t)),
          })),
      });
    },
    [persistProject, snapshotProject, pushUndo]
  );

  /** Clears a theme's soft-delete flag; its subtree was never disturbed. */
  const restoreTheme = useCallback(
    (themeId: string) => {
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) => (t.id === themeId ? { ...t, deletedAt: null } : t)),
      }));
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
      const project = snapshotProject();
      const themeQuestions = project?.themes.find((t) => t.id === themeId)?.questions ?? [];
      const index = themeQuestions.findIndex((q) => q.id === questionId);
      const removed = index >= 0 ? themeQuestions[index] : null;
      // The cascade: per-question user data, and every article that linked it.
      const removedUserData = project?.questions[questionId];
      const relinkTargets = (project?.library ?? [])
        .filter((a) => a.linkedQuestions.includes(questionId))
        .map((a) => ({ articleId: a.id, linkedQuestions: [...a.linkedQuestions] }));

      // Question-to-question links are symmetric, so the other side holds this
      // id too and would be left pointing at nothing.
      const relinkQuestions = (project?.themes ?? [])
        .flatMap((t) => t.questions)
        .filter((q) => q.relatedQuestions?.includes(questionId))
        .map((q) => ({ questionId: q.id, relatedQuestions: [...q.relatedQuestions!] }));

      // Journal entries filed under this question. Leaving entry.questionId
      // pointing at a deleted question is the exact dangling state the MCP
      // layer refuses to create (validateLinks in _mcp/tools/journal.ts): the
      // entry renders as unlinked but the stale id persists through every
      // later edit. Unlink and keep the entry, matching journal_delete_question.
      const relinkEntries = (project?.journal ?? [])
        .filter((e) => e.questionId === questionId)
        .map((e) => ({ entryId: e.id, updatedAt: e.updatedAt }));

      // Studies link questions the same way articles do, and a hypothesis can
      // name the question it operationalizes. Both would be left dangling.
      const relinkStudies = (project?.studies ?? [])
        .filter(
          (st) =>
            st.linkedQuestions.includes(questionId) ||
            st.hypotheses.some((h) => h.questionId === questionId)
        )
        .map((st) => ({
          studyId: st.id,
          linkedQuestions: [...st.linkedQuestions],
          hypothesisIds: st.hypotheses.filter((h) => h.questionId === questionId).map((h) => h.id),
        }));

      persistProject((p) => {
        const newQuestions = { ...p.questions };
        delete newQuestions[questionId];
        const newLibrary = p.library.map((a) => ({
          ...a,
          linkedQuestions: a.linkedQuestions.filter((q) => q !== questionId),
        }));
        return {
          ...p,
          themes: p.themes.map((t) => {
            const questions = (t.id === themeId
              ? t.questions.filter((q) => q.id !== questionId)
              : t.questions
            ).map((q) => {
              if (!q.relatedQuestions?.includes(questionId)) return q;
              const kept = q.relatedQuestions.filter((id) => id !== questionId);
              // Absent rather than [], matching the relational round-trip.
              if (kept.length > 0) return { ...q, relatedQuestions: kept };
              const stripped = { ...q };
              delete stripped.relatedQuestions;
              return stripped;
            });
            return { ...t, questions };
          }),
          questions: newQuestions,
          library: newLibrary,
          journal: p.journal.map((e) =>
            e.questionId === questionId
              ? { ...e, questionId: null, updatedAt: new Date().toISOString() }
              : e
          ),
          ...(p.studies
            ? {
                studies: p.studies.map((st) => ({
                  ...st,
                  linkedQuestions: st.linkedQuestions.filter((q) => q !== questionId),
                  hypotheses: st.hypotheses.map((h) =>
                    h.questionId === questionId ? { ...h, questionId: null } : h
                  ),
                })),
              }
            : {}),
        };
      });

      if (!removed) return;
      pushUndo({
        description: describeItem('question', removed.q),
        onUndo: () =>
          persistProject((p) => {
            const relink = new Map(relinkTargets.map((r) => [r.articleId, r.linkedQuestions]));
            const relinkQ = new Map(
              relinkQuestions.map((r) => [r.questionId, r.relatedQuestions]),
            );
            return {
              ...p,
              themes: p.themes.map((t) => {
                const restoredLinks = t.questions.map((q) =>
                  relinkQ.has(q.id) ? { ...q, relatedQuestions: relinkQ.get(q.id)! } : q
                );
                if (t.id !== themeId) return { ...t, questions: restoredLinks };
                const restored = [...restoredLinks];
                restored.splice(Math.min(index, restored.length), 0, removed);
                return { ...t, questions: restored };
              }),
              questions: removedUserData
                ? { ...p.questions, [questionId]: removedUserData }
                : p.questions,
              library: p.library.map((a) =>
                relink.has(a.id) ? { ...a, linkedQuestions: relink.get(a.id)! } : a
              ),
              journal: (() => {
                const restore = new Map(relinkEntries.map((r) => [r.entryId, r.updatedAt]));
                return p.journal.map((e) =>
                  restore.has(e.id)
                    ? { ...e, questionId, updatedAt: restore.get(e.id)! }
                    : e
                );
              })(),
              ...(p.studies
                ? {
                    studies: (() => {
                      const restore = new Map(relinkStudies.map((r) => [r.studyId, r]));
                      return p.studies.map((st) => {
                        const before = restore.get(st.id);
                        if (!before) return st;
                        const hIds = new Set(before.hypothesisIds);
                        return {
                          ...st,
                          linkedQuestions: before.linkedQuestions,
                          hypotheses: st.hypotheses.map((h) =>
                            hIds.has(h.id) ? { ...h, questionId } : h
                          ),
                        };
                      });
                    })(),
                  }
                : {}),
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

  // ── Question ↔ question links ──
  //
  // Symmetric: both questions carry the other's id, so either one can be read
  // without a reverse scan. Every mutation therefore has to touch both sides,
  // and both live somewhere in themes[].questions — hence the single pass that
  // maps each question to "the other id, if this is one of the pair".

  const relateQuestions = useCallback(
    (questionId: string, relatedQuestionId: string) => {
      if (questionId === relatedQuestionId) return;
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) => ({
          ...t,
          questions: t.questions.map((q) => {
            const otherId =
              q.id === questionId ? relatedQuestionId : q.id === relatedQuestionId ? questionId : null;
            if (!otherId) return q;
            const existing = q.relatedQuestions ?? [];
            if (existing.includes(otherId)) return q;
            return { ...q, relatedQuestions: [...existing, otherId] };
          }),
        })),
      }));
    },
    [persistProject]
  );

  const unrelateQuestions = useCallback(
    (questionId: string, relatedQuestionId: string) => {
      persistProject((p) => ({
        ...p,
        themes: p.themes.map((t) => ({
          ...t,
          questions: t.questions.map((q) => {
            const otherId =
              q.id === questionId ? relatedQuestionId : q.id === relatedQuestionId ? questionId : null;
            if (!otherId || !q.relatedQuestions?.includes(otherId)) return q;
            const kept = q.relatedQuestions.filter((id) => id !== otherId);
            if (kept.length > 0) return { ...q, relatedQuestions: kept };
            // Absent, never [] — the relational round-trip is byte-compared,
            // and the recomposer omits the field when a question has no links.
            const stripped = { ...q };
            delete stripped.relatedQuestions;
            return stripped;
          }),
        })),
      }));
    },
    [persistProject]
  );

  // ── Studies ───────────────────────────────────────────────────────────────
  //
  // `studies` is absent rather than [] on a project that has none, so every
  // write goes through withStudies, which reads `?? []` and strips the field
  // back off when the last study goes. Keeps the relational round-trip
  // byte-comparable with blobs written before studies existed.

  const studies = useMemo(() => activeProject.studies ?? [], [activeProject]);

  const withStudies = useCallback(
    (project: Project, next: Study[]): Project => {
      if (next.length > 0) return { ...project, studies: next };
      const stripped = { ...project };
      delete stripped.studies;
      return stripped;
    },
    []
  );

  /** Replaces one study in place; a no-op when the id is unknown. */
  const persistStudy = useCallback(
    (studyId: string, updater: (study: Study) => Study) => {
      persistProject((p) => {
        const current = p.studies ?? [];
        if (!current.some((st) => st.id === studyId)) return p;
        return withStudies(
          p,
          current.map((st) =>
            st.id === studyId ? { ...updater(st), updatedAt: new Date().toISOString() } : st
          )
        );
      });
    },
    [persistProject, withStudies]
  );

  const getStudy = useCallback(
    (studyId: string): Study | undefined => studies.find((st) => st.id === studyId),
    [studies]
  );

  const addStudy = useCallback(
    (input: { title: string; description?: string; design?: string; status?: StudyStatus }): string => {
      const now = new Date().toISOString();
      const study: Study = {
        id: createId(),
        title: input.title,
        status: input.status ?? 'planned',
        description: input.description ?? '',
        design: input.design ?? '',
        linkedQuestions: [],
        hypotheses: [],
        decisions: [],
        createdAt: now,
        updatedAt: now,
      };
      persistProject((p) => withStudies(p, [...(p.studies ?? []), study]));
      return study.id;
    },
    [persistProject, withStudies]
  );

  const updateStudy = useCallback(
    (
      studyId: string,
      patch: Partial<Pick<Study, 'title' | 'description' | 'design' | 'status'>>
    ) => {
      persistStudy(studyId, (st) => ({ ...st, ...patch }));
    },
    [persistStudy]
  );

  const deleteStudy = useCallback(
    (studyId: string) => {
      const current = snapshotProject()?.studies ?? [];
      const index = current.findIndex((st) => st.id === studyId);
      const removed = index >= 0 ? current[index] : null;

      persistProject((p) =>
        withStudies(p, (p.studies ?? []).filter((st) => st.id !== studyId))
      );

      if (!removed) return;
      // The study takes its hypotheses and decisions with it, so undo has to
      // restore the whole object, not just the row.
      pushUndo({
        description: describeItem('study', removed.title),
        onUndo: () =>
          persistProject((p) => {
            const restored = [...(p.studies ?? [])];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return withStudies(p, restored);
          }),
      });
    },
    [persistProject, withStudies, snapshotProject, pushUndo]
  );

  const linkStudyQuestion = useCallback(
    (studyId: string, questionId: string) => {
      persistStudy(studyId, (st) =>
        st.linkedQuestions.includes(questionId)
          ? st
          : { ...st, linkedQuestions: [...st.linkedQuestions, questionId] }
      );
    },
    [persistStudy]
  );

  const unlinkStudyQuestion = useCallback(
    (studyId: string, questionId: string) => {
      persistStudy(studyId, (st) => ({
        ...st,
        linkedQuestions: st.linkedQuestions.filter((id) => id !== questionId),
      }));
    },
    [persistStudy]
  );

  // ── Hypotheses ────────────────────────────────────────────────────────────

  const addHypothesis = useCallback(
    (
      studyId: string,
      input: { statement: string; label?: string | null; questionId?: string | null }
    ): string => {
      const now = new Date().toISOString();
      const hypothesis: Hypothesis = {
        id: createId(),
        label: input.label ?? null,
        statement: input.statement,
        status: 'active',
        supersededBy: null,
        questionId: input.questionId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      persistStudy(studyId, (st) => ({ ...st, hypotheses: [...st.hypotheses, hypothesis] }));
      return hypothesis.id;
    },
    [persistStudy]
  );

  const updateHypothesis = useCallback(
    (
      studyId: string,
      hypothesisId: string,
      patch: Partial<Pick<Hypothesis, 'statement' | 'label' | 'status' | 'questionId'>>
    ) => {
      persistStudy(studyId, (st) => ({
        ...st,
        hypotheses: st.hypotheses.map((h) =>
          h.id === hypothesisId ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h
        ),
      }));
    },
    [persistStudy]
  );

  /**
   * Replaces a hypothesis with a revised one and records why, in one write.
   *
   * Deliberately atomic rather than "add then mark the old one": a two-step
   * supersede that gets interrupted leaves two active rows and no chain, which
   * is the realistic failure mode, not an edge case. Returns the new id.
   */
  const supersedeHypothesis = useCallback(
    (studyId: string, hypothesisId: string, newStatement: string, rationale?: string): string => {
      const now = new Date().toISOString();
      const newId = createId();

      persistStudy(studyId, (st) => {
        const previous = st.hypotheses.find((h) => h.id === hypothesisId);
        if (!previous) return st;

        const replacement: Hypothesis = {
          id: newId,
          // Carries the label and question forward — the claim was revised,
          // not renumbered or refiled.
          label: previous.label,
          statement: newStatement,
          status: 'active',
          supersededBy: null,
          questionId: previous.questionId,
          createdAt: now,
          updatedAt: now,
        };

        // The rationale becomes a settled decision pointing at the NEW
        // hypothesis, which is what makes the chain self-documenting.
        const decisions = rationale
          ? [
              ...st.decisions,
              {
                id: createId(),
                decision: `Revised ${previous.label ?? 'hypothesis'}: ${newStatement}`,
                alternativesRejected: previous.statement,
                rationale,
                status: 'settled' as const,
                supersededBy: null,
                hypothesisId: newId,
                createdAt: now,
                updatedAt: now,
              },
            ]
          : st.decisions;

        return {
          ...st,
          hypotheses: [
            ...st.hypotheses.map((h) =>
              h.id === hypothesisId
                ? { ...h, status: 'superseded' as const, supersededBy: newId, updatedAt: now }
                : h
            ),
            replacement,
          ],
          decisions,
        };
      });

      return newId;
    },
    [persistStudy]
  );

  const deleteHypothesis = useCallback(
    (studyId: string, hypothesisId: string) => {
      const study = (snapshotProject()?.studies ?? []).find((st) => st.id === studyId);
      const index = study?.hypotheses.findIndex((h) => h.id === hypothesisId) ?? -1;
      const removed = index >= 0 ? study!.hypotheses[index] : null;

      // Dangling pointers at a deleted row would render as a broken chain, so
      // they are cleared here the way ON DELETE SET NULL clears them in Postgres.
      persistStudy(studyId, (st) =>
        clearReferencesTo(
          { ...st, hypotheses: st.hypotheses.filter((h) => h.id !== hypothesisId) },
          hypothesisId
        )
      );

      if (!removed) return;
      pushUndo({
        description: describeItem('hypothesis', removed.statement),
        onUndo: () =>
          persistStudy(studyId, (st) => {
            const restored = [...st.hypotheses];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return { ...st, hypotheses: restored };
          }),
      });
    },
    [persistStudy, snapshotProject, pushUndo]
  );

  // ── Decisions ─────────────────────────────────────────────────────────────

  const addDecision = useCallback(
    (
      studyId: string,
      input: {
        decision: string;
        rationale?: string | null;
        alternativesRejected?: string | null;
        status?: DecisionStatus;
        hypothesisId?: string | null;
      }
    ): string => {
      const now = new Date().toISOString();
      const decision: Decision = {
        id: createId(),
        decision: input.decision,
        alternativesRejected: input.alternativesRejected ?? null,
        rationale: input.rationale ?? null,
        status: input.status ?? 'open',
        supersededBy: null,
        hypothesisId: input.hypothesisId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      persistStudy(studyId, (st) => ({ ...st, decisions: [...st.decisions, decision] }));
      return decision.id;
    },
    [persistStudy]
  );

  const updateDecision = useCallback(
    (
      studyId: string,
      decisionId: string,
      patch: Partial<
        Pick<Decision, 'decision' | 'rationale' | 'alternativesRejected' | 'status' | 'hypothesisId'>
      >
    ) => {
      persistStudy(studyId, (st) => ({
        ...st,
        decisions: st.decisions.map((d) =>
          d.id === decisionId ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d
        ),
      }));
    },
    [persistStudy]
  );

  /** See supersedeHypothesis — same atomicity argument. Returns the new id. */
  const supersedeDecision = useCallback(
    (
      studyId: string,
      decisionId: string,
      newDecision: string,
      rationale?: string,
      alternativesRejected?: string
    ): string => {
      const now = new Date().toISOString();
      const newId = createId();

      persistStudy(studyId, (st) => {
        const previous = st.decisions.find((d) => d.id === decisionId);
        if (!previous) return st;

        const replacement: Decision = {
          id: newId,
          decision: newDecision,
          alternativesRejected: alternativesRejected ?? previous.decision,
          rationale: rationale ?? null,
          status: 'settled',
          supersededBy: null,
          hypothesisId: previous.hypothesisId,
          createdAt: now,
          updatedAt: now,
        };

        return {
          ...st,
          decisions: [
            ...st.decisions.map((d) =>
              d.id === decisionId
                ? { ...d, status: 'superseded' as const, supersededBy: newId, updatedAt: now }
                : d
            ),
            replacement,
          ],
        };
      });

      return newId;
    },
    [persistStudy]
  );

  const deleteDecision = useCallback(
    (studyId: string, decisionId: string) => {
      const study = (snapshotProject()?.studies ?? []).find((st) => st.id === studyId);
      const index = study?.decisions.findIndex((d) => d.id === decisionId) ?? -1;
      const removed = index >= 0 ? study!.decisions[index] : null;

      persistStudy(studyId, (st) =>
        clearReferencesTo(
          { ...st, decisions: st.decisions.filter((d) => d.id !== decisionId) },
          decisionId
        )
      );

      if (!removed) return;
      pushUndo({
        description: describeItem('decision', removed.decision),
        onUndo: () =>
          persistStudy(studyId, (st) => {
            const restored = [...st.decisions];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return { ...st, decisions: restored };
          }),
      });
    },
    [persistStudy, snapshotProject, pushUndo]
  );

  /**
   * Every decision still open — the "what haven't I settled yet" list.
   * Unscoped across the project when no study is given.
   */
  const getOpenDecisions = useCallback(
    (studyId?: string): { study: Study; decision: Decision }[] =>
      studies
        .filter((st) => !studyId || st.id === studyId)
        .flatMap((st) =>
          st.decisions.filter((d) => d.status === 'open').map((decision) => ({ study: st, decision }))
        ),
    [studies]
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
      const result = await pushRemoteData(newData, token);
      const success = result.status === 'ok';
      console.log('[import] Neon push result:', success ? 'SUCCESS' : `FAILED — ${result.reason}`);
      if (success) {
        setSyncStatus('saved');
        setBackendStatus('ok');
      } else {
        setSyncStatus('offline');
        setBackendStatus('unavailable');
        setBackendReason(result.reason);
      }
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
    restoreProject,
    visibleProjects,
    deletedProjects,
    // Theme/question helpers
    getAllQuestions,
    getQuestionById,
    getThemeById,
    // Theme CRUD
    addTheme,
    updateTheme,
    deleteTheme,
    restoreTheme,
    deletedThemes,
    // Question CRUD
    addQuestion,
    updateQuestion,
    deleteQuestion,
    relateQuestions,
    unrelateQuestions,
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
    // Studies
    studies,
    getStudy,
    addStudy,
    updateStudy,
    deleteStudy,
    linkStudyQuestion,
    unlinkStudyQuestion,
    addHypothesis,
    updateHypothesis,
    supersedeHypothesis,
    deleteHypothesis,
    addDecision,
    updateDecision,
    supersedeDecision,
    deleteDecision,
    getOpenDecisions,
    // Stats
    statusCounts,
    totalNotes,
    // Import
    importData,
    // Sync
    syncStatus,
    backendStatus,
    backendReason,
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
