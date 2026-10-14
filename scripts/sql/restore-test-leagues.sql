-- Puts back everything delete-test-leagues.sql removed, from the copies it
-- left in the backup_test_leagues schema.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/restore-test-leagues.sql
--
-- One transaction: it all comes back or none of it does. Rows return with
-- the ids they had. It stops if any of them already exist (a second run),
-- and it's best run before a migration changes one of these tables: the
-- copies have the columns the tables had on the day of the delete.
-- The backup schema is left in place; drop it yourself when you're done.

BEGIN;

DO $$
DECLARE
  step record;
  cols text;
  restored bigint;
BEGIN
  FOR step IN SELECT * FROM backup_test_leagues._tables ORDER BY ord LOOP
    -- Generated columns (parlays.status_group) work themselves out again.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = step.tbl AND is_generated = 'NEVER';
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM backup_test_leagues.%I', step.tbl, cols, cols, step.tbl);
    GET DIAGNOSTICS restored = ROW_COUNT;
    IF restored <> step.rows_saved THEN
      RAISE EXCEPTION 'Restored % rows into % but % were saved. Nothing was restored.', restored, step.tbl, step.rows_saved;
    END IF;
    RAISE NOTICE 'restored % rows into %', restored, step.tbl;
  END LOOP;
END $$;

SELECT id, name FROM leagues WHERE id IN (SELECT id FROM backup_test_leagues.leagues) ORDER BY name;

COMMIT;
