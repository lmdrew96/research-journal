import type { AppUserData } from '../types';

export const STORAGE_KEY = 'chaoslimba-research-journal';
export const DRAFT_PREFIX = 'chaoslimba-draft-';

export function createDefaultUserData(): AppUserData {
  return {
    version: 2,
    questions: {},
    journal: [],
    library: [],
    lastModified: new Date().toISOString(),
  };
}

function migrateData(data: Record<string, unknown>): AppUserData {
  // v1 → v2: add library array
  if (data.version === 1 || !Array.isArray(data.library)) {
    return {
      version: 2,
      questions: (data.questions as AppUserData['questions']) || {},
      journal: (data.journal as AppUserData['journal']) || [],
      library: [],
      lastModified: (data.lastModified as string) || new Date().toISOString(),
    };
  }
  return data as unknown as AppUserData;
}

export function loadUserData(): AppUserData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultUserData();
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.version || !data.questions) return createDefaultUserData();
    return migrateData(data);
  } catch {
    return createDefaultUserData();
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
