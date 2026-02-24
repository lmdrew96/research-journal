import type { AppUserData } from '../types';
import { seedThemes } from '../data/research-themes';

export const STORAGE_KEY = 'research-journal-data';
export const DRAFT_PREFIX = 'rj-draft-';

const OLD_STORAGE_KEY = 'chaoslimba-research-journal';
const OLD_DRAFT_PREFIX = 'chaoslimba-draft-';

export function createDefaultUserData(): AppUserData {
  return {
    version: 3,
    themes: seedThemes,
    questions: {},
    journal: [],
    library: [],
    lastModified: new Date().toISOString(),
  };
}

function migrateData(data: Record<string, unknown>): AppUserData {
  let result = data as unknown as AppUserData;

  // v1 → v2: add library array
  if (result.version === 1 || !Array.isArray(result.library)) {
    result = {
      ...result,
      version: 2 as 1 | 2 | 3,
      library: [],
    };
  }

  // v2 → v3: add themes from seed data
  if (result.version < 3 || !Array.isArray(result.themes)) {
    result = {
      ...result,
      version: 3,
      themes: seedThemes,
    };
  }

  return result;
}

export function loadUserData(): AppUserData {
  try {
    // Try new key first, fall back to old key
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) {
        // Migrate: write to new key, remove old key
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(OLD_STORAGE_KEY);
        // Also migrate draft keys
        migrateDraftKeys();
      }
    }
    if (!raw) return createDefaultUserData();
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.version || !data.questions) return createDefaultUserData();
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
    if (!data.version || !data.questions || !Array.isArray(data.journal)) {
      return null;
    }
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
