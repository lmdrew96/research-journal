# ThreadNotes — Studies: Structured Design (spec draft, Oct 31, 2026)

Status: **direction agreed with Nae (Oct 31).** The proposed shape is Coru's. Nae confirmed the three pain points and **likes the gap warnings**. **Filed Oct 31** as three ThreadNotes patches: 78a76f40 (sections + structure), 1852da27 (settled/open + decisions), 1a060cc9 (Gaps panel).

Related: `docs/threadnotes-reframe-spec.md`. Studies is the one ThreadNotes section Nae actually uses as a living thesis doc, so this improves something that already works rather than replacing it. Under the reframe, Questions become **Threads**, so "Question" below means Thread once that lands.

## Problem
Today, a study's **Design is one markdown block with one Edit button.** Framework, Participants, Session, Variables, Response cleaning and Analysis are only headings inside that text.

Nae's pain points (picked Oct 31):
1. **One big text blob:** hard to edit or scan one part at a time.
2. **Can't tell settled from open:** Decisions and Design don't know about each other. Live example: "20–30 A1–A2 cues" is an **open decision** and is also written into Design/Session as if it were settled.
3. **Pieces aren't connected:** variables, measures, hypotheses and sources live separately.

Not a goal: matching the format of a methods section or IRB application. Sections follow how Nae thinks about the study. **Export** can produce a methods-style document later.

## 1. Sections, edited one at a time
Each section is its own card with its own Edit button. All sections are optional, so an empty one just collapses:

| Section | Shape |
|---|---|
| **Framework** | Short text, plus linked key sources from the Library (e.g., White & Shah 2016) |
| **Participants** | Fields: population, proficiency range, languages, inclusion/exclusion criteria, target N |
| **Materials** | Stimuli and items, e.g. the L2 cue list (count, level, how they were chosen) *(decided Oct 31: separate from Measures)* |
| **Measures** | One card per instrument: name, what it measures, scoring notes, linked Library source(s) |
| **Procedure** | Ordered steps, each with a duration in minutes, and an **automatic total** compared against the study's target session length (e.g., 40 min) |
| **Variables** | A table: name, role (predictor / outcome / moderator / covariate), produced by which Measure, tests which Hypothesis |
| **Response cleaning** | Text, with optional links to Measures |
| **Analysis** | Text, plus a link to each Hypothesis it tests (H1 = main effect, H2 = interaction) |

**Revision history (decided Oct 31: yes):** design items keep version history the same way hypotheses do ("Revise (new version)").

## 2. Settled vs. open, shown where it applies
- Every section, and every item inside it (a step, material, variable or measure), has a status: 🟢 **settled** or 🟡 **open**.
- A **Decision is attached to the item it decides** (e.g., "cue count" → Materials: cue list).
- Open decisions appear **inside the section they affect**, as well as in the Decisions list.
- **Settling a decision updates its item:** the item goes to 🟢, and its value can be filled from the decision's outcome. A design item can't show as settled while a decision attached to it is still open.
- An item with an open decision attached shows 🟡, even if text has been written for it.

## 3. Explicit connections
```
Question/Thread ──→ Hypothesis ──→ Variable ──→ Measure ──→ Source (Library)
                                       ↑            ↑
                                    Decision     Decision
```
- Hypothesis → Question already exists. Keep it (it becomes Hypothesis → Thread under the reframe).
- New links: Variable → Hypothesis, Variable → Measure, Measure → Library source, Materials → Library source, Decision → design item.
- Keep the existing **Origin** labels (Nae / Coru / Both, independently / Outside source) on hypotheses and decisions, and extend them to design items.

## 4. Gap warnings (Nae likes this)
A small, quiet "Gaps" panel on the study page. It's only advice: no pop-ups, nothing blocks saving. Example checks:
- A hypothesis has **no outcome variable** linked to it.
- An interaction hypothesis (like H2) has **no moderator variable** linked to it.
- A variable has **no measure** that produces it.
- A measure has **no source** linked from the Library.
- **Procedure time is over the target** session length.
- A design item marked settled still has an **open decision** attached.
- A hypothesis is linked only to a broad question. For example, H1 and H2 both point at "What research findings exist on how ADHD traits affect L2 learning?" even though more specific questions exist.

Each warning links straight to the spot that needs fixing.

## Migration
The existing study ("ADHD and L2 Semantic Activation Spread") has Design text that needs splitting into sections. Suggestion: Coru drafts the split into the new fields via the MCP, Nae reviews it, and the old text stays as an archived snapshot.

## MCP
The ThreadNotes MCP will need read/write tools for design sections, materials, measures, variables and their links, plus a way to attach a Decision to a design item. Scope is for Cody.

## Decided
- **Target session length is a field on the study** (needed for the Procedure total). Confirmed by Nae, Oct 31.
