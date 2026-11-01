# Changelog

What changed in each version of ThreadNotes, newest first. Patch versions are fixes, minor versions are new features.

## v0.76.0 — 2026-11-01

- Excerpt comments show who they came from, and you can change it when you edit the comment. If you haven't set it, a comment counts as yours, unless Coru added that excerpt. Coru can set it too

## v0.75.1 — 2026-11-01

- The six thoughts that came from the Journal now carry the dates you wrote them, so What I think lists threads in the order you actually worked on them

## v0.75.0 — 2026-11-01

- What I think so far is the new home page: the decisions your studies are waiting on, then each thread with its latest thoughts and your excerpt comments, then anything not on a thread yet. The numbers at the top are for the project you're in

## v0.74.2 — 2026-11-01

- On a thread page, Research Notes now has room between it and the thoughts above

## v0.74.1 — 2026-11-01

- Editing a thought on a thread page no longer runs off the edge of the screen

## v0.74.0 — 2026-11-01

- A simpler sidebar with five places: What I think, Sources, Threads, Studies and Search. The Library is now Sources, questions are Threads (one list, with their theme as a label), each thread shows its thoughts, and Export lives at the bottom of Settings. The Journal is retired: its entries are now thoughts, and search finds thoughts

## v0.73.0 — 2026-11-01

- Thoughts: what you think about a source, each labeled with who it came from (you, Coru, both, or elsewhere). Coru can save the ones you keep at the end of a chat in one go; they show on the article's page and on the Dashboard

## v0.72.0 — 2026-11-01

- Coru can work in a chosen project for a whole chat: every MCP tool takes an optional `projectId`, and switching projects in the app no longer moves her

## v0.71.1 — 2026-11-01

- Fix the v0.71.0 deploy: the changelog file was being left out of the upload

## v0.71.0 — 2026-11-01

- The version now shows at the foot of the sidebar, and links to this What's new page

## v0.70.0 — 2026-11-01

- Quiet Gaps panel on the study page

## v0.69.0 — 2026-11-01

- Settled/open on design items, decisions attach to the item they decide

## v0.68.0 — 2026-11-01

- Split Design into sections with structured items and links

## v0.67.0 — 2026-11-01

- `journal_get_article_text` reads an article's PDF page by page

## v0.66.2 — 2026-11-01

- Marginalia excerpts link back to their highlight

## v0.66.1 — 2026-11-01

- Declutter question and article pages

## v0.66.0 — 2026-11-01

- Notice when a previous session's unsent changes couldn't be applied

## v0.65.4 — 2026-11-01

- Show a loading state instead of a blank page while auth resolves

## v0.65.3 — 2026-11-01

- Switching projects in the app changes the MCP's active project

## v0.65.2 — 2026-11-01

- Small batch — Journal heading, study card title, search snippet, API key copy, duplicate study status

## v0.65.1 — 2026-11-01

- First item in the Connect… list can be picked

## v0.65.0 — 2026-11-01

- Edit an excerpt's comment in the app and via journal_update_excerpt

## v0.64.0 — 2026-11-01

- GET /api/excerpts?articleId= returns the article's project, status and PDF links

## v0.63.3 — 2026-10-31

- Add reframe and Studies design specs

## v0.63.2 — 2026-10-31

- Decide on load by unsent changes, not timestamps

## v0.63.1 — 2026-10-10

- Add Marginalia integration audit; gitignore .env*

## v0.63.0 — 2026-10-09

- POST /api/excerpts?action=connect adds a connection from an excerpt

## v0.62.3 — 2026-10-09

- Render One section's AI text as markdown

## v0.62.2 — 2026-10-09

- Send preferences and viewState only when they change

## v0.62.1 — 2026-10-09

- Render excerpt comments as markdown

## v0.62.0 — 2026-10-09

- Typed "because" edges between library items

## v0.61.0 — 2026-10-09

- Cards say who wrote them — Marginalia, Extension, MCP

## v0.60.2 — 2026-10-09

- Centralize model strings, move Haiku calls to 5.5

## v0.60.1 — 2026-10-08

- GET /api/excerpts?articleId= returns that article's excerpts

## v0.60.0 — 2026-10-08

- Read in Marginalia, and Continue reading opens the reader

## v0.59.2 — 2026-10-08

- Polish from the UX audit

## v0.59.1 — 2026-10-08

- Render article notes as markdown

## v0.59.0 — 2026-10-08

- Move a question to Exploring when work on it starts

## v0.58.0 — 2026-10-08

- Show linked articles' excerpts on the question page

## v0.57.3 — 2026-10-08

- Add the connection suggestions spec

## v0.57.2 — 2026-10-07

- Correct the MCP tool count (53)

## v0.57.1 — 2026-10-07

- Add an article from its DOI alone

## v0.57.0 — 2026-10-07

- One section, not the paper — find what to read for a question

## v0.56.2 — 2026-10-07

- Sweep script for orphaned PDFs in R2

## v0.56.1 — 2026-10-07

- Run ESLint in the build, after clearing the existing errors

## v0.56.0 — 2026-10-07

- Set a page from the app and the MCP; export cites it

## v0.55.0 — 2026-10-07

- Ask the pile — a cited synthesis of a question's linked papers

## v0.54.0 — 2026-10-07

- Citation trail — references and cited-by from OpenAlex

## v0.53.0 — 2026-10-07

- Add journal_discover for OpenAlex paper discovery

## v0.52.0 — 2026-10-07

- Borrow abstracts from Semantic Scholar when saving articles

## v0.51.0 — 2026-10-07

- Match every word across fields, ignore diacritics, rank results

## v0.50.3 — 2026-10-07

- Open a link to an article in another project

## v0.50.2 — 2026-10-07

- Keep an excerpt's page and date on the left

## v0.50.1 — 2026-10-07

- Separate an excerpt's page from its date

## v0.50.0 — 2026-10-07

- Let callers choose the project with ?projectId=

## v0.49.1 — 2026-10-07

- Wrap the header actions on narrow screens

## v0.49.0 — 2026-10-07

- Upload article PDFs; Claude reads their metadata

## v0.48.5 — 2026-10-06

- Show a failed Regenerate's error

## v0.48.4 — 2026-10-06

- Never summarize from the title alone

## v0.48.3 — 2026-10-06

- Raise excerpts API rate limit to 500/hour per key

## v0.48.2 — 2026-10-06

- Anthropic key is server-side, not per-user

## v0.48.1 — 2026-10-06

- Require sign-in for the Anthropic proxy

## v0.48.0 — 2026-10-06

- Excerpts API covers what Marginalia's reading room needs

## v0.47.0 — 2026-09-13

- Free-version links and Open Access badges come from OpenAlex

## v0.46.1 — 2026-09-13

- Key-source backfill keeps user_settings in step

## v0.46.0 — 2026-09-13

- Make Key Source a flag, separate from reading progress

## v0.45.1 — 2026-09-13

- Tighten the Find Papers hint spacing

## v0.45.0 — 2026-09-13

- Tell a stale tab when a new version has deployed

## v0.44.0 — 2026-09-13

- Close the gaps between the MCP and the app

## v0.43.1 — 2026-09-13

- Clean abstract headings, markup and ? in lookups

## v0.43.0 — 2026-09-13

- Backfill sweep for existing article metadata

## v0.42.0 — 2026-09-13

- Look up article metadata on insert

## v0.41.0 — 2026-09-13

- Record where each article's metadata came from

## v0.40.0 — 2026-09-13

- Record who an idea originated with

## v0.39.0 — 2026-09-13

- Render GFM tables, strikethrough and task lists

## v0.38.0 — 2026-09-13

- Link a hypothesis to a research question in the app

## v0.37.0 — 2026-09-13

- Plain edit for hypotheses, separate from revision

## v0.36.0 — 2026-09-09

- Unsynced work explains itself and offers a retry

## v0.35.0 — 2026-09-09

- The client sends deltas, not whole documents

## v0.34.0 — 2026-09-09

- Clipper saves through the API, not an open app tab

## v0.33.0 — 2026-09-09

- Relational becomes the single source of truth

## v0.32.0 — 2026-09-09

- Decompose writes only what changed

## v0.31.0 — 2026-09-09

- Stop the three blob writers erasing each other

## v0.30.0 — 2026-09-09

- Give every free-text field a stated boundary

## v0.29.1 — 2026-09-09

- Stop smoke-mcp crying wolf in PROJECT TOOLS

## v0.29.0 — 2026-09-09

- Export and search know about studies

## v0.28.0 — 2026-09-09

- Widen the detail views to fit their editors

## v0.27.0 — 2026-09-09

- Render -> and <- as arrow glyphs

## v0.26.0 — 2026-09-09

- Violet grounds, saturated accents

## v0.25.0 — 2026-09-09

- Repaint both themes from new palettes

## v0.24.0 — 2026-09-09

- Studies, with revision chains you can read

## v0.23.0 — 2026-09-09

- Studies, hypotheses and decisions tools

## v0.22.0 — 2026-09-09

- Add studies, hypotheses and decisions

## v0.21.1 — 2026-09-09

- Wire up --color-star, drop three dead tokens

## v0.21.0 — 2026-09-09

- Relate questions from the question detail view

## v0.20.1 — 2026-09-09

- Unlink journal entries when a question is deleted

## v0.20.0 — 2026-09-09

- Relate research questions to each other

## v0.19.1 — 2026-09-09

- Let journal_update_question set appImplication

## v0.19.0 — 2026-09-09

- Edit and delete research questions

## v0.18.0 — 2026-09-09

- Edit and delete notes on research questions

## v0.17.0 — 2026-09-09

- Fail the build on dead CSS variable references

## v0.16.1 — 2026-09-09

- Make the mobile nav drawer opaque

## v0.16.0 — 2026-09-07

- Calibrate data-driven colours for contrast in both themes

## v0.15.2 — 2026-09-07

- Type-check and lint scripts/

## v0.15.1 — 2026-09-07

- Library card indicators no longer rely on hover

## v0.15.0 — 2026-09-07

- Soft delete for themes and projects

## v0.14.0 — 2026-09-07

- Detect the backend instead of guessing from the hostname

## v0.13.3 — 2026-09-07

- Dark mode used undefined CSS variables

## v0.13.2 — 2026-09-07

- Drop duplicate h1 on the login page

## v0.13.1 — 2026-09-07

- Text overflow, switcher clipping, landing page

## v0.13.0 — 2026-09-07

- Status live regions and real heading structure

## v0.12.0 — 2026-09-07

- Undo for every delete

## v0.11.0 — 2026-09-07

- Density, motion, and remembered view state

## v0.10.0 — 2026-09-07

- Replace hover-only icon labels with visible ones

## v0.9.1 — 2026-09-07

- Resolve the cache-owner check without writing a ref in render

## v0.9.0 — 2026-09-07

- Add journal_update_theme and journal_delete_theme

## v0.8.1 — 2026-09-07

- Clear cached user data on sign-out and account change

## v0.8.0 — 2026-09-07

- Guard destructive actions, unify empty states and icons

## v0.7.0 — 2026-09-07

- WCAG AA contrast, focus indicators, labels, keyboard access

## v0.6.0 — 2026-09-07

- Drawer navigation and touch-friendly sizing

## v0.5.0 — 2026-09-07

- Make ThreadNotes installable with offline reading

## v0.4.1 — 2026-09-07

- Decode HTML entities in imported paper metadata

Earlier history predates version numbers.
