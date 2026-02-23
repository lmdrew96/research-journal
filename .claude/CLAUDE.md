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

**What's already built:**
- Questions view (5 themes, 14 questions for ChaosLimbă)
- Per-question notes, sources, and status tracking
- Journal view (free-form entries linkable to questions)
- Local search (searches user's own data)
- Export view

**What we're building next:**
1. Scholar Gateway search (find real peer-reviewed papers)
2. Library view (save, annotate, highlight papers)
3. Question ↔ Article linking (bidirectional)
4. AI summaries (Phase 4, Anthropic API not yet configured — skip for now)

See `docs/vision-and-development-guide.md` for the full roadmap.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript (Vite) |
| Styling | Custom CSS via `src/index.css` (CSS variables — use them, don't override) |
| Storage | localStorage (all user data) |
| External Search | Scholar Gateway API |
| AI (future) | Anthropic API — not active yet |
| Package Manager | npm |

**Do not introduce new dependencies without flagging it to Nae first.** This app is intentionally lean.

---

## Project Structure

```
src/
├── App.tsx                   — routing/navigation logic
├── index.css                 — ALL styles live here (CSS variables at :root)
├── main.tsx                  — entry point
├── components/
│   ├── common/               — shared UI primitives
│   ├── layout/               — nav, sidebar, shell
│   ├── journal/              — journal-specific components
│   ├── notes/                — note-specific components
│   ├── questions/            — question-specific components
│   └── library/              — (to be created) library-specific components
├── data/
│   ├── research-themes.ts    — hardcoded ChaosLimbă research data
│   └── tag-colors.ts         — tag color mappings
├── hooks/
│   └── useSearch.ts          — local search logic
├── types/
│   └── index.ts              — ALL TypeScript types live here
└── views/
    ├── QuestionsView.tsx
    ├── QuestionDetailView.tsx
    ├── JournalView.tsx
    ├── SearchView.tsx
    ├── ExportView.tsx
    └── LibraryView.tsx       — (to be created)
```

---

## Types Reference

All types are in `src/types/index.ts`. Key ones:

```ts
// Static research data
ResearchTheme, ResearchQuestion, FlatQuestion, Source

// User-generated data
QuestionUserData, ResearchNote, UserSource, JournalEntry, AppUserData

// Navigation
View = { name: 'questions' } | { name: 'question-detail', questionId } | ...
```

When adding the Library, you'll add `LibraryArticle`, `Excerpt`, and `ArticleStatus` to this file. See the vision doc for the full target shape.

---

## CSS / Styling Rules

**Use existing CSS variables.** They're defined at `:root` in `index.css` and follow the naming convention `--theme-*`, `--text-*`, `--bg-*`. Check what's already there before inventing new ones.

**Do not use Tailwind.** Do not add a CSS framework. Do not use inline styles unless there's no other option.

**Match the existing visual language.** The app has a specific aesthetic — dark, academic, intentional. New components should feel native to it, not bolted on.

**Check existing class names** (like `.search-input`, `.search-result`, `.empty-state`) before writing new ones. Reuse where it makes sense.

---

## localStorage Pattern

User data is persisted via localStorage under the key `research-journal-data`. The shape is `AppUserData`:

```ts
interface AppUserData {
  version: 1;
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  lastModified: string;
}
```

When you add the Library, extend this to:
```ts
interface AppUserData {
  version: 2;                          // bump the version
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];           // new
  lastModified: string;
}
```

Handle version migration gracefully — if a user has version 1 data, default `library` to `[]`.

---

## Navigation Pattern

Views are controlled via the `View` union type in `types/index.ts` and routed in `App.tsx`. To add a new view:

1. Add it to the `View` union type
2. Add the case to the render switch in `App.tsx`
3. Add the nav item to the layout component
4. Create the view file in `src/views/`

---

## Scholar Gateway Integration (Phase 1 Priority)

Scholar Gateway is a semantic academic search tool available as an MCP tool in Claude.ai. **It is not a REST API you call from the frontend.** 

This means Scholar Gateway search **cannot run in the browser directly.** To integrate it, you'll need one of:

**Option A (recommended for now):** A small backend endpoint (Vercel serverless function) that accepts a query, calls Scholar Gateway, and returns results to the frontend. This is consistent with how ChaosLimbă handles server-side API calls.

**Option B:** If the app stays local-only, a local proxy/server (e.g., a simple Express script that runs alongside the Vite dev server). Less ideal for eventual deployment.

When Nae is ready to tackle this, flag the decision point and the two options clearly before writing any code.

---

## Decision-Making Rules

**When in doubt about scope:** Do less, not more. Build the smallest version of the feature that's actually useful, then expand.

**When in doubt about UI:** Match what's already there. Consistency beats novelty.

**When in doubt about data:** Put it in `types/index.ts` and in localStorage. Don't reach for a database until there's a real reason.

**When something would be a breaking change:** Stop. Tell Nae what you found and what the options are before proceeding.

**Never delete existing user data or localStorage keys** without explicit instruction and a migration plan.

---

## What "Good Work" Looks Like Here

- Nae can search Scholar Gateway from inside the app and save a paper in under 10 seconds
- Opening the Library feels like opening a well-organized desk, not a filing cabinet
- A question and its linked articles are always one click apart
- The app doesn't crash, doesn't lose data, and doesn't surprise Nae

That's the bar. Build toward it.
