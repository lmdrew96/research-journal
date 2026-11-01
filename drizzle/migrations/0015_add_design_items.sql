-- Study design, split out of the one markdown block into items (Framework,
-- Participants, Materials, Measures, Procedure steps, Variables, Response
-- cleaning, Analysis). Purely additive: the old studies.design text stays as the
-- archived snapshot, and code that predates this reads none of it.
CREATE TABLE "design_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"client_id" text,
	"kind" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"superseded_by" uuid,
	"provenance" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_item_kind_values" CHECK ("design_items"."kind" IN ('framework','participants','material','measure','step','variable','cleaning','analysis')),
	CONSTRAINT "design_item_status_values" CHECK ("design_items"."status" IN ('open','settled','superseded')),
	CONSTRAINT "design_item_provenance_values" CHECK ("design_items"."provenance" IN ('nae','coru','convergent','external'))
);
--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_superseded_by_design_items_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."design_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_design_items_study" ON "design_items" USING btree ("study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_design_items_study_client" ON "design_items" USING btree ("study_id","client_id");--> statement-breakpoint
-- What the Procedure total is held against. NULL = not set.
ALTER TABLE "studies" ADD COLUMN "target_session_minutes" double precision;--> statement-breakpoint
-- A decision about one design item (the cue count on the cue list).
ALTER TABLE "decisions" ADD COLUMN "design_item_id" uuid;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_design_item_id_design_items_id_fk" FOREIGN KEY ("design_item_id") REFERENCES "public"."design_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Design items can be connection endpoints (Variable → Measure, Measure → article).
ALTER TABLE "connections" DROP CONSTRAINT "connection_from_type_values";--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "connection_to_type_values";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connection_from_type_values" CHECK ("connections"."from_type" IN ('article','excerpt','question','hypothesis','theme','study','design_item'));--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connection_to_type_values" CHECK ("connections"."to_type" IN ('article','excerpt','question','hypothesis','theme','study','design_item'));
