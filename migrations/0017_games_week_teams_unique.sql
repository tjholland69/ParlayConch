DROP INDEX "games_week_teams_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "games_week_teams_idx" ON "games" USING btree ("week_id","home_team","away_team");