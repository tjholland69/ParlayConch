-- Adds a 'draft' parlay status: an in-progress parlay that a user is still
-- adding legs to (via the new draft-parlay/legs endpoints) before final
-- submit, which may legitimately have fewer legs than the league's
-- minLegsPerParlay. Regenerates the status_group GENERATED STORED column
-- (see migrations/0006) since Postgres has no ALTER ... generation
-- expression — the column must be dropped and recreated. No data loss: the
-- values are recomputed automatically from the existing `status` column,
-- and no row can have status = 'draft' yet since this migration introduces it.
--
-- Also folds in 'sent'/'placed' into the 'open' bucket, matching the
-- documented status list in shared/schema.ts (they were missing from the
-- original 0006 expression).
ALTER TABLE "parlays" DROP COLUMN IF EXISTS "status_group";--> statement-breakpoint
ALTER TABLE "parlays" ADD COLUMN "status_group" text GENERATED ALWAYS AS (
	CASE
		WHEN "status" = 'draft' THEN 'draft'
		WHEN "status" IN ('approved', 'pending', 'sent', 'placed') THEN 'open'
		WHEN "status" IN ('win', 'loss', 'rejected', 'push') THEN 'closed'
		WHEN "status" = 'void' THEN 'void'
		ELSE NULL
	END
) STORED;
