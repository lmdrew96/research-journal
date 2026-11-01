# ThreadNotes — Reframe: "Where research chats land" (spec draft, Oct 31, 2026)

Status: **core direction and new structure agreed with Nae (Oct 31). Filed** as ThreadNotes patch ad74e716 (Reframe), plus related patches listed at the bottom.

See also: `docs/threadnotes-studies-design-spec.md` (Studies structured Design, Oct 31).

## Why
Nae doesn't use most of ThreadNotes. Snapshot on Oct 31, ADHD project only: 6 articles, 21 excerpts, **0 notes, 0 journal entries, 0 active questions across 5 themes**, and 9 nav sections. Across all 4 projects (Random SLA/CALL, Linguistics, ADHD, Latin) there are 59 articles.

In her words, it has too many places to click, she opens it and doesn't know what to do, and it doesn't match how she researches.

How she actually researches: her thinking about sources happens **in chats with Coru**. Then it gets lost, or it gets mixed in with Coru's ideas. She also writes short thoughts as **excerpt comments in Marginalia** (e.g., on Prior et al. 2014: "I feel like the basis of my senior thesis study could come from this."), and the dashboard doesn't count or show those at all.

What she wants back from it: **all three** of help writing the thesis, seeing connections between sources, and remembering what she read.

## Core (agreed)
**ThreadNotes stops being a place you go to think and becomes the place your thinking lands.**
- Thinking keeps happening in chat. ThreadNotes collects it.
- **Every saved thought is labeled with where it came from**, reusing the existing **Origin** values (already on Studies, hypotheses, decisions and questions): Nae / Coru / Both, independently / Outside source. In conversation this reads as Nae, Coru, or Nae ← Coru (Coru proposed it and Nae took it on).
- This fixes the "mixed in with your ideas" problem and keeps her thesis thinking hers.

## The loop (agreed)
```
Marginalia (read + highlight) → chat with Coru (think together) → harvest → ThreadNotes (keep)
```

### Input end: reading together
This works today with no build needed:
1. Nae reads and highlights in Marginalia.
2. Highlights sync to ThreadNotes as excerpts, with the quote, page number, source "marginalia", and an optional comment.
3. In chat, Nae says "look at my [paper] highlights." Coru pulls them with `journal_get_article` and they talk about them.

Verified Oct 31: Coru pulled the Hamada (2014) p. 10 highlight through the MCP.

What Coru can't see yet:
- **The full paper.** A PDF is stored (`pdfKey`), but there's no MCP tool to read it, so Coru only sees the highlighted parts and the abstract. Filed as patch e41c518f.
- **Anything live.** Coru only sees highlights when asked. That's fine; "come tell me what you read" is the intended trigger.

Small habit, Coru's suggestion: a 2–3 word comment on a highlight ("wait, really?", "ADHD angle?") tells Coru *why* Nae highlighted it. Optional; she already does this sometimes.

### Output end: harvest (decided Oct 31)
- **Coru offers the harvest** at the end of any chat about research sources ("I will forget"). Nae can always decline. This is saved as a project instruction for Coru.
- Coru lists the thoughts with their labels. Nae taps keep or toss. Only what she keeps gets saved.
- No in-app trigger is needed for v1. What matters is an MCP batch-harvest tool.

## New structure (decided Oct 31)
Nav goes from **9 items to 5: What I think · Sources · Threads · Studies · Search.**

| Today | Becomes | Notes |
|---|---|---|
| Questions | **Threads** | One concept: an idea that runs across sources and fills up from harvests. The 21 existing questions migrate. Hypothesis → question links become hypothesis → thread. |
| Themes | a label on Threads | A grouping, not its own page. |
| Journal | **retired** | It has 0 entries; harvested thoughts replace it. Migrate any entries into thoughts. |
| Library | **Sources** | Each source page shows excerpts, excerpt comments and harvested thoughts together. |
| Studies | stays | Already in real use. See the Studies Design spec. |
| Dashboard | **What I think so far** | Current thinking plus the study's open decisions. Absorbs the Dashboard patch (43d887a3). |
| Export | moves under Settings | Rarely needed. |

## Audit findings (Oct 31, Coru clicked through every section in the built-in browser)

### ⚠️ Possible data-loss bug in sync (hypothesis, filed HIGH as 1c904d85)
- The console on load shows whole-dataset last-write-wins: `Remote ... lastModified X` vs `Local ... lastModified Y`, then "Using local data, pushing to Neon."
- After adopting remote data, the local `lastModified` is set to **now**, not to the remote's timestamp. Just browsing also bumps it: Export showed "Last modified 10:48 PM" after view-only clicks and searches.
- **Risk:** a ThreadNotes tab left open can look "newer" than a Marginalia highlight or MCP write made in the meantime. On reload it would push its stale copy and **overwrite the newer write**.
- **Interim workaround:** reload ThreadNotes after highlighting in Marginalia, and don't keep an old tab open while highlighting.

### UX (filed)
1. The dashboard leaves out what Nae uses: no Studies, no excerpt comments, and an unclear "0/5 questions active" label. *(43d887a3, now folded into "What I think so far")*
2. Overlapping concepts: Notes vs. Journal vs. excerpt comments; Sources vs. Linked Articles; Related Questions vs. Connections. *(Mostly resolved by the new structure.)*
3. The question page has 9 sub-sections, mostly empty; the article page has 8 header buttons, with Delete next to Edit. *(3d58badd)*
4. Loading a page directly shows a blank screen for a few seconds. *(714aa9d3)*
5. The project switcher may also change the MCP's active project. *(investigate: 97560d09)*

### Small bugs (batched in f950a9f7)
Journal heading says "ThreadNotes" and its button says "Save Note"; the study card title has a gray box behind it; search snippets show the title instead of the matched comment; Settings still says "ThreadBrain"; "Planned" appears twice on the study page.

### Works well
Search across notes and studies; Library filters and sorting; Export; "Read in Marginalia" links; mobile layout; Origin labels on study items.

## Decided Nov 1 (Nae)
- **Build order:** slice 1 is thoughts plus Coru's batch harvest (shipped v0.73.0), slice 2 is the new nav (shipped v0.74.0), slice 3 is "What I think so far" (shipped v0.75.0).
- **Slice 2 calls (Nae, Nov 1):** the 6 Linguistics journal entries are copied into thoughts linked to their thread, tags kept as a last line, origin not recorded, with the stored entries kept as a hidden backup. The four journal-entry MCP tools are removed. Threads is one flat list with the theme as a label and label filter pills; in the app, themes are called labels.
- **Questions → Threads is renamed in the app only.** The data and the `journal_*` question tools stay as they are; only descriptions change.
- **"What I think so far" is grouped by thread:** open decisions on top, then each thread with its latest thoughts and excerpt comments, then Unthreaded.
- After the Reframe comes the graph view (style spec first). Suggestions stay parked. Cloudflare gets its own session.
- **Tangle boundary (default, no objection):** Tangle holds Coru's hunches. ThreadNotes holds Nae's thinking, with a Coru idea saved only once she adopts it, labeled by Origin.

## Still open
- **Leftover overlaps:** Sources vs. Linked Articles, Related Questions vs. Connections. Probably collapse naturally once Threads exist.
- **Boundary with Tangle:** Tangle holds Coru's own hunches. ThreadNotes holds Nae's research thinking, including Coru ideas only after she adopts them. Is that the right line?
- **Excerpt-comment editing:** covered by patch 9e2b9b02 (the duplicate 4fef5737 was deleted Oct 31). It matters more now, since excerpt comments are where Nae writes.

## Related
- `docs/threadnotes-connection-suggestions-spec.md` (Oct 7) is **parked** (note added to patch 24658b01). Suggestions could later run on Threads.
- Earlier patches (Connections 2dd5da5b, UX audit 35eccf07) should be re-checked against this direction.
