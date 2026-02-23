import type { AppUserData } from '../types';

export const STORAGE_KEY = 'chaoslimba-research-journal';
export const DRAFT_PREFIX = 'chaoslimba-draft-';

export function createDefaultUserData(): AppUserData {
  return {
    version: 1,
    questions: {},
    journal: [],
    lastModified: new Date().toISOString(),
  };
}

export function loadUserData(): AppUserData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultUserData();
    const data = JSON.parse(raw) as AppUserData;
    if (data.version !== 1) return createDefaultUserData();
    return data;
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
    const data = JSON.parse(json) as AppUserData;
    if (data.version !== 1 || !data.questions || !Array.isArray(data.journal)) {
      return null;
    }
    return data;
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
