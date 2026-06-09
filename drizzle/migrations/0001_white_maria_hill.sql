ALTER TABLE "article_question_links" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_tags" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "excerpts" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "excerpts" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_tags" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_articles" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "library_articles" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "research_notes" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "research_notes" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "user_sources" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "user_sources" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_excerpts_article_client" ON "excerpts" USING btree ("article_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_journal_entries_project_client" ON "journal_entries" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_library_articles_project_client" ON "library_articles" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_projects_user_client" ON "projects" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_questions_theme_client" ON "questions" USING btree ("theme_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_research_notes_question_client" ON "research_notes" USING btree ("question_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_themes_project_client" ON "themes" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_sources_question_client" ON "user_sources" USING btree ("question_id","client_id");