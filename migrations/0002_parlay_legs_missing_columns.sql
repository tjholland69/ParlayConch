ALTER TABLE "parlay_legs" ADD COLUMN IF NOT EXISTS "odds" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN IF NOT EXISTS "game_segment" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN IF NOT EXISTS "enrichment_log" text;
