import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { AppUserData, Project } from './types.js';

// Determine data source: prefer DATABASE_URL (Neon), fall back to JOURNAL_DATA_PATH (local JSON)
const databaseUrl = process.env.DATABASE_URL;
const clerkUserId = process.env.CLERK_USER_ID;
const filePath = process.env.JOURNAL_DATA_PATH;

/**
 * If JOURNAL_DATA_PATH points to a directory, find the most recently modified
 * file matching research-journal-backup*.json in that directory.
 * If it points to a file, return it as-is.
 */
function resolveFilePath(): string {
  if (!filePath) throw new Error('JOURNAL_DATA_PATH is not set');
  const stat = statSync(filePath);
  if (!stat.isDirectory()) return filePath;

  const entries = readdirSync(filePath)
    .filter(name => /^research-journal-backup.*\.json$/.test(name))
    .map(name => {
      const full = join(filePath, name);
      return { full, mtimeMs: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (entries.length === 0) {
    throw new Error(`No research-journal-backup*.json files found in directory: ${filePath}`);
  }

  return entries[0].full;
}

if (!databaseUrl && !filePath) {
  console.error(
    'Error: Set either DATABASE_URL + CLERK_USER_ID (for Neon Postgres) or JOURNAL_DATA_PATH (for a local JSON file).'
  );
  process.exit(1);
}

if (databaseUrl && !clerkUserId) {
  console.error(
    'Error: CLERK_USER_ID must be set when using DATABASE_URL. ' +
    'Find your Clerk user ID in the Clerk dashboard (looks like user_xxxxx).'
  );
  process.exit(1);
}

const mode = databaseUrl ? 'neon' : 'file';

// ── Neon (Postgres) ──

async function readFromNeon(): Promise<AppUserData> {
  const sql = neon(databaseUrl!);
  const rows = await sql`SELECT data FROM app_data WHERE user_id = ${clerkUserId!}`;
  if (rows.length === 0) {
    throw new Error(
      `No data found in Neon for user_id "${clerkUserId}". ` +
      'Make sure the app has synced at least once for this user.'
    );
  }
  return rows[0].data as AppUserData;
}

async function writeToNeon(data: AppUserData): Promise<void> {
  const sql = neon(databaseUrl!);
  await sql`
    INSERT INTO app_data (user_id, data, updated_at)
    VALUES (${clerkUserId!}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE
    SET data = ${JSON.stringify(data)}::jsonb, updated_at = now()
  `;
}

// ── Local JSON file ──

async function readFromFile(): Promise<AppUserData> {
  const resolved = resolveFilePath();
  const raw = readFileSync(resolved, 'utf-8');
  return JSON.parse(raw) as AppUserData;
}

async function writeToFile(data: AppUserData): Promise<void> {
  const resolved = resolveFilePath();
  writeFileSync(resolved, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Migration ──

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

// ── Public API ──

export async function readData(): Promise<AppUserData> {
  const raw = mode === 'neon' ? await readFromNeon() : await readFromFile();
  return migrateToV4(raw);
}

export async function writeData(data: AppUserData): Promise<void> {
  data.lastModified = new Date().toISOString();
  return mode === 'neon' ? writeToNeon(data) : writeToFile(data);
}

/**
 * Returns a reference to the currently active project inside AppUserData.
 * Mutations made through the returned object are reflected in the parent data
 * structure, so the caller can pass the original data to writeData().
 */
export function getActiveProject(data: AppUserData): Project {
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error(
      'No projects in app data. Open the app and create a project via Manage Projects, then retry.'
    );
  }
  const project =
    data.projects.find((p) => p.id === data.activeProjectId) ?? data.projects[0];
  return project;
}
