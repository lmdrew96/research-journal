# Research Journal MCP Server

An MCP (Model Context Protocol) server that exposes your Research Journal data to Claude. Search your library, browse research questions, read article excerpts, and add notes — all from within a Claude conversation.

Connects directly to your Neon Postgres database, so it always reads live data — no export needed.

## Setup

### 1. Install and build

```bash
cd research-journal-mcp-server
npm install
npm run build
```

### 2. Get your Neon database URL

This is the same `DATABASE_URL` used by your Vercel deployment. You can find it in:
- Your Vercel project settings (Environment Variables)
- The Neon dashboard under your project's connection details

It looks like: `postgresql://user:pass@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require`

### 3. Get your Clerk user ID

The app stores each user's data under their Clerk user ID, so the MCP server needs yours to read and write the right row.

Find it in the [Clerk dashboard](https://dashboard.clerk.com/) → **Users** → your account. It looks like `user_3BjaTvQ0nwdM7y8T0kjeC8SJvnL`.

### 4. Configure Claude Desktop

Add this server to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "research-journal": {
      "command": "node",
      "args": ["/FULL/PATH/TO/research-journal-mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require",
        "CLERK_USER_ID": "user_xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Replace the path, database URL, and Clerk user ID with your actual values.

### 5. Restart Claude Desktop

After saving the config, restart Claude Desktop. You should see the Research Journal tools available in the tools menu.

## Available Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| `journal_get_library` | List all articles with optional status/theme filters | Read |
| `journal_search` | Full-text search across titles, abstracts, notes, and excerpts | Read |
| `journal_get_article` | Get full details of one article by ID | Read |
| `journal_get_themes` | List all research themes and their question IDs | Read |
| `journal_get_questions` | List all research questions with status and notes | Read |
| `journal_add_excerpt` | Add a quote + comment to an article | Write |
| `journal_add_note` | Append text to an article's notes | Write |

## Example Prompts

Once connected, try asking Claude:

- "What articles do I have about error-driven learning?"
- "Show me all my key-source articles"
- "What research questions am I exploring right now?"
- "Search my library for anything about cognitive load"
- "Add a note to [article title] saying..."

## Environment Variables

The server prefers Neon mode if `DATABASE_URL` is set.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string (recommended — reads live data). Required for Neon mode. |
| `CLERK_USER_ID` | Your Clerk user ID. **Required** when using `DATABASE_URL` — the app stores each user's data under their Clerk ID. |
| `JOURNAL_DATA_PATH` | Fallback: absolute path to a local JSON export file. Used only when `DATABASE_URL` is not set. |

## How It Stays in Sync

With `DATABASE_URL`, the MCP server reads and writes directly to the same Neon database as your web app. Changes made through Claude (adding excerpts or notes) will appear in the web app on next load, and vice versa.

With `JOURNAL_DATA_PATH`, you'd need to re-export from the app periodically.
