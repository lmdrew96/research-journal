CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"design" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_status_values" CHECK ("studies"."status" IN ('planned','in_progress','collecting','analyzing','complete','abandoned'))
);
--> statement-breakpoint
CREATE TABLE "hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"client_id" text,
	"label" text,
	"statement" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"superseded_by" uuid,
	"question_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hypothesis_status_values" CHECK ("hypotheses"."status" IN ('active','superseded','retired'))
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"client_id" text,
	"hypothesis_id" uuid,
	"decision" text NOT NULL,
	"alternatives_rejected" text,
	"rationale" text,
	"status" text DEFAULT 'open' NOT NULL,
	"superseded_by" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_status_values" CHECK ("decisions"."status" IN ('open','settled','superseded'))
);
--> statement-breakpoint
CREATE TABLE "study_questions" (
	"study_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "study_questions_study_id_question_id_pk" PRIMARY KEY("study_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_superseded_by_hypotheses_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."hypotheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_superseded_by_decisions_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_studies_project_status" ON "studies" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_studies_project_client" ON "studies" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_hypotheses_study" ON "hypotheses" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "idx_hypotheses_question" ON "hypotheses" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_hypotheses_study_client" ON "hypotheses" USING btree ("study_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_decisions_study_status" ON "decisions" USING btree ("study_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_decisions_study_client" ON "decisions" USING btree ("study_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_study_questions_by_question" ON "study_questions" USING btree ("question_id");
