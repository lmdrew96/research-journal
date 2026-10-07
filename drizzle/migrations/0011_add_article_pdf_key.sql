-- R2 object key of an uploaded article PDF ({userId}/{uuid}.pdf). The PDF
-- itself lives in R2, reached through short-lived signed URLs; this column only
-- links an article to it. Nullable: most articles have no uploaded PDF.
ALTER TABLE "library_articles" ADD COLUMN "pdf_key" text;
