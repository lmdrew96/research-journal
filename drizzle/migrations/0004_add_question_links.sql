CREATE TABLE "question_links" (
	"question_id" uuid NOT NULL,
	"related_question_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "question_links_question_id_related_question_id_pk" PRIMARY KEY("question_id","related_question_id")
);
--> statement-breakpoint
ALTER TABLE "question_links" ADD CONSTRAINT "question_links_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_links" ADD CONSTRAINT "question_links_related_question_id_questions_id_fk" FOREIGN KEY ("related_question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_question_links_by_related" ON "question_links" USING btree ("related_question_id");
