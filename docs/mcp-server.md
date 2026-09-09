# ThreadNotes MCP Server

ThreadNotes exposes your research journal to Claude over the Model Context Protocol, so you can search your library, browse research questions, and log excerpts from inside any Claude conversation — desktop, web, or mobile.

It runs as an HTTP endpoint on the same Vercel deployment as the app. There is nothing to install and nothing to keep running locally.

## Connecting

1. In ThreadNotes, go to **Settings → API Keys** and generate a key. Name it something you'll recognise (e.g. "Claude connector").
2. The **Claude Connector** section directly below fills in with your full connector URL:

   ```
   https://research.adhdesigns.dev/mcp/rj_<your-key>
   ```

   Copy it now — the key is only shown once.
3. In Claude, add a **custom connector** and paste that URL.

The URL contains your API key, so treat it like a password. To revoke access, revoke the key in Settings; the URL stops working immediately.

## Why token-in-path

Claude's remote-connector UI cannot attach custom headers to an upstream server, so a `Authorization: Bearer` header isn't available. The token travels as a path segment instead — the same convention Kindling, Tangle, and Loose Change use.

## Architecture

| Piece | Location |
|---|---|
| HTTP route | `api/mcp/[token].ts` |
| Server factory | `api/_mcp/server.ts` |
| Tool handlers | `api/_mcp/tools/{library,search,meta,write,projects,journal,studies}.ts` |
| Data access | `api/_mcp/store.ts` |
| Response envelope | `api/_mcp/envelope.ts` |
| Public URL rewrite | `vercel.json` (`/mcp/:token` → `/api/mcp/:token`) |

Transport is the MCP SDK's Streamable HTTP in **stateless** mode — one `McpServer` instance per request, no session to keep warm between serverless invocations, and `enableJsonResponse` so a one-shot function can answer with a plain JSON body instead of an SSE stream.

Auth resolves the path token against the `api_keys` table (sha256 of the raw token → Clerk user ID) — the same table that backs the ThreadBrain `/api/excerpts` integration. There is no separate MCP credential.

`DATABASE_URL` lives in Vercel's environment and nowhere else.

## Data scope

Every tool except `journal_list_projects` operates on the **currently active project**. Each response is prefixed with `[Active project: "Name" (id)]` so it's never ambiguous which project a result came from.

Use `journal_list_projects` to see what exists and `journal_set_active_project` to switch — the switch persists and also changes the project selected in the web app, so it is a real change rather than a per-conversation view.

**Articles vs journal entries.** An excerpt has to hang off an article, so it is the wrong home for an observation that isn't tied to a paper. Those belong in a journal entry (`journal_add_entry`), which stands alone and can optionally link to a question or a theme.

The MCP reads the `app_data` JSONB blob and writes both it and the relational tables — `writeData` in `api/_mcp/store.ts` runs the same `buildDecomposeQueries` decomposer that `api/data.ts` PUT uses. The app reads relationally (Phase 4), so MCP writes land on its primary read path rather than relying on the newer-wins fallback.

## Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| `journal_get_themes` | List research themes and their question IDs | Read |
| `journal_get_questions` | List research questions with status, notes, sources, and related questions | Read |
| `journal_get_library` | List articles, optionally filtered by status or theme | Read |
| `journal_get_article` | Full details of one article, including excerpts | Read |
| `journal_search` | Full-text search across articles, journal entries and studies | Read |
| `journal_add_article` | Create a new library article | Write |
| `journal_update_article` | Update fields on an existing article | Write |
| `journal_delete_article` | Permanently remove an article | Write |
| `journal_add_excerpt` | Add a quote + comment to an article | Write |
| `journal_delete_excerpt` | Remove an excerpt from an article | Write |
| `journal_add_note` | Append text to an article's notes | Write |
| `journal_update_tags` | Replace an article's tags | Write |
| `journal_link_question` | Link or unlink an article and a research question | Write |
| `journal_link_questions` | Relate or unrelate two research questions (symmetric, untyped) | Write |
| `journal_add_theme` | Create a research theme | Write |
| `journal_update_theme` | Rename a theme or change its description, color, or icon | Write |
| `journal_delete_theme` | Remove an empty theme; refuses while questions remain | Write |
| `journal_add_question` | Add a question to a theme | Write |
| `journal_update_question` | Edit a question's text/why/appImplication/tags, or set status/starred, or append a note | Write |
| `journal_delete_question` | Delete a question; cascades notes/sources, unlinks articles and entries | Write |
| `journal_update_question_note` | Edit the content of an existing note on a question | Write |
| `journal_delete_question_note` | Permanently remove a note from a question | Write |
| `journal_list_projects` | List every project with counts, marking the active one | Read |
| `journal_set_active_project` | Switch which project all other tools operate on | Write |
| `journal_add_project` | Create a project; makes it active by default | Write |
| `journal_get_entries` | Journal entries, filtered by question, theme, or tag | Read |
| `journal_add_entry` | Create a free-form journal entry | Write |
| `journal_update_entry` | Edit an entry; `null` unlinks a question or theme | Write |
| `journal_delete_entry` | Permanently remove a journal entry | Write |
| `journal_add_study` | Create a study — original research being designed | Write |
| `journal_get_studies` | List studies with counts of active hypotheses and open decisions | Read |
| `journal_get_study` | Full detail of one study: hypotheses, decisions, linked questions | Read |
| `journal_update_study` | Edit a study's title, framing, design prose, or status | Write |
| `journal_delete_study` | Remove a study and everything on it | Write |
| `journal_link_study_question` | Link or unlink a study and a research question | Write |
| `journal_add_hypothesis` | Add a hypothesis to a study | Write |
| `journal_update_hypothesis` | Edit a hypothesis in place (typo, label, status, question) | Write |
| `journal_supersede_hypothesis` | Revise a hypothesis, keeping the chain — one atomic call | Write |
| `journal_delete_hypothesis` | Remove a hypothesis, clearing pointers at it | Write |
| `journal_get_hypothesis_chain` | Read a claim's revision history oldest → newest, with rationales | Read |
| `journal_add_decision` | Record a design decision — what, what not, and why | Write |
| `journal_update_decision` | Edit a decision, typically to settle an open one | Write |
| `journal_supersede_decision` | Reverse a decision, keeping the reversal on the record | Write |
| `journal_get_open_decisions` | Everything still unsettled, optionally scoped to one study | Read |
| `journal_delete_decision` | Remove a decision, clearing pointers at it | Write |

## Studies

The library holds what other people wrote; **studies** hold research Nae is designing herself. They sit alongside articles rather than under a question, and link to questions many-to-many — same relation to the question, opposite authorship.

A study parents **hypotheses** and **decisions**. Variables, instruments and the analysis plan are prose in the study's `design` field, not objects.

**Superseding is one call, always.** `journal_supersede_hypothesis` creates the revised hypothesis, marks the old one superseded, and points it at the replacement in a single write; passing `rationale` also records why, as a settled decision on the same study. Doing this as add-then-update is the failure mode the single call exists to prevent — a conversation that moves on midway leaves two active claims and no history. `journal_supersede_decision` works the same way.

Pointers run forward (v1 → v2 → v3), so `journal_get_hypothesis_chain` accepts any link and walks to both ends.

`journal_get_open_decisions` answers "what have I not settled yet", which is the question the `status` field exists to serve.

## Example prompts

- "What articles do I have about error-driven learning?"
- "Show me all my key-source articles"
- "What research questions am I exploring right now?"
- "Log this as an excerpt on [article title]: ..."
- "What have I not decided yet on the ADHD x SLA study?"
- "Revise H1 to say ... — because the instrument measures a product, not a behaviour"

## Verifying a change

`scripts/smoke-mcp.mts` mounts the real Vercel handler on a local HTTP server and drives it with the MCP SDK client against the real database. It mints its own throwaway API key and deletes it when the run ends.

```bash
# read-only
npx tsx --env-file=.env scripts/smoke-mcp.mts --user=<clerkUserId>

# also exercise the write tools (creates a temp article, then deletes it)
npx tsx --env-file=.env scripts/smoke-mcp.mts --user=<clerkUserId> --write
```

Type-check the serverless code (the app's `tsconfig.app.json` does not cover `api/`):

```bash
npx tsc -p tsconfig.api.json
```
