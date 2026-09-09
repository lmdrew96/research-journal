import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import type { AppUserData, Project, ResearchTheme } from '../../src/types/index.js';
import { buildDecomposeQueries } from '../_decomposer.js';
import { buildRecomposeQueries, assembleAppUserData } from '../_recomposer.js';
import { readBlob, writeBlob, REV_FORCE, type ExpectedRev } from '../_blob-store.js';

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

/**
 * The revision each in-flight blob was read at, keyed on the object handed to
 * the tool handler.
 *
 * Every write tool is shaped `readData -> mutate -> writeData(ctx.userId, data)`,
 * so tracking the baseline against the object identity lets writeData enforce
 * compare-and-swap without any of the 45 handlers changing. Entries are
 * collected with the request that made them.
 */
const revOfRead = new WeakMap<AppUserData, number>();

function parseTime(v: unknown): number {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export async function readData(userId: string): Promise<AppUserData> {
  const sql = getDb();
  // The blob is still read on every call, because it carries the revision the
  // concurrency guard needs — and because it is the fallback below.
  const snapshot = await withTimeout(readBlob(sql, userId), NEON_TIMEOUT_MS, 'Neon read');
  if (!snapshot) {
    throw new Error(
      `No data found in Neon for user_id "${userId}". ` +
        'Open the app and let it sync at least once, then retry.',
    );
  }

  // Read what the app reads. The relational tables are the source of truth; the
  // blob is served only for rows they genuinely cannot represent (pre-Phase-3
  // rows with no client_id, non-v4 data), which is exactly when
  // assembleAppUserData returns null. Before this the MCP read the blob
  // directly, so the two surfaces could disagree about what the data was.
  let relational: AppUserData | null = null;
  try {
    relational = assembleAppUserData(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await withTimeout((sql as any).transaction(buildRecomposeQueries(sql, userId)), NEON_TIMEOUT_MS, 'Neon recompose'),
    );
  } catch (err) {
    console.error('[mcp/store] Relational read failed (non-fatal, falling back to the blob):', err);
  }

  const blobIsNewer =
    !relational || parseTime(snapshot.data?.lastModified) > parseTime(relational.lastModified);
  if (blobIsNewer && relational) {
    // Should be unreachable: writes commit both stores in one transaction. If
    // it fires, something wrote the blob outside writeBlob. Prefer the blob
    // anyway — losing a write is worse than reading a slightly odd shape.
    console.error(
      '[mcp/store] INVARIANT VIOLATED: blob is newer than the relational copy (',
      snapshot.data?.lastModified, 'vs', relational.lastModified,
      '). Reading the blob. Run scripts/verify-relational.mts.',
    );
  }

  // migrateToV4 returns a new object for v1–v3 data, so key the revision on
  // what the caller actually receives — that is the object it hands back to
  // writeData, and the WeakMap is what makes the concurrency guard work
  // without any of the 45 tool handlers changing.
  const data = blobIsNewer ? migrateToV4(snapshot.data) : relational!;
  revOfRead.set(data, snapshot.rev);
  return data;
}

export async function writeData(userId: string, data: AppUserData): Promise<void> {
  const sql = getDb();
  data.lastModified = new Date().toISOString();

  // A blob that did not come from readData has no baseline to compare against
  // — nothing in the tool surface does that today, but forcing beats throwing
  // if some future caller builds one from scratch.
  const expected: ExpectedRev = revOfRead.get(data) ?? REV_FORCE;
  if (expected === REV_FORCE) {
    console.warn('[mcp/store] Writing without a base revision — no concurrency guard on this write.');
  }

  // The relational write rides in the same transaction as the blob write, so
  // an MCP tool either lands in both stores or neither. It used to decompose
  // separately and fail-soft, which could leave the blob ahead of the tables
  // the app actually reads.
  const decompose = await withTimeout(
    buildDecomposeQueries(sql, userId, data),
    NEON_TIMEOUT_MS,
    'Neon decompose read',
  );

  const result = await withTimeout(
    writeBlob(sql, userId, data, expected, decompose),
    NEON_TIMEOUT_MS,
    'Neon write',
  );

  if (!result.ok) {
    // Fail the tool call rather than overwrite. The handler already mutated its
    // own copy, so there is nothing here to replay onto the winning blob —
    // re-running the tool re-reads and re-applies cleanly.
    throw new Error(
      'This write was rejected because the data changed while the tool was running ' +
        `(read revision ${expected}, current revision ${result.current.rev}). ` +
        'Nothing was saved and nothing was lost — the other writer, usually the ' +
        'ThreadNotes app in an open tab, got there first. Re-run this tool to apply ' +
        'it on top of their change.',
    );
  }

  // Keep the baseline current so a handler that writes twice from the same
  // object (rare, but studies supersede does read-mutate-write in stages)
  // does not fail its own second write.
  revOfRead.set(data, result.rev);

  console.log('[mcp/store] Committed. rev:', result.rev, '| relational queries:', decompose.length);
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

/**
 * Trim, drop blanks, de-duplicate — matches how the app's tag inputs behave.
 * Shared because tag names are a uniqueness key in the relational `tags`
 * table; two tool modules normalizing differently would create near-duplicate
 * rows that look identical in the UI.
 */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Per-request identity for the MCP tool handlers. */
export interface McpContext {
  userId: string;
}
