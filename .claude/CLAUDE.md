# CLAUDE.md — ThreadNotes

**You are Claude Code, working with Nae Drew on `research-journal`.**
Read this file before touching anything. It tells you who Nae is, what this app does, how the code is organized, and how to make decisions.

---

## Who You're Working With

**Nae** is a linguistics student at the University of Delaware, building ChaosLimbă — an English-to-Romanian CALL app grounded in interlanguage theory. ThreadNotes is their personal research command center for that project (and others).

Nae has ADHD and uses agentic development — they direct, you build. They are not learning to code; they are building something real. Treat them accordingly.

**How to communicate with Nae:**
- Lead with action, explain why after
- Use numbered steps for multi-step tasks
- If something is ambiguous, ask ONE clarifying question — not five
- Celebrate progress, but be honest about tradeoffs
- Never condescend. They're inexperienced with code, not incapable of understanding it.

---

## What This App Is

A personal academic research hub, deployed at Vercel with Clerk auth and Postgres-backed sync. Supports custom themes and questions — not locked to ChaosLimbă.

**Core loop:** Find research questions → search literature → save papers → annotate them → link them back to questions → think more clearly.

**What's built:**
- Dashboard (research activity overview)
- Questions view with per-question notes, sources, status tracking, and linked articles
- Custom themes & questions — full CRUD via `ManageThemesView`
- Journal view (free-form entries linkable to questions)
- Search: local search + Find Papers (OpenAlex API) + AI-suggested search phrases per question
- Library view with filters (status pills, question filter, tag filter, OA toggle, sort), enhanced cards
- Article detail with notes, excerpts, linked questions, AI summaries, article tags
- Bidirectional question ↔ article linking
- AI summaries via Anthropic API (Claude Haiku)
- AI-suggested search phrases on question detail pages
- Open Access badges and direct PDF links
- Chrome extension ("Research Journal Clipper") for capturing excerpts from any webpage
- Export view (includes library articles, excerpts, AI summaries, journal entries)
- Settings view (API key management, account info)
- Login/logout via Clerk
- Dark/light/system theme with toggle
- SVG icon system (no emoji)
- MCP server (`research-journal-mcp-server`) for Claude integration
- Read-only demo mode at `/demo` for portfolio use

See `docs/vision-and-development-guide.md` for the full roadmap and future ideas.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript (Vite) |
| Styling | Custom CSS via `src/index.css` (CSS variables — use them, don't override) |
| Storage | Postgres (cross-device sync, via serverless API) + localStorage (cache/fallback) |
| Auth | Clerk |
| Academic Search | OpenAlex API (free, no key required) |
| AI Features | Anthropic API (Claude Haiku) via serverless proxy |
| Icons | Inline SVG via `src/components/common/Icon.tsx` |
| Package Manager | npm |
| Deployment | Vercel |

**Do not introduce new dependencies without flagging it to Nae first.** This app is intentionally lean.

---

## Project Structure

```
src/
├── App.tsx                        — routing/navigation logic
├── index.css                      — ALL styles (CSS variables at :root)
├── main.tsx                       — entry point
├── components/
│   ├── common/
│   │   ├── Icon.tsx               — SVG icon system (20+ icons)
│   │   ├── StarToggle.tsx
│   │   ├── TagPill.tsx
│   │   ├── MarkdownPreview.tsx
│   │   └── EmptyState.tsx
│   ├── layout/
│   │   └── Sidebar.tsx            — nav, progress, stats, theme toggle
│   ├── journal/                   — journal-specific components
│   ├── notes/                     — note editor, card, list
│   └── questions/
│       ├── StatusBadge.tsx
│       └── SourceList.tsx
├── data/
│   ├── research-themes.ts         — default ChaosLimbă research data (seed only)
│   └── tag-colors.ts
├── hooks/
│   ├── useSearch.ts               — local search logic
│   ├── useTheme.ts                — dark/light/system theme
│   ├── useUserData.tsx            — ALL user data CRUD (context provider)
│   └── useDemoData.tsx            — read-only demo data
├── lib/
│   ├── storage.ts                 — localStorage read/write + version migration
│   ├── api.ts                     — serverless API client (Postgres sync)
│   ├── auth.ts                    — Clerk auth helpers
│   ├── ids.ts                     — ID generation
│   └── export-markdown.ts         — markdown export
├── services/
│   ├── scholarSearch.ts           — OpenAlex API wrapper
│   ├── aiSummary.ts               — Anthropic API summary generation
│   └── aiSearchPhrases.ts         — Anthropic API search phrase suggestions
├── types/
│   └── index.ts                   — ALL TypeScript types
└── views/
    ├── DashboardView.tsx          — research activity overview
    ├── QuestionsView.tsx
    ├── QuestionDetailView.tsx
    ├── JournalView.tsx
    ├── SearchView.tsx             — local search + Find Papers (OpenAlex)
    ├── LibraryView.tsx            — article list with filters
    ├── ArticleDetailView.tsx      — article notes, excerpts, AI summary
    ├── ExportView.tsx
    ├── ManageThemesView.tsx       — create/edit/delete themes and questions
    ├── SettingsView.tsx           — API key management, account info
    └── LoginView.tsx              — Clerk login UI

api/                               — Vercel serverless functions
├── _auth.ts                       — shared auth middleware
├── data.ts                        — main Postgres sync endpoint
├── login.ts / logout.ts           — session handling
├── keys.ts                        — API key management
├── excerpts.ts                    — ThreadBrain integration endpoint
└── anthropic/                     — Anthropic API proxy

extension/                         — Chrome extension (Manifest V3)
├── manifest.json
├── background.js                  — context menu registration
├── popup.html / popup.css / popup.js — capture UI
└── icons/

research-journal-mcp-server/       — MCP server for Claude integration
└── src/
    ├── index.ts                   — server entry point
    ├── types.ts
    ├── dataStore.ts
    └── tools/                     — library, search, write, meta tools
```

---

## Types Reference

All types are in `src/types/index.ts`:

```ts
// Static research data
ResearchTheme, ResearchQuestion, FlatQuestion, Source

// User-generated data
QuestionUserData, ResearchNote, UserSource, JournalEntry
LibraryArticle, Excerpt, ArticleStatus, AppUserData

// Navigation
View =
  | { name: 'dashboard' }
  | { name: 'questions' }
  | { name: 'question-detail'; questionId: string }
  | { name: 'journal' }
  | { name: 'search'; initialQuery?: string }
  | { name: 'library' }
  | { name: 'article-detail'; articleId: string }
  | { name: 'export' }
  | { name: 'manage-themes' }
  | { name: 'settings' }
```

---

## CSS / Styling Rules

**Use existing CSS variables.** They're defined at `:root` in `index.css` and follow the naming convention `--theme-*`, `--text-*`, `--bg-*`. Check what's already there before inventing new ones.

**Do not use Tailwind.** Do not add a CSS framework. Do not use inline styles unless there's no other option.

**Match the existing visual language.** The app has a specific aesthetic — dark, academic, intentional. New components should feel native to it, not bolted on.

**Check existing class names** before writing new ones. Reuse where it makes sense.

**Font stack:** System sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`). Monospace only for code blocks in markdown preview.

---

## Data Persistence Pattern

User data syncs to **Postgres via serverless API** (`/api/data.ts`) and is also cached in **localStorage** (`research-journal-data`) for fast loads and offline fallback. The shape is `AppUserData`:

```ts
interface AppUserData {
  version: 1 | 2;
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];
  lastModified: string;
}
```

Version migration is handled in `lib/storage.ts` — version 1 data gets `library: []` added automatically.

The `useUserData` hook listens for `StorageEvent` so changes from the Chrome extension are picked up in real time.

---

## Navigation Pattern

Views are controlled via the `View` union type in `types/index.ts` and routed in `App.tsx`. Navigation uses the History API for deep-linkable URLs. To add a new view:

1. Add it to the `View` union type in `types/index.ts`
2. Add the case to the render switch in `App.tsx`
3. Add the nav item to `Sidebar.tsx`
4. Create the view file in `src/views/`

---

## Key Integration Details

### OpenAlex API (Academic Search)
- Free API, no key required. Uses `mailto` parameter for polite pool.
- Supports `open_access.is_oa` filtering and pagination via `page` param.
- Wrapper in `src/services/scholarSearch.ts`.

### Anthropic API (AI Features)
- API key managed per-user via `SettingsView` and stored via `/api/keys.ts`.
- Proxied through `/api/anthropic/` serverless functions — browser never touches the key directly.
- Uses Claude Haiku for speed/cost.
- Services in `src/services/aiSummary.ts` and `src/services/aiSearchPhrases.ts`.

### Clerk (Auth)
- Handles login/logout and session management.
- Auth state used in `App.tsx` to gate views; helpers in `src/lib/auth.ts`.
- All serverless API routes validate session via `api/_auth.ts`.

### Chrome Extension
- Manifest V3, lives in `extension/` directory.
- Right-click context menu captures selected text from any webpage.
- Writes directly to localStorage via `chrome.scripting.executeScript`.
- Dispatches `StorageEvent` so the React app picks up changes.

### MCP Server
- Lives in `research-journal-mcp-server/`, runs via stdio transport.
- Exposes tools for library access, search, writes, and meta operations.
- Reads/writes the same localStorage data format as the app.

---

## Decision-Making Rules

**When in doubt about scope:** Do less, not more. Build the smallest version that's useful, then expand.

**When in doubt about UI:** Match what's already there. Consistency beats novelty.

**When in doubt about data:** Put it in `types/index.ts`; persist via `useUserData` (which handles both localStorage and Postgres sync).

**When something would be a breaking change:** Stop. Tell Nae what you found and what the options are.

**Never delete existing user data or localStorage keys** without explicit instruction and a migration plan.

---

## What "Good Work" Looks Like Here

- Nae can search literature and save a paper in under 10 seconds
- Opening the Library feels like opening a well-organized desk, not a filing cabinet
- A question and its linked articles are always one click apart
- The app doesn't crash, doesn't lose data, and doesn't surprise Nae

That's the bar. Build toward it.
