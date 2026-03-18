# ThreadNotes — Vision & Development Guide

**For:** Claude Code working with Nae Drew
**Project:** `research-journal`
**Last Updated:** March 2026
**Status:** Core features complete. Deployed. Extending with integrations.

---

## What This App Is

ThreadNotes is a personal academic research command center. It started as a lightweight tool for storing research questions and notes for ChaosLimbă — and has grown into a full research hub where Nae can search peer-reviewed literature, save and annotate articles, link sources directly to research questions, and generate AI-powered summaries.

The app launched as ChaosLimbă-focused but now supports **custom themes and questions**, making it reusable for any research context without a rebuild. It's deployed on Vercel with Clerk auth and Postgres-backed cross-device sync.

---

## Why This Exists

Academic research is cognitively expensive — especially with ADHD. The typical workflow is a mess: questions live in one doc, papers are in browser tabs or PDFs, notes are in another app, and none of it talks to each other. By the time you find the paper you saved three weeks ago, you've lost the thread of why you saved it.

ThreadNotes puts everything in one place:
- The questions you're trying to answer
- The literature you're reading to answer them
- Your annotations, highlights, and reactions
- The connections between all three

The goal is to make "doing research" feel less like archaeology and more like thinking.

---

## Core Philosophy

**Questions are the center of gravity.** Everything — notes, sources, journal entries, saved articles — orbits around the research questions. A paper only matters in context of what you were trying to figure out.

**Save friction, not context.** Finding a good paper and immediately losing it because saving it is a chore is the enemy. The Library should feel effortless to add to.

**Annotations are thinking, not decoration.** Highlights and notes on articles aren't optional extras — they're where real understanding gets built. Every saved article should be a place to think, not just a bookmark.

**Built for one person, designed to scale.** This is Nae's personal research tool. The data model should be clean enough that if it ever needs to grow, it can.

---

## What's Built

### Phase 1 — Academic Paper Search (Done)
- OpenAlex API integration for searching peer-reviewed literature
- Two-tab search: "My Notes" (local) and "Find Papers" (OpenAlex)
- Result cards with title, authors, year, journal, abstract, citation count
- One-click "Save to Library"
- Open Access badges and direct PDF links
- "Open Access only" filter toggle
- "Load more" pagination

### Phase 2 — Library View (Done)
- Full library with enhanced article cards (OA badge, note/excerpt previews, activity indicators)
- Filters: status pills, linked question dropdown, OA toggle, sort (newest/oldest/year/title), article tags
- Text search across title, author, journal
- Article detail view with notes, excerpt manager, question linking

### Phase 3 — Bidirectional Linking (Done)
- Articles link to questions; questions show linked articles
- Link/unlink from both directions
- Navigate between linked items with one click

### Phase 4 — AI Summaries & Search Phrases (Done)
- One-click AI summaries via Anthropic API (Claude Haiku)
- Contextual prompts using title, abstract, excerpts, and linked research questions
- Summaries persist, rendered as markdown; regenerate button for updates
- AI-suggested search phrases on question detail pages

### Phase 5 — Deployment & Auth (Done)
- Deployed on Vercel
- Clerk authentication (login/logout, session management)
- Postgres-backed cross-device sync via serverless API (`/api/data.ts`)
- Password-protected demo mode at `/demo` for portfolio use
- URL-based routing via History API (deep-linkable views)
- Settings view (API key management, account info)

### Additional Features (Done)
- **Dashboard** — Research activity overview with stats and recent activity
- **Custom themes/questions** — Full CRUD for research themes and questions (`ManageThemesView`)
- **Article tags** — Add/remove tags with autocomplete; filter library by tag
- **Export upgrade** — Markdown export includes library articles, excerpts, AI summaries, and journal entries
- **Chrome extension** — "Research Journal Clipper" captures excerpts from any webpage
- **MCP server** — `research-journal-mcp-server` exposes library, search, write, and meta tools for Claude integration
- **SVG icon system** — 20+ inline SVG icons
- **Theme support** — Dark/light/system with toggle
- **Sans-serif fonts** — System font stack throughout

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript (Vite) |
| Styling | Custom CSS (`index.css` — CSS variables, no framework) |
| Storage | Postgres (cross-device, via serverless API) + localStorage (cache/fallback) |
| Auth | Clerk |
| Academic Search | OpenAlex API (free, no key) |
| AI Summaries | Anthropic API (Claude Haiku) via serverless proxy |
| Icons | Inline SVG (`Icon.tsx`) |
| Browser Extension | Chrome Manifest V3 |
| MCP Server | `research-journal-mcp-server` (Node, `@modelcontextprotocol/sdk`) |
| Package Manager | npm |
| Deployment | Vercel |

---

## Data Model

All types in `src/types/index.ts`:

```ts
interface AppUserData {
  version: 1 | 2;
  questions: Record<string, QuestionUserData>;
  journal: JournalEntry[];
  library: LibraryArticle[];
  lastModified: string;
}

interface LibraryArticle {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  notes: string;
  excerpts: Excerpt[];
  linkedQuestions: string[];
  status: ArticleStatus;       // 'to-read' | 'reading' | 'done' | 'key-source'
  tags: string[];              // fully supported with UI
  aiSummary: string | null;
  isOpenAccess: boolean;
  savedAt: string;
  updatedAt: string;
}
```

---

## Future Ideas

These are potential next steps, not commitments:

| Idea | Description |
|---|---|
| **Keyboard shortcuts** | Quick nav between views, focus search |
| **Projects concept** | Top-level project switcher for multiple research contexts (themes are a step toward this but not a full switcher) |
| **ThreadBrain integration** | `/api/excerpts` serverless endpoint already exists — deeper integration with ThreadBrain TBD |

---

## What "Done" Looks Like

A session in ThreadNotes looks like this:

1. Nae opens the app to the Dashboard. She sees her research progress at a glance — papers saved this week, questions in progress, recent activity.
2. She has a new question forming — about how attention regulation affects error-driven learning. She goes to "Find Papers," searches OpenAlex, reads abstracts, saves 3 relevant articles.
3. She opens one saved article in the Library, reads it, pastes a key quote as an excerpt, adds a note ("this directly challenges what Payne says about task sequencing"), generates an AI summary, and links it to the "Cognitive Load & ADHD Design" question.
4. She goes to that question's detail view and sees her newly linked article alongside her existing notes.
5. She writes a quick journal entry synthesizing what she read.

Everything in one place. Nothing lost. The thinking stays connected to the questions.

---

*This document is the north star for all development decisions on ThreadNotes. If a feature idea doesn't serve the workflow above, it probably doesn't belong in this app — yet.*
