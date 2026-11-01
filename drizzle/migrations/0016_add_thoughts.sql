-- Thoughts: what Nae thinks, mostly harvested from chats with Coru, each with
-- who it came from (provenance). Purely additive — code that predates this
-- reads none of it. Links to articles and questions are join tables, like
-- article_question_links; the study link is a nullable FK.
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" text,
	"text" text DEFAULT '' NOT NULL,
	"provenance" text,
	"study_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thought_provenance_values" CHECK ("thoughts"."provenance" IN ('nae','coru','convergent','external'))
);
--> statement-breakpoint
CREATE TABLE "thought_articles" (
	"thought_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "thought_articles_thought_id_article_id_pk" PRIMARY KEY("thought_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "thought_questions" (
	"thought_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "thought_questions_thought_id_question_id_pk" PRIMARY KEY("thought_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_articles" ADD CONSTRAINT "thought_articles_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_articles" ADD CONSTRAINT "thought_articles_article_id_library_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."library_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_questions" ADD CONSTRAINT "thought_questions_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_questions" ADD CONSTRAINT "thought_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_thoughts_project_client" ON "thoughts" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_thought_articles_by_article" ON "thought_articles" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "idx_thought_questions_by_question" ON "thought_questions" USING btree ("question_id");
