import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import type { AppUserData } from './types.js';

// Determine data source: prefer DATABASE_URL (Neon), fall back to JOURNAL_DATA_PATH (local JSON)
const databaseUrl = process.env.DATABASE_URL;
const filePath = process.env.JOURNAL_DATA_PATH;

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
  const raw = readFileSync(filePath!, 'utf-8');
  return JSON.parse(raw) as AppUserData;
}

async function writeToFile(data: AppUserData): Promise<void> {
  writeFileSync(filePath!, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Public API ──

export async function readData(): Promise<AppUserData> {
  return mode === 'neon' ? readFromNeon() : readFromFile();
}

export async function writeData(data: AppUserData): Promise<void> {
  data.lastModified = new Date().toISOString();
  return mode === 'neon' ? writeToNeon(data) : writeToFile(data);
}