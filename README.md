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
- **MCP server** — expose your library and questions to Claude via MCP

---

## Getting Started

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`. In local dev, data is stored in localStorage only (no Clerk, no Postgres sync).

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
- [`research-journal-mcp-server/README.md`](research-journal-mcp-server/README.md) — MCP server setup and tool reference
