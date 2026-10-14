ALTER TABLE "leagues" ADD COLUMN "parent_league_id" integer;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_parent_league_id_leagues_id_fk" FOREIGN KEY ("parent_league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leagues_parent_league_id_idx" ON "leagues" USING btree ("parent_league_id");--> statement-breakpoint
-- Subcommittee rules, kept by the database so every way of writing a league
-- or a membership (the app, the Data Editor, imports, SQL scripts) obeys them.

-- A subcommittee sits directly under a league: never under another
-- subcommittee, and a league that has subcommittees can't become one.
CREATE OR REPLACE FUNCTION leagues_check_parent() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_league_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_league_id = NEW.id THEN
    RAISE EXCEPTION 'A league cannot be its own subcommittee' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM leagues WHERE id = NEW.parent_league_id AND parent_league_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A subcommittee cannot have subcommittees of its own' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM leagues WHERE parent_league_id = NEW.id) THEN
    RAISE EXCEPTION 'A league with subcommittees cannot become a subcommittee' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER leagues_check_parent
  BEFORE INSERT OR UPDATE OF parent_league_id ON leagues
  FOR EACH ROW EXECUTE FUNCTION leagues_check_parent();
--> statement-breakpoint
-- Only an active member of the parent league can be an active member of one
-- of its subcommittees.
CREATE OR REPLACE FUNCTION league_members_check_parent() RETURNS trigger AS $$
DECLARE
  parent_id integer;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  SELECT parent_league_id INTO parent_id FROM leagues WHERE id = NEW.league_id;
  IF parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = parent_id AND user_id = NEW.user_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Only members of the league can be in its subcommittees' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER league_members_check_parent
  BEFORE INSERT OR UPDATE OF is_active, league_id, user_id ON league_members
  FOR EACH ROW EXECUTE FUNCTION league_members_check_parent();
--> statement-breakpoint
-- Leaving a league (or being removed from it) ends that member's place in
-- its subcommittees on the same date. Their picks there stay. If they ran a
-- subcommittee, it passes to its longest-standing minion, else its
-- longest-standing member.
CREATE OR REPLACE FUNCTION league_members_leave_subcommittees() RETURNS trigger AS $$
DECLARE
  sub record;
  heir integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.is_active AND NOT NEW.is_active) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' AND NOT OLD.is_active THEN
    RETURN NULL;
  END IF;
  FOR sub IN
    SELECT m.id, m.league_id, m.role
    FROM league_members m
    JOIN leagues l ON l.id = m.league_id
    WHERE l.parent_league_id = OLD.league_id AND m.user_id = OLD.user_id AND m.is_active
  LOOP
    UPDATE league_members
    SET is_active = false,
        end_date = CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(NEW.end_date, now()) ELSE now() END
    WHERE id = sub.id;
    IF sub.role = 'admin' AND NOT EXISTS (
      SELECT 1 FROM league_members WHERE league_id = sub.league_id AND is_active AND role = 'admin'
    ) THEN
      SELECT id INTO heir FROM league_members
      WHERE league_id = sub.league_id AND is_active
      ORDER BY (role = 'lieutenant') DESC, start_date, id
      LIMIT 1;
      IF heir IS NOT NULL THEN
        UPDATE league_members SET role = 'admin' WHERE id = heir;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER league_members_leave_subcommittees
  AFTER UPDATE OF is_active OR DELETE ON league_members
  FOR EACH ROW EXECUTE FUNCTION league_members_leave_subcommittees();
