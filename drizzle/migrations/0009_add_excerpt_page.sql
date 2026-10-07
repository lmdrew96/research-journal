-- An optional page reference on excerpts, so a reader that knows where a
-- highlight sits (Marginalia) can record it instead of packing it into the
-- comment. Nullable with no default: existing excerpts simply have no page.
ALTER TABLE "excerpts" ADD COLUMN "page" integer;
