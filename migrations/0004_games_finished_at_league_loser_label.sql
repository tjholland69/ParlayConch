ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "loser_label" text DEFAULT 'parlay_loser';--> statement-breakpoint
ALTER TABLE "weeks" ALTER COLUMN "is_active" SET DEFAULT false;
