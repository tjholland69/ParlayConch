-- Deletes three leftover test leagues and everything in them, keeping a
-- copy of every row it removes.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/delete-test-leagues.sql
--
-- It runs in one transaction and ENDS WITH ROLLBACK, so as written it is a
-- dry run: it does the whole delete, shows the counts, then undoes it. Read
-- the counts, then change the last line to COMMIT and run it again to delete
-- for real.
--
-- Safety net: before deleting, every row about to go is copied into tables
-- in a new schema, backup_test_leagues (same transaction, so a dry run
-- leaves nothing behind). To put it all back, run restore-test-leagues.sql.
-- Once you're sure nothing is missed:  DROP SCHEMA backup_test_leagues CASCADE;
--
-- Deleting a league takes with it, by ON DELETE CASCADE: its memberships,
-- parlays, parlay legs (and their disputes and Suss votes), week locks,
-- unlock requests, pokes, pick delegations, pick suggestions, import
-- batches, notifications and story reports. Custom indexes published to the
-- league go too.
-- It does NOT touch: the users who were in it, weeks, games, or the audit log.

BEGIN;

CREATE TEMP TABLE _doomed ON COMMIT DROP AS
SELECT id, name
FROM leagues
WHERE name IN ('Test League Rev003', 'Test League Rev004', 'Lock Test League');

-- What's about to go, per league.
SELECT d.id AS league_id,
       d.name,
       (SELECT count(*) FROM league_members m WHERE m.league_id = d.id) AS members,
       (SELECT count(*) FROM parlays p WHERE p.league_id = d.id) AS parlays,
       (SELECT count(*) FROM parlay_legs pl JOIN parlays p ON p.id = pl.parlay_id WHERE p.league_id = d.id) AS parlay_legs
FROM _doomed d
ORDER BY d.name;

-- Stop unless it's exactly those three leagues, once each. Two leagues can
-- share a name, and a typo would otherwise delete nothing without a word.
DO $$
DECLARE
  found int;
  names int;
BEGIN
  SELECT count(*), count(DISTINCT name) INTO found, names FROM _doomed;
  IF found <> 3 OR names <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 leagues (one per name), found % rows across % names. Nothing was deleted.', found, names;
  END IF;
END $$;

-- Copy every row that's about to go. Parents come before the rows that
-- point at them: restore-test-leagues.sql puts them back in this order.
-- Stops here if the schema already exists, so an earlier copy is never
-- overwritten.
CREATE SCHEMA backup_test_leagues;
CREATE TABLE backup_test_leagues._tables (ord int PRIMARY KEY, tbl text NOT NULL, rows_saved bigint);

CREATE TEMP TABLE _plan (ord int, tbl text, filter text) ON COMMIT DROP;
INSERT INTO _plan VALUES
  (1,  'leagues',             'id IN (SELECT id FROM _doomed)'),
  (2,  'import_batches',      'league_id IN (SELECT id FROM _doomed)'),
  (3,  'league_members',      'league_id IN (SELECT id FROM _doomed)'),
  (4,  'league_week_locks',   'league_id IN (SELECT id FROM _doomed)'),
  (5,  'league_pokes',        'league_id IN (SELECT id FROM _doomed)'),
  (6,  'pick_delegations',    'league_id IN (SELECT id FROM _doomed)'),
  (7,  'unlock_requests',     'league_id IN (SELECT id FROM _doomed)'),
  (8,  'story_reports',       'league_id IN (SELECT id FROM _doomed)'),
  (9,  'story_sections',      'report_id IN (SELECT id FROM story_reports WHERE league_id IN (SELECT id FROM _doomed))'),
  (10, 'custom_indexes',      'published_league_id IN (SELECT id FROM _doomed)'),
  (11, 'custom_index_shares', 'custom_index_id IN (SELECT id FROM custom_indexes WHERE published_league_id IN (SELECT id FROM _doomed))'),
  (12, 'pick_suggestions',    'league_id IN (SELECT id FROM _doomed)'),
  (13, 'parlays',             'league_id IN (SELECT id FROM _doomed)'),
  (14, 'parlay_legs',         'parlay_id IN (SELECT id FROM parlays WHERE league_id IN (SELECT id FROM _doomed))'),
  (15, 'parlay_leg_disputes', 'parlay_leg_id IN (SELECT pl.id FROM parlay_legs pl JOIN parlays p ON p.id = pl.parlay_id WHERE p.league_id IN (SELECT id FROM _doomed))'),
  (16, 'leg_suss_votes',      'parlay_leg_id IN (SELECT pl.id FROM parlay_legs pl JOIN parlays p ON p.id = pl.parlay_id WHERE p.league_id IN (SELECT id FROM _doomed))'),
  (17, 'notifications',       'league_id IN (SELECT id FROM _doomed)');

DO $$
DECLARE
  step record;
  saved bigint;
BEGIN
  FOR step IN SELECT * FROM _plan ORDER BY ord LOOP
    EXECUTE format('CREATE TABLE backup_test_leagues.%I AS SELECT * FROM public.%I WHERE %s', step.tbl, step.tbl, step.filter);
    GET DIAGNOSTICS saved = ROW_COUNT;
    INSERT INTO backup_test_leagues._tables VALUES (step.ord, step.tbl, saved);
  END LOOP;
END $$;

-- What was copied.
SELECT tbl AS backed_up, rows_saved FROM backup_test_leagues._tables ORDER BY ord;

DELETE FROM leagues WHERE id IN (SELECT id FROM _doomed);

-- Nothing that pointed at those leagues should be left without a copy:
-- every table that has a league_id column must be in the list above.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.table_name, ', ') INTO missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'league_id'
    AND c.table_name NOT IN (SELECT tbl FROM backup_test_leagues._tables);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'These tables have a league_id but are not backed up: %. Add them to the list. Nothing was deleted.', missing;
  END IF;
END $$;

-- Should come back 0.
SELECT count(*) AS leagues_left
FROM leagues
WHERE name IN ('Test League Rev003', 'Test League Rev004', 'Lock Test League');

ROLLBACK; -- change to COMMIT to delete for real
