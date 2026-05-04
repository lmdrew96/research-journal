// Time the decomposer end-to-end against a real user's blob.
// Usage: node --experimental-strip-types scripts/test-decomposer.mts
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { buildDecomposeQueries } from '../api/_decomposer.ts';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const [k, ...rest] = line.split('=');
    if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim();
  }
} catch {
  /* ok */
}

const sql = neon(process.env.DATABASE_URL!);
const TARGET_USER = 'user_3CaPJ1PKr1StrfxH7pjcbXz1phL';

const blobRows = await sql`SELECT data FROM app_data WHERE user_id = ${TARGET_USER}`;
if (!blobRows[0]) {
  console.error('No blob for', TARGET_USER);
  process.exit(1);
}
const blob = blobRows[0].data;

const t0 = Date.now();
const queries = buildDecomposeQueries(sql, TARGET_USER, blob);
const tBuild = Date.now() - t0;
console.log(`Built ${queries.length} queries in ${tBuild}ms`);

const t1 = Date.now();
// @ts-expect-error neon-http transaction signature
await sql.transaction(queries);
const tExec = Date.now() - t1;
console.log(`Executed transaction in ${tExec}ms`);

// Verify counts
const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM projects WHERE user_id = ${TARGET_USER}) AS projects,
    (SELECT count(*)::int FROM themes t JOIN projects p ON t.project_id=p.id WHERE p.user_id = ${TARGET_USER}) AS themes,
    (SELECT count(*)::int FROM questions q JOIN themes t ON q.theme_id=t.id JOIN projects p ON t.project_id=p.id WHERE p.user_id = ${TARGET_USER}) AS questions,
    (SELECT count(*)::int FROM library_articles la JOIN projects p ON la.project_id=p.id WHERE p.user_id = ${TARGET_USER}) AS articles,
    (SELECT count(*)::int FROM article_question_links l JOIN library_articles la ON l.article_id=la.id JOIN projects p ON la.project_id=p.id WHERE p.user_id = ${TARGET_USER}) AS qLinks,
    (SELECT count(*)::int FROM tags WHERE user_id = ${TARGET_USER}) AS tags,
    (SELECT count(*)::int FROM article_tags at JOIN tags tg ON at.tag_id=tg.id WHERE tg.user_id = ${TARGET_USER}) AS articleTags
`;
console.log('Post-decompose counts:', counts[0]);
console.log(`\nTotal: ${tBuild + tExec}ms`);
