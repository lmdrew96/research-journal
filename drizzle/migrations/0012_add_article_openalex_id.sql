-- OpenAlex work id (W…) of a library article, the handle for its citation
-- trail (references and cited-by). Nullable: set on OpenAlex matches and by
-- scripts/backfill-openalex-id.mts; DOI-less works OpenAlex doesn't know stay NULL.
ALTER TABLE "library_articles" ADD COLUMN "openalex_id" text;
