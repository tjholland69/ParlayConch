CREATE TABLE "historical_odds_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"week_number" integer NOT NULL,
	"bucket_label" text NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_odds_snapshots_scope_idx" ON "historical_odds_snapshots" USING btree ("season","week_number","bucket_label");