ALTER TABLE "parlay_legs" ADD COLUMN "decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "decided_play_desc" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "decided_quarter" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "decided_clock" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "decided_confidence" text DEFAULT 'final';