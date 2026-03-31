import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import type { AppUserData } from './types.js';

// Determine data source: prefer DATABASE_URL (Neon), fall back to JOURNAL_DATA_PATH (local JSON)
const databaseUrl = process.env.DATABASE_URL;
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
    'Error: Set either DATABASE_URL (for Neon Postgres) or JOURNAL_DATA_PATH (for a local JSON file).'
  );
  process.exit(1);
}

const mode = databaseUrl ? 'neon' : 'file';

// ── Neon (Postgres) ──

async function readFromNeon(): Promise<AppUserData> {
  const sql = neon(databaseUrl!);
  const rows = await sql`SELECT data FROM app_data WHERE id = 'main'`;
  if (rows.length === 0) {
    throw new Error('No data found in Neon database. Make sure the app has synced at least once.');
  }
  return rows[0].data as AppUserData;
}

async function writeToNeon(data: AppUserData): Promise<void> {
  const sql = neon(databaseUrl!);
  await sql`
    INSERT INTO app_data (id, data, updated_at)
    VALUES ('main', ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
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

// ── Public API ──

export async function readData(): Promise<AppUserData> {
  return mode === 'neon' ? readFromNeon() : readFromFile();
}

export async function writeData(data: AppUserData): Promise<void> {
  data.lastModified = new Date().toISOString();
  return mode === 'neon' ? writeToNeon(data) : writeToFile(data);
}