CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"actor_user_id" varchar,
	"target_type" varchar(50),
	"target_id" varchar(100),
	"success" boolean DEFAULT true NOT NULL,
	"status_code" integer,
	"ip" varchar(64),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events"
	ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk"
	FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_event_type_idx" ON "audit_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");