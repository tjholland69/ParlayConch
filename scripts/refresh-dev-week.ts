/**
 * Makes the local active week pickable again when its games have gone stale.
 *
 * Seeded kickoffs are a few days out when the seed runs; a week or two
 * later every game has "started", the picks grid is all disabled, and
 * nothing about making a pick can be tested. This puts the slate back on
 * the coming weekend without wiping anything.
 *
 * Run with:
 *   npm run db:refresh-week                 # only if the week is stale
 *   npm run db:refresh-week -- --force      # even if games are still pickable
 *   npm run db:refresh-week -- --unlock     # also clear this week's league locks
 *
 * `npm run dev` runs it with --auto before the server starts: silent unless
 * it changes something, limited to the dev seed's own data, and never the
 * reason the server fails to start.
 *
 * Local databases only — it refuses any DATABASE_URL that isn't localhost.
 * It also gives the seed users a password if they have none.
 */
const args = new Set(process.argv.slice(2));
const auto = args.has("--auto");

const fmt = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

async function main() {
  if (!process.env.DATABASE_URL) {
    if (auto) return;
    throw new Error("DATABASE_URL is not set. Run through npm so .env.local is loaded.");
  }
  // Imported here, not at the top: server/db throws on a missing
  // DATABASE_URL, which --auto has to be able to shrug off.
  const { ensureDevLogins, isLocalDatabase, refreshActiveWeek } = await import("./lib/dev-week");
  if (!isLocalDatabase()) {
    if (auto) return;
    throw new Error("Refusing to run: DATABASE_URL is not a local database.");
  }

  const result = await refreshActiveWeek({
    force: args.has("--force"),
    unlock: args.has("--unlock"),
    seedDataOnly: auto,
  });
  const passwordsSet = await ensureDevLogins();

  const changed = result.gamesMoved + result.gamesAdded + result.locksRemoved + passwordsSet > 0;
  if (auto && !changed) return;

  const tag = auto ? "[dev data] " : "";
  if (result.skipped === "no-active-week") {
    console.log(`${tag}No active week — nothing to refresh. Run npm run db:seed for sample data.`);
  } else if (result.skipped === "not-stale") {
    console.log(`${tag}${result.week!.label} still has pickable games — left alone. Use --force to move it anyway.`);
  } else if (result.week) {
    const parts = [
      result.gamesMoved ? `${result.gamesMoved} game${result.gamesMoved !== 1 ? "s" : ""} moved` : null,
      result.gamesAdded ? `${result.gamesAdded} added` : null,
      result.locksRemoved ? `${result.locksRemoved} lock${result.locksRemoved !== 1 ? "s" : ""} removed` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      console.log(`${tag}${result.week.label} (${result.week.season}) refreshed: ${parts.join(", ")}.`);
    }
    if (result.firstKickoff && result.lastKickoff) {
      console.log(`${tag}Kickoffs now run ${fmt(result.firstKickoff)} to ${fmt(result.lastKickoff)}.`);
    }
    if (result.decidedLegs > 0) {
      console.log(`${tag}${result.decidedLegs} leg${result.decidedLegs !== 1 ? "s" : ""} on those games already had a result and kept it.`);
    }
  }
  if (passwordsSet > 0) {
    console.log(`${tag}Set the dev password on ${passwordsSet} seed user${passwordsSet !== 1 ? "s" : ""} (see DEV_LOGIN_PASSWORD in scripts/lib/dev-week.ts).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (auto) {
      // Stale sample data is an inconvenience; a dev server that won't
      // start because of it is worse.
      console.warn(`[dev data] Couldn't refresh the active week: ${err instanceof Error ? err.message : err}`);
      process.exit(0);
    }
    console.error("Refresh failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
