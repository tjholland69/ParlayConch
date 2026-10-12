-- Exports one league's bets as a single JSON document, for loading into a
-- local database with import-league.sql. Read-only: it changes nothing.
--
--   psql "$PRODUCTION_DATABASE_URL" -At -f scripts/sql/export-league.sql > kirk.json
--
-- Another league:  psql ... -At -v league="Some Other League" -f ...
--
-- What comes out: the league, its memberships, its parlays and legs, and the
-- weeks and games those legs point at. Of each person only an id, first name
-- and display name are exported. Emails, passwords, phone numbers and the
-- rest of their settings never leave production.

\if :{?league}
\else
  \set league 'We Are Parlay Kirk'
\endif

WITH lg AS (
  SELECT * FROM leagues WHERE name = :'league'
),
p AS (
  SELECT parlays.* FROM parlays JOIN lg ON lg.id = parlays.league_id
),
l AS (
  SELECT parlay_legs.* FROM parlay_legs JOIN p ON p.id = parlay_legs.parlay_id
),
m AS (
  SELECT league_members.* FROM league_members JOIN lg ON lg.id = league_members.league_id
),
g AS (
  SELECT * FROM games WHERE id IN (SELECT game_id FROM l)
),
w AS (
  SELECT * FROM weeks WHERE id IN (SELECT week_id FROM p UNION SELECT week_id FROM g)
),
people AS (
  SELECT user_id AS id FROM m
  UNION SELECT user_id FROM p
  UNION SELECT user_id FROM l
  UNION SELECT placed_by_user_id FROM l WHERE placed_by_user_id IS NOT NULL
  UNION SELECT approval_by_user_id FROM l WHERE approval_by_user_id IS NOT NULL
)
SELECT jsonb_build_object(
  'exported_at', now(),
  'league', (SELECT to_jsonb(lg) FROM lg),
  'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM m), '[]'),
  'users', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id,
      'first_name', u.first_name,
      'display_name', u.settings->>'displayName'
    ) ORDER BY u.id)
    FROM users u WHERE u.id IN (SELECT id FROM people)), '[]'),
  'weeks', COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.season, w.week_number) FROM w), '[]'),
  'games', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM g), '[]'),
  'parlays', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM p), '[]'),
  'legs', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM l), '[]')
)
WHERE (SELECT count(*) FROM lg) = 1;
-- No output means the name matched no league, or more than one.
