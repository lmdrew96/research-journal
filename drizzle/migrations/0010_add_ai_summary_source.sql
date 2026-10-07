-- What an article's AI summary was generated from. Summaries used to fall back
-- to the title when no abstract was available, which produced invented
-- findings; they are now generated from the abstract only. NULL marks a
-- summary that predates this column, which the UI flags as unverified.
ALTER TABLE "library_articles" ADD COLUMN "ai_summary_source" text;
ALTER TABLE "library_articles" ADD CONSTRAINT "article_ai_summary_source_values"
  CHECK ("ai_summary_source" IN ('abstract','full-text'));
