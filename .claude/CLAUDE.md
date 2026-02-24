# CLAUDE.md — Research Journal

**You are Claude Code, working with Nae Drew on `research-journal`.**
Read this file before touching anything. It tells you who Nae is, what this app does, how the code is organized, and how to make decisions.

---

## Who You're Working With

**Nae** is a linguistics student at the University of Delaware, building ChaosLimbă — an English-to-Romanian CALL app grounded in interlanguage theory. Research Journal is their personal research command center for that project (and eventually others).

Nae has ADHD and uses agentic development — they direct, you build. They are not learning to code; they are building something real. Treat them accordingly.

**How to communicate with Nae:**
- Lead with action, explain why after
- Use numbered steps for multi-step tasks
- If something is ambiguous, ask ONE clarifying question — not five
- Celebrate progress, but be honest about tradeoffs
- Never condescend. They're inexperienced with code, not incapable of understanding it.

---

## What This App Is

A personal academic research hub. Currently ChaosLimbă-focused, designed to be reusable.

**Core loop:** Find research questions → search literature → save papers → annotate them → link them back to questions → think more clearly.

**What's built:**
- Dashboard (research activity overview)
- Questions view (5 themes, 14 questions for ChaosLimbă)
- Per-question notes, sources, status tracking, and linked articles
- Journal view (free-form entries linkable to questions)
- Search with two tabs: local search (user's data) and Find Papers (OpenAlex API)
- Library view with filters (status pills, question filter, OA toggle, sort), enhanced cards
- Article detail with notes, excerpts, linked questions, AI summaries
- Bidirectional question ↔ article linking
- AI summaries via Anthropic API (Claude Haiku, proxied through Vite)
- Open Access badges and direct PDF links
- Chrome extension ("Research Journal Clipper") for capturing excerpts from any webpage
- Export view
- Dark/light theme with toggle
- SVG icon system (no emoji)

See `docs/vision-and-development-guide.md` for the full roadmap and future ideas.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript (Vite) |
| Styling | Custom CSS via `src/index.css` (CSS variables — use them, don't override) |
| Storage | localStorage (all user data, key: `research-journal-data`) |
| Academic Search | OpenAlex API (free, no key required) |
| AI Summaries | Anthropic API via Vite server middleware proxy |
| Icons | Inline SVG via `src/components/common/Icon.tsx` |
| Package Manager | npm |

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
│   ├── research-themes.ts         — hardcoded ChaosLimbă research data
│   └── tag-colors.ts
├── hooks/
│   ├── useSearch.ts               — local search logic
│   ├── useTheme.ts                — dark/light/system theme
│   └── useUserData.tsx            — ALL user data CRUD (context provider)
├── lib/
│   ├── storage.ts                 — localStorage read/write
│   ├── ids.ts                     — ID generation
│   └── export-markdown.ts         — markdown export
├── services/
│   ├── scholarSearch.ts           — OpenAlex API wrapper
│   └── aiSummary.ts               — Anthropic API summary generation
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
    └── ExportView.tsx

extension/                         — Chrome extension (Manifest V3)
├── manifest.json
├── background.js                  — context menu registration
├── popup.html / popup.css / popup.js — capture UI
└── icons/                         — extension icons
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
View = 'dashboard' | 'questions' | 'question-detail' | 'journal'
     | 'search' | 'library' | 'article-detail' | 'export'
```

---

## CSS / Styling Rules

**Use existing CSS variables.** They're defined at `:root` in `index.css` and follow the naming convention `--theme-*`, `--text-*`, `--bg-*`. Check what's already there before inventing new ones.

**Do not use Tailwind.** Do not add a CSS framework. Do not use inline styles unless there's no other option.

**Match the existing visual language.** The app has a specific aesthetic — dark, academic, intentional. New components should feel native to it, not bolted on.

**Check existing class names** before writing new ones. Reuse where it makes sense.

**Font stack:** System sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`). Monospace only for code blocks in markdown preview.

---

## localStorage Pattern

User data is persisted via localStorage under the key `research-journal-data`. The shape is `AppUserData`:

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

Views are controlled via the `View` union type in `types/index.ts` and routed in `App.tsx`. To add a new view:

1. Add it to the `View` union type
2. Add the case to the render switch in `App.tsx`
3. Add the nav item to `Sidebar.tsx`
4. Create the view file in `src/views/`

---

## Key Integration Details

### OpenAlex API (Academic Search)
- Free API, no key required. Uses `mailto` parameter for polite pool.
- Supports `open_access.is_oa` filtering and pagination via `page` param.
- Wrapper in `src/services/scholarSearch.ts`.

### Anthropic API (AI Summaries)
- API key stored in `.env` as `VITE_ANTHROPIC_API_KEY` (gitignored).
- Proxied through a custom Vite plugin middleware in `vite.config.ts` — the browser hits `/api/anthropic/*`, the server forwards to `api.anthropic.com` with the key.
- Uses Claude Haiku for speed/cost.
- Service in `src/services/aiSummary.ts`.

### Chrome Extension
- Manifest V3, lives in `extension/` directory.
- Right-click context menu captures selected text from any webpage.
- Writes directly to localStorage via `chrome.scripting.executeScript`.
- Dispatches `StorageEvent` so the React app picks up changes.

---

## Decision-Making Rules

**When in doubt about scope:** Do less, not more. Build the smallest version that's useful, then expand.

**When in doubt about UI:** Match what's already there. Consistency beats novelty.

**When in doubt about data:** Put it in `types/index.ts` and in localStorage.

**When something would be a breaking change:** Stop. Tell Nae what you found and what the options are.

**Never delete existing user data or localStorage keys** without explicit instruction and a migration plan.

---

## What "Good Work" Looks Like Here

- Nae can search literature and save a paper in under 10 seconds
- Opening the Library feels like opening a well-organized desk, not a filing cabinet
- A question and its linked articles are always one click apart
- The app doesn't crash, doesn't lose data, and doesn't surprise Nae

That's the bar. Build toward it.
