// Apply ONE migration file, all statements in a single transaction.
//
// Why not `drizzle-kit migrate`: prod's drizzle.__drizzle_migrations tracks
// only the first five migrations — the rest were applied by hand — so migrate
// would try to re-run 0005 onward and fail. This runs exactly the file named,
// split on drizzle's statement breakpoints. Either every statement lands or
// none does.
//
//     npx tsx --env-file=.env scripts/apply-migration.mts drizzle/migrations/0017_add_excerpt_provenance.sql

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const file = process.argv[2];
if (!file) {
  console.error('Usage: scripts/apply-migration.mts <migration.sql>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  // Drop comment lines, keep the SQL.
  .map((chunk) => chunk.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim())
  .filter(Boolean);

const sql = neon(process.env.DATABASE_URL);
console.log(`${file}: ${statements.length} statement(s)`);
for (const s of statements) console.log(`  ${s.replace(/\s+/g, ' ').slice(0, 110)}`);

try {
  await sql.transaction(statements.map((s) => sql.query(s)));
  console.log('Applied.');
} catch (e) {
  console.error(`Not applied — rolled back: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
