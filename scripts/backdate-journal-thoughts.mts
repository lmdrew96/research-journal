// One-shot (Nae, 2026-11-01): give the six thoughts copied from the retired
// Journal (v0.74.0) the dates of the entries they came from.
//
// They were saved through journal_harvest_thoughts, which stamps the moment it
// saves, so all six read 2026-11-01T05:42:38.509Z. What I think so far orders
// threads by their newest item, and identical timestamps put the Journal's
// September work on top of October comments and left the threads tied.
//
// Only `createdAt` changes. Each date is copied from the stored journal entry
// the thought came from — the entries are kept as a backup — so the run also
// confirms the backup is intact. It goes through the MCP store's
// readData/writeData: the revision guard, and the blob and tables in one
// transaction. Re-running finds nothing left to do.
//
//     npx tsx --env-file=.env scripts/backdate-journal-thoughts.mts           # dry run
//     npx tsx --env-file=.env scripts/backdate-journal-thoughts.mts --apply   # write

import { neon } from '@neondatabase/serverless';
import { readData, writeData } from '../api/_mcp/store.ts';

const PROJECT_ID = 'ldz3ID0r3xGX'; // Linguistics

/** Thought id → the journal entry it was copied from. */
const SOURCES: Record<string, string> = {
  'dc71892b-4df6-4173-b294-acaa47e9aa9b': 'e30a2a44-a685-4a25-bad9-27b171e7768f', // power simulation
  'e4690793-1fda-41f9-a003-ba5379b53977': '139fc19a-5e1e-4a7d-b6da-bc796a80214e', // corpus and wordlist
  '63010fe1-a9b1-4348-a565-b4f573f851e6': '8b6ffea4-0b9c-4266-95ac-e87feefb8bcf', // literature gap
  'f2e738b5-aac0-4ab0-83c8-b31205fcc480': '9760c8ed-b56d-4ba6-ad87-cc59a5077c9f', // animacy
  '0bc2789d-141b-4fb1-9d5e-f317def5f065': 'a7b9e27b-5821-4b82-b2c3-f580c80f0389', // Roman shorthand
  '8f156ff7-1ae2-4a9b-b70e-e59036822556': '12a62f10-83d7-4088-a1e9-799c567df037', // wh-islands
};

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');

const owners = (await sql`SELECT user_id FROM projects WHERE client_id = ${PROJECT_ID}`) as Array<{ user_id: string }>;
if (owners.length !== 1) {
  console.error(`Expected one owner of project ${PROJECT_ID}, found ${owners.length}. Nothing written.`);
  process.exit(1);
}
const userId = owners[0].user_id;

const data = await readData(userId);
const project = data.projects.find((p) => p.id === PROJECT_ID);
if (!project) {
  console.error(`Project ${PROJECT_ID} not in the account's data. Nothing written.`);
  process.exit(1);
}

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${project.name}\n`);
let changes = 0;
let problems = 0;
for (const [thoughtId, entryId] of Object.entries(SOURCES)) {
  const thought = (project.thoughts ?? []).find((t) => t.id === thoughtId);
  const entry = project.journal.find((e) => e.id === entryId);
  if (!thought || !entry) {
    console.log(`  ${thoughtId.slice(0, 8)}: MISSING ${thought ? 'journal entry' : 'thought'} — skipped`);
    problems++;
    continue;
  }
  if (thought.createdAt === entry.createdAt) {
    console.log(`  ${thoughtId.slice(0, 8)}: already ${entry.createdAt}`);
    continue;
  }
  console.log(`  ${thoughtId.slice(0, 8)}: ${thought.createdAt} → ${entry.createdAt}`);
  thought.createdAt = entry.createdAt;
  changes++;
}

if (problems > 0) {
  console.log(`\n${problems} problem(s). Nothing written.`);
  process.exit(1);
}
if (changes === 0) {
  console.log('\nNothing to change.');
} else if (!apply) {
  console.log(`\n${changes} to change. Re-run with --apply to write.`);
} else {
  await writeData(userId, data);
  console.log(`\nWritten: ${changes} thought(s) backdated.`);
}
