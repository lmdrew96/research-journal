import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import type { AppUserData, Project, ResearchTheme } from '../../src/types/index.js';
import { buildDecomposeQueries } from '../_decomposer.js';

// Cap how long any Neon read/write can hang. Cold starts can take a few
// seconds; anything past this is almost certainly a network stall.
const NEON_TIMEOUT_MS = 15_000;

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${ms}ms. ` +
              'Neon may be experiencing a cold start or network issue — retry in a few seconds.',
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Normalize v1–v3 data to v4 shape in memory. Does not write back — avoids
// dual-writer races with the app, which runs its own migration on load.
// Skips seeding default themes (that's the app's job); leaves themes empty
// if the legacy data didn't have any.
function migrateToV4(data: AppUserData): AppUserData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if ((d.version ?? 0) >= 4 && Array.isArray(d.projects)) return data;

  const project: Project = {
    id: randomUUID(),
    name: 'My Research',
    description: '',
    icon: 'brain',
    color: '#7B61FF',
    createdAt: new Date().toISOString(),
    themes: Array.isArray(d.themes) ? d.themes : [],
    questions: d.questions && typeof d.questions === 'object' ? d.questions : {},
    journal: Array.isArray(d.journal) ? d.journal : [],
    library: Array.isArray(d.library) ? d.library : [],
  };

  return {
    version: 4,
    projects: [project],
    activeProjectId: project.id,
    lastModified: d.lastModified ?? new Date().toISOString(),
  };
}

export async function readData(userId: string): Promise<AppUserData> {
  const sql = getDb();
  const rows = await withTimeout(
    sql`SELECT data FROM app_data WHERE user_id = ${userId}`,
    NEON_TIMEOUT_MS,
    'Neon read',
  );
  if (rows.length === 0) {
    throw new Error(
      `No data found in Neon for user_id "${userId}". ` +
        'Open the app and let it sync at least once, then retry.',
    );
  }
  return migrateToV4(rows[0].data as AppUserData);
}

export async function writeData(userId: string, data: AppUserData): Promise<void> {
  const sql = getDb();
  data.lastModified = new Date().toISOString();
  const payload = JSON.stringify(data);
  await withTimeout(
    sql`
      INSERT INTO app_data (user_id, data, updated_at)
      VALUES (${userId}, ${payload}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
      SET data = ${payload}::jsonb, updated_at = now()
    `,
    NEON_TIMEOUT_MS,
    'Neon write',
  );

  // Dual-write: decompose the blob into the relational tables, which have been
  // the app's primary read source since Phase 4. Mirrors api/data.ts PUT.
  //
  // Without this an MCP write only surfaces because GET's newer-wins guard
  // notices the blob is newer and serves it — correct, but it means every MCP
  // write is riding the fallback rather than the main path. Writing both keeps
  // lastModified equal across the two stores, so newer-wins stops firing.
  //
  // Fail-soft, deliberately: the blob write above already succeeded and is now
  // newer, so newer-wins still covers the caller if the decompose throws. A
  // hard failure here would turn a fully-recoverable state into a failed tool
  // call.
  try {
    const started = Date.now();
    const queries = buildDecomposeQueries(sql, userId, data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withTimeout((sql as any).transaction(queries), NEON_TIMEOUT_MS, 'Neon decompose');
    console.log(
      '[mcp/store] Relational decompose successful.',
      'queries:', queries.length,
      'ms:', Date.now() - started,
    );
  } catch (decomposeErr) {
    console.error('[mcp/store] Decompose failed (non-fatal, blob is newer):', decomposeErr);
  }
}

/**
 * Themes that have not been soft-deleted.
 *
 * Soft-deleted themes stay in `project.themes` with their subtree intact so
 * the app can restore them, which means every MCP read has to filter. Writes
 * still operate on `project.themes` directly — mutations must reach the array
 * that gets persisted.
 */
export function liveThemes(project: Project): ResearchTheme[] {
  return project.themes.filter((t) => !t.deletedAt);
}

/** Projects that have not been soft-deleted. */
export function liveProjects(data: AppUserData): Project[] {
  return (Array.isArray(data.projects) ? data.projects : []).filter((p) => !p.deletedAt);
}

/**
 * Returns a reference to the currently active project, or null if the user
 * has no projects yet. Intended for read-only tools that can return empty
 * results gracefully without forcing the caller to handle a thrown error.
 *
 * Never resolves to a soft-deleted project unless every project is deleted.
 */
export function getActiveProjectOrNull(data: AppUserData): Project | null {
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    return null;
  }
  const live = liveProjects(data);
  return (
    live.find((p) => p.id === data.activeProjectId) ??
    live[0] ??
    data.projects.find((p) => p.id === data.activeProjectId) ??
    data.projects[0]
  );
}

/**
 * Returns a reference to the currently active project inside AppUserData.
 * Mutations made through the returned object are reflected in the parent data
 * structure, so the caller can pass the original data to writeData().
 *
 * Throws when the user has no projects yet — use getActiveProjectOrNull for
 * read-only tools that should return empty instead.
 */
export function getActiveProject(data: AppUserData): Project {
  const project = getActiveProjectOrNull(data);
  if (!project) {
    throw new Error(
      'No projects yet in this account. Open the app and create a project via Manage Projects, then retry this write.',
    );
  }
  return project;
}

/** Per-request identity for the MCP tool handlers. */
export interface McpContext {
  userId: string;
}
