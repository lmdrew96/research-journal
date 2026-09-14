-- "Key source" becomes a flag, separate from reading progress, so an article
-- can be both Reading and a key source. It used to be a fourth status value.
--
-- No data is converted here. Rows still holding status 'key-source' are read
-- as status 'to-read' + flag by the recomposer (Nae chose To Read for existing
-- key sources, 2026-09-13), and scripts/backfill-key-source.mts rewrites them
-- through the app's write path so the blob backup and the tables move
-- together. The status CHECK keeps admitting 'key-source' until then.
ALTER TABLE "library_articles" ADD COLUMN "is_key_source" boolean DEFAULT false NOT NULL;
