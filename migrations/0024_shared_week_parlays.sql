-- A league's parlay is one shared ticket that every member adds a pick to, and
-- a league can run several a week, so one member may start more than one.
DROP INDEX IF EXISTS "parlays_user_league_week_uidx";--> statement-breakpoint
-- 0000 already created this index and nothing dropped it since, so it exists
-- on every database that ran the migrations in order.
CREATE INDEX IF NOT EXISTS "parlays_user_league_week_idx" ON "parlays" USING btree ("user_id","league_id","week_id");
