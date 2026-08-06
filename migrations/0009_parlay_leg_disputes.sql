CREATE TABLE IF NOT EXISTS "parlay_leg_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"parlay_leg_id" integer NOT NULL,
	"raised_by_user_id" varchar NOT NULL,
	"reason_type" text NOT NULL,
	"justification" text NOT NULL,
	"screenshot_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes"
	ADD CONSTRAINT "parlay_leg_disputes_parlay_leg_id_parlay_legs_id_fk"
	FOREIGN KEY ("parlay_leg_id") REFERENCES "public"."parlay_legs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes"
	ADD CONSTRAINT "parlay_leg_disputes_raised_by_user_id_users_id_fk"
	FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes"
	ADD CONSTRAINT "parlay_leg_disputes_resolved_by_user_id_users_id_fk"
	FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parlay_leg_disputes_leg_id_idx" ON "parlay_leg_disputes" USING btree ("parlay_leg_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parlay_leg_disputes_status_idx" ON "parlay_leg_disputes" USING btree ("status");