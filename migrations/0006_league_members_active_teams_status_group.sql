CREATE TABLE IF NOT EXISTS "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"abbreviation" text NOT NULL,
	"full_name" text NOT NULL,
	"city" text NOT NULL,
	"nickname" text NOT NULL,
	"conference" text,
	"division" text,
	"stadium_name" text,
	"stadium_type" text,
	"is_turf" boolean,
	"owner" text,
	"head_coach" text,
	"primary_color" text,
	"secondary_color" text,
	"logo_url" text,
	CONSTRAINT "teams_abbreviation_unique" UNIQUE("abbreviation")
);
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN IF NOT EXISTS "start_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN IF NOT EXISTS "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN IF NOT EXISTS "purged_at" timestamp;--> statement-breakpoint
-- Backfill start_date from the existing joinedAt for pre-existing rows.
UPDATE "league_members" SET "start_date" = "joined_at" WHERE "joined_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_members_league_active_idx" ON "league_members" USING btree ("league_id","is_active");--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "hero_label" text DEFAULT 'parlay_hero';--> statement-breakpoint
-- statusGroup is derived from status and never written by the app; STORED so it
-- can be indexed/filtered directly like any other column.
ALTER TABLE "parlays" ADD COLUMN IF NOT EXISTS "status_group" text GENERATED ALWAYS AS (
	CASE
		WHEN "status" IN ('approved', 'pending') THEN 'open'
		WHEN "status" IN ('win', 'loss', 'rejected', 'push') THEN 'closed'
		WHEN "status" = 'void' THEN 'void'
		ELSE NULL
	END
) STORED;
