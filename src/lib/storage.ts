import type { AppUserData, Project } from '../types';
import { seedThemes } from '../data/research-themes';
import { createId } from './ids';

export const STORAGE_KEY = 'research-journal-data';
export const DRAFT_PREFIX = 'rj-draft-';

// Records which Clerk user the cached blob above was written under, so a second
// account on a shared device is never rendered someone else's research data.
export const CACHE_OWNER_KEY = 'threadnotes-cache-owner';

// Must match the runtimeCaching cacheName in vite.config.ts.
export const DATA_CACHE_NAME = 'threadnotes-data';

const OLD_STORAGE_KEY = 'chaoslimba-research-journal';
const OLD_DRAFT_PREFIX = 'chaoslimba-draft-';

function createDefaultProject(): Project {
  return {
    id: createId(),
    name: 'My Research',
    description: '',
    icon: 'brain',
    color: '#7B61FF',
    createdAt: new Date().toISOString(),
    themes: seedThemes,
    questions: {},
    journal: [],
    library: [],
  };
}

export function createDefaultUserData(): AppUserData {
  const project = createDefaultProject();
  return {
    version: 4,
    projects: [project],
    activeProjectId: project.id,
    lastModified: new Date().toISOString(),
  };
}

export function migrateData(data: Record<string, unknown>): AppUserData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = data as any;

  // v4 data stores everything inside projects[] — no top-level library/themes/questions.
  // The v1→v2 and v2→v3 checks below use `!Array.isArray(result.library)` and
  // `!Array.isArray(result.themes)` as secondary guards, which are ALWAYS true for v4 data
  // (those fields live inside projects, not at the top level). Without this early return,
  // every page load would re-run all migrations and wipe articles/questions by replacing
  // the correct projects[] with a new empty project.
  if (result.version >= 4 && Array.isArray(result.projects)) {
    return result as AppUserData;
  }

  // v1 → v2: add library array
  if (result.version === 1 || !Array.isArray(result.library)) {
    result = { ...result, version: 2, library: [] };
  }

  // v2 → v3: add themes from seed data
  if (result.version < 3 || !Array.isArray(result.themes)) {
    result = { ...result, version: 3, themes: seedThemes };
  }

  // v3 → v4: wrap flat data into a Project
  if (result.version < 4 || !Array.isArray(result.projects)) {
    const project: Project = {
      id: createId(),
      name: 'My Research',
      description: '',
      icon: 'brain',
      color: '#7B61FF',
      createdAt: new Date().toISOString(),
      themes: result.themes || seedThemes,
      questions: result.questions || {},
      journal: result.journal || [],
      library: result.library || [],
    };
    result = {
      version: 4,
      projects: [project],
      activeProjectId: project.id,
      lastModified: result.lastModified || new Date().toISOString(),
    };
  }

  return result as AppUserData;
}

export function loadUserData(): AppUserData {
  try {
    // Try new key first, fall back to old key
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(OLD_STORAGE_KEY);
        migrateDraftKeys();
      }
    }
    if (!raw) return createDefaultUserData();
    const data = JSON.parse(raw) as Record<string, unknown>;
    // Support both old format (has questions at top level) and new (has projects)
    if (!data.version) return createDefaultUserData();
    return migrateData(data);
  } catch {
    return createDefaultUserData();
  }
}

function migrateDraftKeys(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(OLD_DRAFT_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (val) {
      const newKey = DRAFT_PREFIX + key.slice(OLD_DRAFT_PREFIX.length);
      localStorage.setItem(newKey, val);
    }
    localStorage.removeItem(key);
  }
}

export function saveUserData(data: AppUserData): void {
  data.lastModified = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportAsJson(data: AppUserData): string {
  return JSON.stringify(data, null, 2);
}

export function importFromJson(json: string): AppUserData | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (!data.version) return null;
    // Accept both v1-3 (has questions at top level) and v4 (has projects)
    const hasOldFormat = data.questions && Array.isArray(data.journal);
    const hasNewFormat = Array.isArray(data.projects);
    if (!hasOldFormat && !hasNewFormat) return null;
    return migrateData(data);
  } catch {
    return null;
  }
}

// Draft persistence for unsaved notes
export function saveDraft(questionId: string, content: string): void {
  localStorage.setItem(DRAFT_PREFIX + questionId, content);
}

export function loadDraft(questionId: string): string | null {
  return localStorage.getItem(DRAFT_PREFIX + questionId);
}

export function clearDraft(questionId: string): void {
  localStorage.removeItem(DRAFT_PREFIX + questionId);
}

// ── Session teardown / cache ownership ────────────────────────────────────────
//
// Both caches this app keeps — the localStorage blob and the service worker's
// 'threadnotes-data' Cache Storage entry — are keyed without the user. On a
// shared device that means a second account can be served the first account's
// research data, which is why the cached blob now records an owner.

/** Remove every localStorage key holding user content. Synchronous. */
export function clearLocalUserData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.removeItem(CACHE_OWNER_KEY);

    const draftKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX) || key?.startsWith(OLD_DRAFT_PREFIX)) {
        draftKeys.push(key);
      }
    }
    for (const key of draftKeys) localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode, disabled) — nothing cached to clear.
  }
}

/** Drop the service worker's cached /api/data response. */
export async function clearDataCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(DATA_CACHE_NAME);
  } catch {
    // Cache Storage unavailable — nothing to clear.
  }
}

/** Full teardown for sign-out: localStorage content plus the offline cache. */
export async function clearCachedUserData(): Promise<void> {
  clearLocalUserData();
  await clearDataCache();
}

export function getCacheOwner(): string | null {
  try {
    return localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

export function setCacheOwner(userId: string): void {
  try {
    localStorage.setItem(CACHE_OWNER_KEY, userId);
  } catch {
    // Storage unavailable — the mismatch check degrades to "no cache".
  }
}

/**
 * Load cached data, but only if it belongs to `userId`.
 *
 * A recorded owner that does not match the current Clerk user means the cache
 * was written by a different account on this device — discard it rather than
 * render it. This covers expired sessions too, which never run the sign-out
 * teardown.
 *
 * `ownerChanged` tells the caller it must also drop the service worker's
 * /api/data entry before fetching, or NetworkFirst can hand back the previous
 * user's response.
 *
 * An absent owner is treated as "this cache is mine" so that data written
 * before ownership tracking existed is not wiped on first load.
 */
export function loadUserDataForOwner(userId: string | null | undefined): {
  data: AppUserData;
  ownerChanged: boolean;
} {
  const owner = getCacheOwner();

  if (userId && owner && owner !== userId) {
    clearLocalUserData();
    setCacheOwner(userId);
    return { data: createDefaultUserData(), ownerChanged: true };
  }

  if (userId && !owner) setCacheOwner(userId);
  return { data: loadUserData(), ownerChanged: false };
}
