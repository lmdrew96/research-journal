-- Where an article's metadata came from: 'crossref' / 'openalex' (a search
-- provider) or 'manual' (typed in). Nullable so this can land before the
-- backfill; a NULL passes the CHECK.
--
-- Existing rows are NOT backfilled here. That runs through the app's write
-- path (scripts/backfill-article-source.mts) so the blob backup and the
-- relational tables move together. Its heuristic, for the record — these
-- values are inferred, not recorded: DOI and URL both present -> 'crossref',
-- otherwise 'manual'.
ALTER TABLE "library_articles" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "library_articles" ADD CONSTRAINT "article_source_values" CHECK ("library_articles"."source" IN ('crossref','openalex','manual'));
