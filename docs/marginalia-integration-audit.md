# ThreadNotes ↔ Marginalia: Integration Audit

**Date:** Oct 9, 2026 · **Versions checked:** ThreadNotes v0.63.0 (`a8631ae`), Marginalia v0.28.0 (`661da40`)

## TL;DR

- **The contract holds.** Every request Marginalia sends, ThreadNotes accepts and answers in the shape Marginalia expects. Field names, types, status codes and error cases all line up.
- **Two real bugs**, both in how the apps *use* the contract rather than in the contract itself:
  1. "Read in Marginalia" fails the first time for a paper outside the project picked in Marginalia's Papers page.
  2. A margin note that failed to reach ThreadNotes gets overwritten with the older ThreadNotes version the next time you open the paper.
- **One reliability issue:** deleting a document with many highlights often fails partway and needs a retry.
- **One feature is sent but not received yet:** ThreadNotes' new `connect` endpoint and `questions` list. Marginalia doesn't use them, but that's planned (open patch `bdea1a6c`), not a bug.

---

## How the two apps talk

Every call goes through **one ThreadNotes endpoint**, `/api/excerpts`. Marginalia calls it server-to-server with Nae's ThreadNotes API key, and the key never reaches the browser. In the other direction, ThreadNotes only sends **links** into Marginalia.

```
Marginalia server ──Bearer API key──▶ ThreadNotes /api/excerpts   (reads + writes)
ThreadNotes UI    ──plain link──────▶ Marginalia /threadnotes/open/:articleId
```

---

## Contract check: Marginalia asks → ThreadNotes answers

| # | Marginalia sends | Used for | ThreadNotes handles it? | Shapes match? |
|---|---|---|---|---|
| 1 | `GET /api/excerpts` (no project) | Checking a pasted API key; listing projects | ✅ returns `projects[]` | ✅ |
| 2 | `GET ?projectId=` | Papers list, finding one article, reading its status, checking a chosen project | ✅ returns `project`, `articles[]` (with signed `pdfUrl`), `projects[]`; 404 for a trashed or missing project | ✅ |
| 3 | `GET ?articleId=` | Finding excerpts deleted in ThreadNotes; pulling comment edits | ✅ returns `excerpts[] {id, quote, comment, page}`; 404 (never `[]`) for a missing article | ✅ |
| 4 | `POST ?projectId=` `{quote, comment?, page, articleId, client:"marginalia"}` | Highlight → excerpt | ✅ returns `{excerptId, created, duplicate?, error?}` | ✅ Marginalia treats a 200 with `error` as a failure, which is correct |
| 5 | `PATCH ?excerptId=` `{comment}` or `{comment, page}` | Margin note edits | ✅ | ✅ |
| 6 | `PATCH ?articleId=` `{status}` | "reading" on open, "done" from Finished reading | ✅ keeps the legacy key-source flag | ✅ |
| 7 | `DELETE ?excerptId=` | Deleting a highlight or a document | ✅ also removes connections to that excerpt | ✅ Marginalia counts a 404 as already deleted |

**Auth and errors:** 401/403 → Marginalia says "update your key in Settings". 404 on a project → Marginalia forgets the saved project. 409 (write conflict) and 429 (rate limit) → generic "try again". All handled.

## Contract check: ThreadNotes sends → Marginalia receives

| # | ThreadNotes sends | Marginalia receives? |
|---|---|---|
| 8 | "Read in Marginalia" link (article page) and "Continue reading in Marginalia" (dashboard) → `/threadnotes/open/:articleId` | ✅ The route exists, signs in first if needed, and returns to the link after. ⚠️ See Bug 1. |
| 9 | `POST ?action=connect` (excerpt → question/article/… with a "because") | ❌ Not used yet. **Planned:** Marginalia patch `bdea1a6c` (open, low priority). |
| 10 | `questions[]` in the `GET ?projectId=` response | ❌ Ignored, since its only use is as targets for #9. Arrives with that patch. |
| 11 | Excerpt comment edited in ThreadNotes | ✅ Pulled onto the margin note when the paper is opened. ⚠️ See Bug 2. |
| 12 | Excerpt deleted in ThreadNotes | ✅ Marginalia flags the highlight and lets Nae re-add it, remove it, or keep it local-only. |

Intentionally **not** synced, both reasonable: highlight colors (Marginalia-only), and quote/page edits made in ThreadNotes (a highlight's position belongs to its page, so moving it would put it in the wrong place).

---

## Findings

### 🔴 Bug 1: "Read in Marginalia" only works inside one project

**What happens:** Marginalia's Papers page has one chosen ThreadNotes project. When a paper is opened from a link, `resolveArticle` (`marginalia/src/lib/threadnotes.ts:320`) only looks in that project. ThreadNotes shows the "Read in Marginalia" button on articles in **every** project.

**Result:** Say Marginalia is set to project A and you click "Read in Marginalia" on a paper in project B. You get *"That paper isn't in your ThreadNotes project."* Papers already opened once still work, because that lookup is by article id alone. The "Upload PDF" fallback uses `resolveArticle` too, so it fails the same way.

**Fix (recommended):** have ThreadNotes' `GET ?articleId=` also return the article's `projectId`, `title`, `status`, `oaUrl` and `pdfUrl` alongside its excerpts. It already searches every live project. Then `resolveArticle` makes one call with no project needed. This also fixes Suggestion 1 below.

### 🔴 Bug 2: A failed margin-note save gets overwritten

**What happens:**
1. You edit a margin note. Marginalia saves it locally, then pushes it to ThreadNotes.
2. The push fails (ThreadNotes down, timeout, 409). You see *"Saved here, but ThreadNotes didn't get it. Add or edit its note to retry."*
3. You reopen the paper. `pullComments` (`marginalia/src/app/api/documents/[id]/threadnotes-orphans/route.ts:87`) sees the two comments differ and assumes "ThreadNotes wins". It **replaces your newer note with the old one.**

The code comment assumes the two only differ after an edit in ThreadNotes. A failed push breaks that assumption.

**Fix (recommended):** mark a highlight "unsynced" when its push fails and clear the mark when one succeeds. On open, push unsynced highlights instead of pulling over them. That's one boolean column in Marginalia plus a few lines.

### 🟡 Issue 3: Deleting a document with many highlights fails partway

**What happens:** Deleting a Marginalia document sends a `DELETE` for every excerpt **at the same time** (`Promise.all`, `marginalia/src/app/api/documents/[id]/route.ts:67`). In ThreadNotes, each delete is a full read-modify-write on the same data, guarded against conflicts and given 3 attempts. With 10+ parallel deletes, some run out of attempts and return 409.

**Result:** *"Couldn't remove its excerpts from ThreadNotes. Try again."* with some excerpts deleted and some not. Clicking again finishes the job, because already-gone excerpts count as deleted, so no data is lost. It's just flaky, and a big document can burn a noticeable chunk of the 500-requests-an-hour limit.

**Fix (recommended):** delete one at a time with a `for` loop. It's a one-line change, and the race goes away. (A batch-delete endpoint would be faster, but it isn't needed at Nae's scale.)

### 🟢 Suggestion 1: Status checks do far more work than they need to

Reading one paper's status (`threadnotes-status` GET) fetches the **whole project library** and signs a PDF link for every article that has one, just to read a single field. Opening a paper does the same through `resolveArticle`. The richer `GET ?articleId=` from Bug 1 fixes both.

### 🟢 Suggestion 2: Small type drift in Marginalia

`ThreadNotesLibrary.project` is typed as always present, but ThreadNotes can send `null` (only for pre-v4 data, which Nae's account isn't). `questions` is missing from the type too. Neither causes a bug today. Worth tidying when the connect patch adds `questions`.

### 🟢 Suggestion 3: Put Marginalia's exact calls into ThreadNotes' smoke test

`scripts/smoke-excerpts.mts` already covers `client: "marginalia"` and PATCHing `page`. If Bug 1's fix changes `GET ?articleId=`, add a check that an article in a **non-active** project resolves with its `projectId`. That is the case that breaks today.

---

## What's working well

- Errors are never mistaken for empty data: a missing article returns 404, never `[]`, so Marginalia never wrongly reads it as "every excerpt was deleted".
- Duplicate-safe excerpt creation: if linking the excerpt fails, Marginalia deletes it, so retries never stack up duplicates.
- Deletes happen in ThreadNotes first, so a failure leaves both copies in place to retry.
- Every ThreadNotes write goes through `guardedWrite`, so Marginalia can't overwrite the app's or the MCP's changes.
- Every excerpt delete also removes its connections, so nothing is left pointing at a deleted excerpt.
- PDF downloads are protected against server-side request tricks (SSRF) on every redirect, and signed URLs are never logged.

## Suggested order

| Priority | Item | Where | Size |
|---|---|---|---|
| 1 | Bug 2: unsynced flag on margin notes | Marginalia | Small (1 column, ~20 lines) |
| 2 | Bug 1 + Suggestion 1: richer `GET ?articleId=` | ThreadNotes endpoint, then Marginalia `resolveArticle` + status route | Small–medium, across both repos |
| 3 | Issue 3: delete excerpts one at a time | Marginalia | One line |
| — | Connect from margin notes | Marginalia patch `bdea1a6c` | Already filed |
