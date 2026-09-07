# ThreadNotes

A personal academic research command center. Built by Nae Drew for ChaosLimbă research — designed to be reusable for any project.

**Stack:** React + TypeScript + Vite · Clerk auth · Neon Postgres + localStorage · OpenAlex · Anthropic

---

## What It Does

- **Dashboard** — Research activity overview with stats and recent activity
- **Questions** — Organize research questions by theme, track status, add notes, link to articles
- **Journal** — Free-form entries, linkable to specific questions, with tags
- **Search** — Local search across your data + OpenAlex paper search ("Find Papers")
- **Library** — Save peer-reviewed articles, annotate them, link them to questions, generate AI summaries
- **Projects** — Top-level project switcher for multiple research contexts
- **Export** — Markdown export including library articles, excerpts, AI summaries, and journal entries
- **Chrome extension** — "Research Journal Clipper" captures excerpts from any webpage
- **MCP server** — expose your library and questions to Claude via MCP (HTTP connector, works on mobile)

---

## Getting Started

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`.

### Which dev command to use

There are two, and the difference matters:

| Command | Serves | `/api/*` routes |
|---|---|---|
| `npm run dev` | Vite only — fast HMR, best for UI work | **No.** Vite serves `api/data.ts` as a static file, so requests get TypeScript source back with a 200 status. |
| `npm run dev:api` | `vercel dev` — the full app | Yes. Needs the Vercel CLI and a linked project; reads `DATABASE_URL` and the Clerk keys from `.env`. |

Anything server-backed — Postgres sync, the preferences/view-state round trip,
`/api/keys`, `/api/excerpts`, the Anthropic proxy, the MCP endpoint — only works
under `npm run dev:api`.

Under plain `npm run dev` the app runs on localStorage alone and shows a
"Not connected to the server" banner. That banner exists because the silent
version of this was genuinely alarming: with no backend and no local cache, you
sign in and get the seeded default project, which looks exactly like your
research has been deleted. If you see it, nothing is wrong with your data — the
API just isn't running.

### Type Checking

`npm run build` runs `npm run typecheck` first, so a type error fails the build instead of reaching production. This covers two separate projects:

| Config | Covers |
|---|---|
| `tsconfig.app.json` | `src/` — the React app |
| `tsconfig.api.json` | `api/` — the Vercel serverless functions, including the MCP server |

Run it on its own with `npm run typecheck`. It adds roughly 5 seconds to a build that Vite alone finishes in about 1 — worth it, since `api/` is otherwise only compiled by Vercel's bundler, which strips types without checking them.

### Environment Variables

Production (set in Vercel dashboard):

| Variable | Description |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend key (`pk_live_...`) |
| `CLERK_SECRET_KEY` | Clerk backend key for serverless auth middleware |
| `DATABASE_URL` | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Default Anthropic API key (users can override via Settings) |

Local dev only:

| Variable | Description |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | For testing AI features without deploying |

See `.env.example` for the full list.

---

## Project Docs

- [`docs/vision-and-development-guide.md`](docs/vision-and-development-guide.md) — Full vision, roadmap, and data model
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — For Claude Code: architecture, patterns, and decision rules
- [`docs/mcp-server.md`](docs/mcp-server.md) — MCP server setup and tool reference
