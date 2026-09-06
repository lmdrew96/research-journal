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
| Tool handlers | `api/_mcp/tools/{library,search,meta,write}.ts` |
| Data access | `api/_mcp/store.ts` |
| Response envelope | `api/_mcp/envelope.ts` |
| Public URL rewrite | `vercel.json` (`/mcp/:token` → `/api/mcp/:token`) |

Transport is the MCP SDK's Streamable HTTP in **stateless** mode — one `McpServer` instance per request, no session to keep warm between serverless invocations, and `enableJsonResponse` so a one-shot function can answer with a plain JSON body instead of an SSE stream.

Auth resolves the path token against the `api_keys` table (sha256 of the raw token → Clerk user ID) — the same table that backs the ThreadBrain `/api/excerpts` integration. There is no separate MCP credential.

`DATABASE_URL` lives in Vercel's environment and nowhere else.

## Data scope

Every tool operates on the **currently active project**, the one selected in the app's sidebar. Switching projects in the app changes what the MCP sees. Each response is prefixed with `[Active project: "Name" (id)]` so it's never ambiguous which project a result came from.

The MCP reads and writes the `app_data` JSONB blob. The app itself reads from the relational tables (Phase 4) and falls back to the blob when it is newer, so MCP writes surface correctly on the app's next load.

## Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| `journal_get_themes` | List research themes and their question IDs | Read |
| `journal_get_questions` | List research questions with status, notes, and sources | Read |
| `journal_get_library` | List articles, optionally filtered by status or theme | Read |
| `journal_get_article` | Full details of one article, including excerpts | Read |
| `journal_search` | Full-text search across titles, abstracts, notes, and excerpts | Read |
| `journal_add_article` | Create a new library article | Write |
| `journal_update_article` | Update fields on an existing article | Write |
| `journal_delete_article` | Permanently remove an article | Write |
| `journal_add_excerpt` | Add a quote + comment to an article | Write |
| `journal_delete_excerpt` | Remove an excerpt from an article | Write |
| `journal_add_note` | Append text to an article's notes | Write |
| `journal_update_tags` | Replace an article's tags | Write |
| `journal_link_question` | Link or unlink an article and a research question | Write |
| `journal_add_theme` | Create a research theme | Write |
| `journal_add_question` | Add a question to a theme | Write |
| `journal_update_question` | Set a question's status/starred state, or append a note | Write |

## Example prompts

- "What articles do I have about error-driven learning?"
- "Show me all my key-source articles"
- "What research questions am I exploring right now?"
- "Log this as an excerpt on [article title]: ..."

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
