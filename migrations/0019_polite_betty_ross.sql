ALTER TABLE "players" ADD COLUMN "espn_id" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_espn_id_unique" UNIQUE("espn_id");