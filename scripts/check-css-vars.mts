// Build guard for dead CSS custom-property references.
//
// A `var(--nope)` is not a CSS syntax error. The stylesheet parses, the build
// passes, and the declaration quietly evaporates at computed-value time —
// defined to behave as `unset`, so `color` falls back to inherit and
// everything else to its initial value. Nothing in the toolchain warns.
//
// That is how `.dashboard-stat-value { color: var(--text-primary) }` — a token
// that was never declared — shipped black-on-navy text to production and
// survived a dedicated WCAG audit.
//
// Usage:
//   node --experimental-strip-types scripts/check-css-vars.mts
//
// Exits non-zero on any undefined reference. Runs as part of `npm run build`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS_FILE = join(ROOT, 'src/index.css');
const SRC_DIR = join(ROOT, 'src');

interface Ref {
  name: string;
  file: string;
  line: number;
}

/**
 * Blank out /* *\/ comments while preserving byte offsets and newlines, so
 * line numbers stay accurate and a token mentioned only in prose is not
 * mistaken for a real reference. (The previous one-off grep reported
 * --status-x purely because it appeared inside an explanatory comment.)
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
}

/**
 * Same idea for TS/TSX, plus line comments. The `(^|[^:])` guard keeps
 * `https://` inside a string literal from being eaten as a comment — crude,
 * but this text is only ever scanned for var() and hex-concat patterns, so a
 * mangled URL costs nothing.
 */
function stripTsComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) =>
      lead + ' '.repeat(m.length - lead.length),
    );
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// ── Collect declarations ────────────────────────────────────────────────────

const rawCss = readFileSync(CSS_FILE, 'utf8');
const css = stripComments(rawCss);

// `--name` followed by a colon is a declaration. Inside a var() the token is
// always followed by `,` or `)`, never `:`, so requiring the colon is enough
// to keep references out of this set.
const declared = new Set<string>();
for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);

// Custom properties set inline from React (style={{ '--x': ... }}) are
// declared at runtime and will never appear in the stylesheet. Rather than a
// hand-maintained allow-list — which had already gone stale once — derive them
// from the source, so adding a new inline token needs no registration here.
const tsFiles = walk(SRC_DIR);
const tsSources = new Map<string, string>();
for (const file of tsFiles) {
  tsSources.set(relative(ROOT, file), stripTsComments(readFileSync(file, 'utf8')));
}

const inlineDeclared = new Map<string, string>();
for (const [file, text] of tsSources) {
  for (const m of text.matchAll(/['"`](--[\w-]+)['"`]\s*:/g)) {
    if (!inlineDeclared.has(m[1])) inlineDeclared.set(m[1], file);
    declared.add(m[1]);
  }
}

// ── Collect references ──────────────────────────────────────────────────────

// A global scan catches nested fallbacks for free: in `var(--a, var(--b))`
// both `var(` occurrences match, so both names are recorded.
const refs: Ref[] = [];
for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
  refs.push({ name: m[1], file: 'src/index.css', line: lineOf(css, m.index) });
}

// TSX string literals like 'var(--status-exploring)' are references too, and
// fail exactly the same silent way.
for (const [file, text] of tsSources) {
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
    refs.push({ name: m[1], file, line: lineOf(text, m.index) });
  }
}

// ── Check 1: references with no declaration ─────────────────────────────────

const undefinedRefs = refs.filter((r) => !declared.has(r.name));

// ── Check 2: hex-alpha concatenated onto a var() string literal ────────────
//
// StatusBadge built `config.color + '18'` where config.color held the string
// 'var(--status-exploring)', producing `var(--status-exploring)18` — invalid,
// silently dropped, and the badge had no background for months.
//
// Only the provable shape is flagged: a var() string literal sitting directly
// on either side of a `+` with a hex-alpha suffix. Catching the indirect form
// StatusBadge actually used would mean resolving what `config.color` holds,
// which needs type analysis — and every regex approximation tried here fired
// on `theme.color + '40'` in QuestionsView, where the left operand really is
// a hex from user data. A check with a 100% false-positive rate is worse than
// no check, because it teaches people to skip the output.
interface Concat {
  file: string;
  line: number;
  snippet: string;
}
const CONCAT_RE =
  /(?:['"`]var\(--[\w-]+\)['"`]\s*\+\s*['"`][0-9a-fA-F]{2}(?:[0-9a-fA-F]{6})?['"`])|(?:['"`][0-9a-fA-F]{2}(?:[0-9a-fA-F]{6})?['"`]\s*\+\s*['"`]var\(--[\w-]+\)['"`])/g;
const concatSuspects: Concat[] = [];
for (const [file, text] of tsSources) {
  for (const m of text.matchAll(CONCAT_RE)) {
    concatSuspects.push({ file, line: lineOf(text, m.index), snippet: m[0].trim() });
  }
}

// ── Check 3 (warning only): declared but never referenced ──────────────────

const referencedNames = new Set(refs.map((r) => r.name));
const unused = [...declared].filter((n) => !referencedNames.has(n)).sort();

// ── Report ──────────────────────────────────────────────────────────────────

if (unused.length > 0) {
  console.warn(`\n⚠  ${unused.length} custom propert${unused.length === 1 ? 'y is' : 'ies are'} declared but never referenced:`);
  for (const name of unused) console.warn(`     ${name}`);
  console.warn('   (warning only — safe to ignore, but worth pruning as tokens are renamed)');
}

let failed = false;

if (undefinedRefs.length > 0) {
  failed = true;
  console.error(`\n✗ ${undefinedRefs.length} reference${undefinedRefs.length === 1 ? '' : 's'} to undefined custom propert${undefinedRefs.length === 1 ? 'y' : 'ies'}:\n`);
  for (const r of undefinedRefs) {
    console.error(`    ${r.file}:${r.line}  var(${r.name})`);
  }
  console.error(
    '\n  These declarations are dropped at computed-value time — no error, no\n' +
      '  visual warning, just an inherited or initial value nobody wrote.\n' +
      '  Declare the token in src/index.css, or fix the reference.\n',
  );
}

if (concatSuspects.length > 0) {
  failed = true;
  console.error(`\n✗ ${concatSuspects.length} hex-alpha suffix concatenated onto a var() reference:\n`);
  for (const c of concatSuspects) {
    console.error(`    ${c.file}:${c.line}  ${c.snippet}`);
  }
  console.error(
    '\n  This produces something like `var(--x)18`, which is not valid CSS and\n' +
      '  is silently dropped. Build the colour with color-mix() instead, or key\n' +
      '  it off a data attribute in the stylesheet.\n',
  );
}

if (failed) process.exit(1);

console.log(
  `✓ CSS custom properties OK — ${declared.size} declared ` +
    `(${inlineDeclared.size} set inline from TSX), ${refs.length} references all resolve.`,
);
