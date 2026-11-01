-- Who an excerpt's comment came from. Nullable with NO default, like the other
-- provenance columns (0006): unset is not a guess stored as fact. The app shows
-- a default by source when it is unset. A NULL passes the CHECK, so existing
-- rows are untouched.
ALTER TABLE "excerpts" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "excerpts" ADD CONSTRAINT "excerpt_provenance_values" CHECK ("excerpts"."provenance" IN ('nae','coru','convergent','external'));
