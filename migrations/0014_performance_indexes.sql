-- Performance indexes (Phase B audit)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS players_name_trgm_idx ON players USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS players_display_name_trgm_idx ON players USING gin (display_name gin_trgm_ops);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS player_week_stats_player_season_week_uidx
  ON player_week_stats (player_id, season, week);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS weeks_season_week_uidx
  ON weeks (season, week_number);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS parlays_status_idx ON parlays (status);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS parlays_league_status_idx ON parlays (league_id, status);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS parlay_legs_odds_enriched_idx
  ON parlay_legs (odds_enriched) WHERE odds_enriched = false;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS games_week_teams_idx
  ON games (week_id, home_team, away_team);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
