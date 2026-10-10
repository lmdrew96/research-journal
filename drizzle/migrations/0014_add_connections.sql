-- Connections: typed "because" edges between items in one project (Vertex,
-- folded in). Endpoints are client ids with a type rather than foreign keys,
-- since an end can be any of six tables; writers cascade them by hand.
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" text,
	"from_type" text NOT NULL,
	"from_id" text NOT NULL,
	"to_type" text NOT NULL,
	"to_id" text NOT NULL,
	"relation" text NOT NULL,
	"because" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_from_type_values" CHECK ("connections"."from_type" IN ('article','excerpt','question','hypothesis','theme','study')),
	CONSTRAINT "connection_to_type_values" CHECK ("connections"."to_type" IN ('article','excerpt','question','hypothesis','theme','study')),
	CONSTRAINT "connection_relation_values" CHECK ("connections"."relation" IN ('connects_to','tension_with','instance_of','contradicts','evidenced_by'))
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_connections_project_client" ON "connections" USING btree ("project_id","client_id");
