// Build guard: the version in package.json must have a CHANGELOG.md entry.
//
// The changelog is written by hand, one line per version bump, so the only
// way it drifts is a bump without an entry. This makes that a red build
// instead of a silently stale "What's new" page.
//
// Usage: node --experimental-strip-types scripts/check-changelog.mts
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8');

if (!new RegExp(`^## v${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) {
  console.error(`✗ CHANGELOG.md has no "## v${version}" entry. Add one line saying what changed.`);
  process.exit(1);
}
console.log(`✓ CHANGELOG.md has an entry for v${version}`);
