# ThreadNotes — Connection Suggestions (spec draft, Oct 7, 2026)

Status: design agreed with Nae in conversation (Oct 7). Filed as a ThreadNotes patch that **depends on the Connections patch (2dd5da5b)**: this spec adds automatic *suggestions* on top of the user-made Connections that patch defines.

## What it is
After each note or excerpt is saved, ThreadNotes checks it against the rest of the library and quietly logs any real connections it finds, each with a relation and a one-sentence "because". Nae reviews the log when she wants to. Accepting a suggestion creates a real Connection. Nothing interrupts her mid-read.

## Core principle: "similar" isn't the same as "connected"
- Embedding similarity only *finds candidates*. The closest pairs are mostly near-duplicates, which aren't interesting connections.
- An LLM judges each candidate: is there a real connection, which relation is it, and what's the specific "because"?
- **No specific "because" means no suggestion.** Precision beats recall, because one bad suggestion teaches Nae to ignore the feature.
- Relations come from the Connections patch's set (connects_to, tension_with, instance_of, contradicts, evidenced_by, which Nae can trim or rename). The checker picks from whatever final set Nae approves, not a separate list.

## Flow
```
any save path ─→ ThreadNotes save ─→ connection check (async, after the save commits)
  Marginalia highlight                 1. embeddings → ~10 nearby candidates
  ThreadNotes note/excerpt             2. filter: same-source pairs, already-connected, previously dismissed
  MCP journal_add_excerpt              3. LLM judge → relation + because, or drop it
                                       4. survivors → connection log (status: new)
```
- **What gets checked (Nae, Oct 8):** excerpts, article notes (`LibraryArticle.notes`), and question notes (`ResearchNote`). Not journal entries.
- The hook lives **once**, in ThreadNotes' save path. Marginalia is only a place where results show up.
- **Resolved (Cody, Oct 8):** Marginalia saves through `/api/excerpts`, not the app's own path. But every path (`/api/data` PUT and PATCH, `/api/excerpts`, MCP) commits through `writeBlob` or `bumpRev` in `api/_blob-store.ts`. The hook goes in the shared row writers in `api/_decomposer.ts` (which `api/_ops.ts` reuses): writing a checked row also inserts a `suggestion_queue` row in the same transaction, and a drain runs the check after the commit.

## The connection log
Each entry stores: from item, to item, relation, because, created_at, status (new / accepted / dismissed).
- **Accept** creates a Connection (the Connections table from 2dd5da5b) and marks the entry accepted.
- **Dismiss:** that pair never gets suggested again, in either direction.
- **Fading:** unreviewed entries older than ~30 days drop out of the badge count but stay in the log and stay searchable. That keeps the badge from turning into guilt.
- **Same-source rule:** two excerpts from the same article are skipped, unless the judge flags a real tension or contradiction between them.

## Where the log shows up (it needs a pull moment, or it dies unread)
1. **ThreadNotes badge:** "4 new connections", a count next to Questions in the sidebar, which opens the log. (Placement from UX audit 35eccf07.)
2. **Marginalia, on "Finished reading":** "3 highlights from this paper connect to your notes." This view reads from the log, so it isn't a separate system, and skipping it loses nothing. Marginalia has no "close a paper" event today. The audit found that, and the Finished reading button (Marginalia patch 981acac9) is the moment this hangs on.
3. **Question page:** accepted suggestions are Connections, so they show on the question with their "because" (see 2dd5da5b).
3. *(Later, maybe)* a weekly roundup, and a small "you've seen this idea before" marker in Marginalia's margin that only opens when tapped and never pops up on its own.

## Consistency with the Vertex rule
The Connections patch carries over Vertex's rule: Claude never adds a connection on its own initiative. This design keeps that rule. Suggestions are proposals sitting in a log, and **only Nae's accept creates a Connection.** Nae should confirm she reads the rule the same way.

## Open questions
- Does ThreadNotes already have an embeddings or LLM call path? "Ask the pile" (T1) needs one too, so they should share it.
- Cost model: whose API key do the judge calls run on? That decides how aggressive the per-save check can be (candidate count, which model).
- Backfill: when the feature first ships, should it run once over the existing library, or only on new saves? *Coru's lean: new saves first, with backfill as a separate opt-in run, so the first log isn't 200 entries.*

## Sequencing
- Connections (2dd5da5b) has to exist first, because accepted suggestions become Connections.
- That patch is designed into the UX audit (35eccf07), and the audit is on hold until Marginalia's reading room ships. Where the log and badge appear should come out of that same audit.
