# Research Journal — Vision & Development Guide

**For:** Claude Code working with Nae Drew  
**Project:** `research-journal`  
**Last Updated:** February 2026  
**Status:** Active Development

---

## What This App Is

Research Journal is a personal academic research command center. It started as a lightweight tool for storing research questions and notes for ChaosLimbă — and is growing into a full research hub where Nae can search peer-reviewed literature, save and annotate articles, link sources directly to research questions, and eventually generate AI-powered summaries.

The app is **ChaosLimbă-first** in its current data and framing, but is designed to be **flexible enough to reuse** for other academic projects, classes, or research contexts without a full rebuild.

---

## Why This Exists

Academic research is cognitively expensive — especially with ADHD. The typical workflow is a mess: questions live in one doc, papers are in browser tabs or PDFs, notes are in another app, and none of it talks to each other. By the time you find the paper you saved three weeks ago, you've lost the thread of why you saved it.

Research Journal puts everything in one place:
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

**Built for one person, designed to scale.** This is Nae's personal research tool. It doesn't need user accounts or collaboration features. But the data model should be clean enough that if it ever needs to grow, it can.

---

## Current State (What's Already Built)

The app is a **Vite + React + TypeScript** project, running locally. It currently has:

### Views
- **Questions** (`QuestionsView.tsx`) — Displays 5 research themes, each with multiple questions. Filterable by tag and status.
- **Question Detail** (`QuestionDetailView.tsx`) — Per-question view with notes, user-added sources, and status tracking.
- **Journal** (`JournalView.tsx`) — Free-form journal entries, linkable to questions/themes.
- **Search** (`SearchView.tsx`) — Local search across questions, notes, journal entries, and sources.
- **Export** (`ExportView.tsx`) — Exports data for external use.

### Data
- **5 Research Themes** (hardcoded in `research-themes.ts`): Error-Driven Learning, Non-Linear Development, Cognitive Load & ADHD Design, Affect & Motivation, AI & Adaptive Technology
- **14 Research Questions** across those themes, each with a `why`, `appImplication`, `tags`, and `sources`
- **User data** (notes, sources, journal entries, status) persisted via `localStorage`

### Types
The `UserSource` type already exists with `text`, `doi`, `url`, `notes`, and `addedAt` fields — a solid foundation for the Library.

---

## The Vision: What We're Building Toward

### Phase 1 — Scholar Gateway Search (Next Priority)
Upgrade `SearchView.tsx` to have two distinct modes:

**Mode A: Local Search** (existing behavior — keep it)
Searches questions, notes, journal entries, and saved sources.

**Mode B: Find Papers**
A new tab/toggle inside Search that hits the Scholar Gateway API. The user types a query, gets back peer-reviewed results (title, authors, year, journal, abstract, DOI), and can save any result directly to their Library.

Key UX decisions:
- The two modes should be clearly separated — don't mix local results with Scholar Gateway results
- Each Scholar Gateway result card should show enough to decide if it's worth saving (title, authors, year, abstract snippet, DOI link)
- "Save to Library" should be one click, no friction

### Phase 2 — Library View
A new `LibraryView.tsx` — the home for all saved articles.

Each saved article should support:
- Full metadata (title, authors, year, journal, DOI, URL)
- Personal notes / annotations
- Highlight-style excerpts (paste a quote from the paper + optional comment)
- Link to one or more research questions
- A status tag (e.g., "to read", "reading", "done", "key source")
- AI summary placeholder (greyed out until Phase 4)

The Library should be filterable by: research question, theme, status, and tags.

### Phase 3 — Linking (Questions ↔ Articles)
Every saved article in the Library should be linkable to one or more research questions. And from the Question Detail view, you should see which Library articles are linked to that question.

This is the connective tissue that makes the whole thing useful — you go to a question, and immediately see the literature relevant to it.

Data model addition needed: a `linkedQuestions: string[]` array on `UserSource`/Library items.

### Phase 4 — AI Summaries (Future)
When an Anthropic API key is available, add a "Summarize" button to each Library article. It takes the title + abstract (and any user-pasted excerpts) and returns a concise summary focused on: what the study found, how it's relevant to the user's research questions, and what it implies for ChaosLimbă.

Store summaries locally so they don't need to be regenerated. This is an enhancement, not a core feature — Phase 4 can wait.

---

## Making It Reusable (Beyond ChaosLimbă)

The ChaosLimbă research themes are currently hardcoded in `research-themes.ts`. To make this app reusable for other projects or classes, the long-term goal is:

- Allow users to create their own themes and questions (not just the ChaosLimbă defaults)
- The hardcoded themes become a "starter template" rather than the only option
- A simple "Projects" concept at the top level — switch between "ChaosLimbă Research" and "World History Paper" etc.

This doesn't need to happen immediately. For now, keep the hardcoded themes and build the Library features. Flexibility can come later without breaking anything.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript (Vite) |
| Styling | Custom CSS (index.css — theme variables already established) |
| Storage | localStorage (for now) |
| Search | Scholar Gateway API (to be integrated) |
| AI Summaries | Anthropic API (Phase 4, not yet configured) |
| Deployment | TBD — likely Vercel when ready |

**No database yet.** Everything lives in localStorage. This is fine for a personal tool. If the app ever needs persistence across devices, the migration path is to add a simple backend (likely the same Neon/Drizzle setup used in ChaosLimbă).

---

## Data Model — What Needs to Grow

### Current `UserSource` (in `types/index.ts`)
```ts
export interface UserSource {
  id: string;
  text: string;
  doi: string | null;
  url: string | null;
  notes: string;
  addedAt: string;
}
```

### Target `LibraryArticle` (replace or extend UserSource)
```ts
export interface LibraryArticle {
  id: string;
  // Metadata (from Scholar Gateway or manually entered)
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  // User content
  notes: string;
  excerpts: Excerpt[];          // highlighted quotes + comments
  linkedQuestions: string[];    // question IDs from research-themes
  status: ArticleStatus;        // 'to-read' | 'reading' | 'done' | 'key-source'
  tags: string[];
  aiSummary: string | null;     // populated in Phase 4
  savedAt: string;
  updatedAt: string;
}

export interface Excerpt {
  id: string;
  quote: string;
  comment: string;
  createdAt: string;
}

export type ArticleStatus = 'to-read' | 'reading' | 'done' | 'key-source';
```

---

## File Structure (Current + Planned)

```
research-journal/
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── components/
│   │   ├── common/
│   │   ├── journal/
│   │   ├── layout/
│   │   ├── notes/
│   │   ├── questions/
│   │   └── library/          ← NEW (Phase 2)
│   ├── data/
│   │   ├── research-themes.ts
│   │   └── tag-colors.ts
│   ├── hooks/
│   │   ├── useSearch.ts
│   │   └── useLibrary.ts     ← NEW (Phase 2)
│   ├── types/
│   │   └── index.ts          ← needs LibraryArticle added
│   └── views/
│       ├── QuestionsView.tsx
│       ├── QuestionDetailView.tsx
│       ├── JournalView.tsx
│       ├── SearchView.tsx    ← needs Scholar Gateway mode added
│       ├── ExportView.tsx
│       └── LibraryView.tsx   ← NEW (Phase 2)
└── docs/
    ├── vision-and-development-guide.md  ← this file
    └── CLAUDE.md
```

---

## Development Phases

### Phase 1 — Scholar Gateway Search
**Goal:** Search and save peer-reviewed papers from inside the app.

Tasks:
1. Add Scholar Gateway API integration (research how the API is called from a frontend Vite app)
2. Upgrade `SearchView.tsx` with two tabs: "My Notes" (existing) and "Find Papers" (new)
3. Build result cards with title, authors, abstract, DOI link, and "Save to Library" button
4. Saving a paper creates a `LibraryArticle` in localStorage

### Phase 2 — Library View
**Goal:** A home for all saved articles with full annotation support.

Tasks:
1. Add `LibraryArticle` type to `types/index.ts`
2. Create `useLibrary.ts` hook (CRUD for library articles in localStorage)
3. Build `LibraryView.tsx` with article list, filters, and status tags
4. Build article detail panel with notes, excerpt manager, and question-linking UI
5. Add navigation to `App.tsx`

### Phase 3 — Question ↔ Article Linking
**Goal:** See relevant articles from Question Detail; see linked questions from Library.

Tasks:
1. Add linked articles section to `QuestionDetailView.tsx`
2. Add linked questions section to each article in `LibraryView.tsx`
3. Make linking bidirectional (updating one side updates the other)

### Phase 4 — AI Summaries (Future)
**Goal:** One-click AI summaries of saved articles using Anthropic API.

Tasks:
1. Add Anthropic API key to `.env`
2. Build summary prompt using article title + abstract + user's linked research questions for context
3. Display and store summaries per article

---

## What "Done" Looks Like

A session in Research Journal looks like this:

1. Nae opens the app to the Questions view. She sees her ChaosLimbă research questions organized by theme.
2. She has a new question forming — about how attention regulation affects error-driven learning. She goes to "Find Papers," searches Scholar Gateway, reads abstracts, saves 3 relevant articles.
3. She opens one saved article in the Library, reads it, pastes a key quote as an excerpt, adds a note ("this directly challenges what Payne says about task sequencing"), and links it to the "Cognitive Load & ADHD Design" question.
4. She goes to that question's detail view and sees her newly linked article alongside her existing notes.
5. She writes a quick journal entry synthesizing what she read.

Everything in one place. Nothing lost. The thinking stays connected to the questions.

---

*This document is the north star for all development decisions on Research Journal. If a feature idea doesn't serve the workflow above, it probably doesn't belong in this app — yet.*
