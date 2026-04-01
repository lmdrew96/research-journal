import type { AppUserData, Project } from '../types';
import { seedThemes } from '../data/research-themes';
import { createId } from './ids';

export const STORAGE_KEY = 'research-journal-data';
export const DRAFT_PREFIX = 'rj-draft-';

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
