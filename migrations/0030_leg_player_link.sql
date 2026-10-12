ALTER TABLE "parlay_legs" ADD COLUMN "player_id" integer;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlay_legs_player_id_idx" ON "parlay_legs" USING btree ("player_id");--> statement-breakpoint
-- The player a prop's typed name belongs to: the only player with that name,
-- or, when several share it, the only one on either team in the leg's game.
-- Null when the name is unknown or still can't be told apart. Names compare
-- the way player search does: lower case, punctuation dropped.
CREATE OR REPLACE FUNCTION leg_player_id(p_name text, p_game_id integer) RETURNS integer
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH wanted AS (
    SELECT regexp_replace(lower(btrim(p_name)), '[^a-z0-9 ]', '', 'g') AS name
  ), matches AS (
    SELECT p.id, p.team
    FROM players p, wanted w
    WHERE w.name <> ''
      AND w.name IN (
        regexp_replace(lower(p.name), '[^a-z0-9 ]', '', 'g'),
        regexp_replace(lower(coalesce(p.display_name, p.name)), '[^a-z0-9 ]', '', 'g')
      )
  ), in_game AS (
    SELECT m.id
    FROM matches m
    JOIN teams t ON upper(t.abbreviation) = upper(m.team)
    JOIN games g ON g.id = p_game_id AND t.nickname IN (g.home_team, g.away_team)
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM matches) = 1 THEN (SELECT id FROM matches)
    WHEN (SELECT count(*) FROM in_game) = 1 THEN (SELECT id FROM in_game)
  END
$$;
--> statement-breakpoint
-- Keeps parlay_legs.player_id in step with player_name on every write, so
-- no code path that saves a leg has to remember to. An id handed in
-- explicitly is left alone.
CREATE OR REPLACE FUNCTION parlay_legs_link_player() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.bet_type IS DISTINCT FROM 'player_prop' OR NEW.player_name IS NULL THEN
    NEW.player_id := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.player_id IS NULL THEN
      NEW.player_id := leg_player_id(NEW.player_name, NEW.game_id);
    END IF;
  ELSIF NEW.player_id IS NOT DISTINCT FROM OLD.player_id AND (
    NEW.player_name IS DISTINCT FROM OLD.player_name
    OR NEW.game_id IS DISTINCT FROM OLD.game_id
    OR NEW.bet_type IS DISTINCT FROM OLD.bet_type
  ) THEN
    NEW.player_id := leg_player_id(NEW.player_name, NEW.game_id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER parlay_legs_link_player
BEFORE INSERT OR UPDATE ON parlay_legs
FOR EACH ROW EXECUTE FUNCTION parlay_legs_link_player();
--> statement-breakpoint
-- Link the props already on file.
UPDATE parlay_legs
SET player_id = leg_player_id(player_name, game_id)
WHERE bet_type = 'player_prop' AND player_name IS NOT NULL;
