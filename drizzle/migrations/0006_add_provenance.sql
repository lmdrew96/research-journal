-- Who an idea originated with. Nullable with NO default on purpose: unset means
-- "not recorded", and a default would silently attribute ideas to the wrong
-- person. A NULL passes the CHECK, so existing rows are untouched.
ALTER TABLE "questions" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "question_provenance_values" CHECK ("questions"."provenance" IN ('nae','coru','convergent','external'));--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypothesis_provenance_values" CHECK ("hypotheses"."provenance" IN ('nae','coru','convergent','external'));--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "study_provenance_values" CHECK ("studies"."provenance" IN ('nae','coru','convergent','external'));--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decision_provenance_values" CHECK ("decisions"."provenance" IN ('nae','coru','convergent','external'));
