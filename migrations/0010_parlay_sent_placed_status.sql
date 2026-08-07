-- Adds 'sent' and 'placed' as valid parlays.status values, representing the
-- handoff to a sportsbook app (sent) and the maestro's self-reported
-- confirmation that the bet was actually placed (placed). Both are
-- non-terminal/"open" for status_group purposes, same as 'approved' —
-- a parlay can still resolve to win/loss/push while sitting in either state.
--
-- Postgres does not support altering a GENERATED column's expression, so the
-- column must be dropped and recreated. No index depends on status_group
-- (only the one that created it, in 0006), so this is safe.
ALTER TABLE "parlays" DROP COLUMN "status_group";--> statement-breakpoint
ALTER TABLE "parlays" ADD COLUMN "status_group" text GENERATED ALWAYS AS (
	CASE
		WHEN "status" IN ('approved', 'pending', 'sent', 'placed') THEN 'open'
		WHEN "status" IN ('win', 'loss', 'rejected', 'push') THEN 'closed'
		WHEN "status" = 'void' THEN 'void'
		ELSE NULL
	END
) STORED;
