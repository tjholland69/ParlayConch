/**
 * Replaces local seed data with a filtered copy of production's demo dataset.
 *
 * Run with:
 *   npm run db:seed:prod-replica
 *
 * Pulls read-only from Railway production (connection string fetched live via
 * `railway variables`, never written to disk) and writes into whatever
 * DATABASE_URL your local .env.local points at (this WIPES local app data,
 * same as db:seed).
 *
 * Only rows belonging to production users with is_demo = true are copied —
 * real accounts (is_demo = false) and everything that references them
 * (their leagues, parlays, disputes, notifications, ...) are excluded, so no
 * real-user data ever lands in a local snapshot. Auth/session tables
 * (sessions, user_passwords, password_reset_tokens, audit_events) and the
 * chat tables (conversations, messages) are left alone entirely — not
 * copied, not read from prod.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";
import { pool as localPool } from "../server/db";

const { Pool } = pg;

function getProductionDatabaseUrl(): string {
  const output = execFileSync(
    "railway",
    ["variables", "--environment", "production", "--service", "ParlayConch", "--kv"],
    { encoding: "utf8" },
  );
  const line = output.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error(
      "DATABASE_URL not found in Railway production variables. Are you logged in (`railway login`) and linked to the parlay-conch project?",
    );
  }
  return line.slice("DATABASE_URL=".length).trim();
}

// Tables truncated locally before reload, in an order TRUNCATE...CASCADE can
// handle on its own (it also cascades into user_passwords/password_reset_tokens/
// audit_events via their FK to users — expected, these are local-only anyway).
const TRUNCATE_TABLES = [
  "teams", "users", "weeks", "games", "players", "player_week_stats",
  "historical_odds_snapshots", "leagues", "league_members", "import_batches",
  "parlays", "parlay_legs", "parlay_leg_disputes", "league_week_locks",
  "notifications", "custom_indexes", "custom_index_shares", "story_reports",
  "story_sections", "bets",
];

function toInsertable(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return JSON.stringify(value);
  }
  return value;
}

const INSERT_BATCH_SIZE = 100;

async function copyRows(dest: pg.PoolClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const columnList = columns.map((c) => `"${c}"`).join(",");

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const values: unknown[] = [];
    const tuples = batch.map((row, i) => {
      const placeholders = columns.map((col, j) => {
        values.push(toInsertable(row[col]));
        return `$${i * columns.length + j + 1}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await dest.query(`INSERT INTO "${table}" (${columnList}) VALUES ${tuples.join(",")}`, values);
  }

  if (table !== "users" && columns.includes("id")) {
    await dest.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
    );
  }
}

async function main() {
  const prodUrl = getProductionDatabaseUrl();
  const prod = new Pool({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  const dest = await localPool.connect();

  try {
    const prodClient = await prod.connect();
    await prodClient.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    console.log("Reading production demo dataset...");
    const { rows: demoUsers } = await prodClient.query("SELECT * FROM users WHERE is_demo = true");
    const demoIds = demoUsers.map((u) => u.id);
    if (demoIds.length === 0) throw new Error("No is_demo = true users found in production — nothing to copy.");

    const { rows: teams } = await prodClient.query("SELECT * FROM teams");
    const { rows: weeks } = await prodClient.query("SELECT * FROM weeks");
    const { rows: games } = await prodClient.query("SELECT * FROM games");
    const { rows: players } = await prodClient.query("SELECT * FROM players");
    const { rows: playerWeekStats } = await prodClient.query("SELECT * FROM player_week_stats");
    const { rows: oddsSnapshots } = await prodClient.query("SELECT * FROM historical_odds_snapshots");

    const { rows: keptLeagueIdRows } = await prodClient.query(
      "SELECT DISTINCT league_id FROM league_members WHERE user_id = ANY($1)",
      [demoIds],
    );
    const keptLeagueIds = keptLeagueIdRows.map((r) => r.league_id);

    const { rows: leagues } = await prodClient.query(
      "SELECT * FROM leagues WHERE id = ANY($1)",
      [keptLeagueIds],
    );
    const { rows: leagueMembers } = await prodClient.query(
      "SELECT * FROM league_members WHERE user_id = ANY($1) AND league_id = ANY($2)",
      [demoIds, keptLeagueIds],
    );
    const { rows: importBatches } = await prodClient.query(
      "SELECT * FROM import_batches WHERE league_id = ANY($1) AND uploaded_by = ANY($2)",
      [keptLeagueIds, demoIds],
    );
    const keptImportBatchIds = new Set(importBatches.map((b) => b.id));

    const { rows: parlaysRaw } = await prodClient.query(
      "SELECT * FROM parlays WHERE user_id = ANY($1) AND league_id = ANY($2)",
      [demoIds, keptLeagueIds],
    );
    const parlays = parlaysRaw.map((p) => ({
      ...p,
      import_batch_id: p.import_batch_id && keptImportBatchIds.has(p.import_batch_id) ? p.import_batch_id : null,
      status_group: undefined, // generated column — Postgres computes it, must not be inserted
    }));
    for (const p of parlays) delete p.status_group;
    const keptParlayIds = parlays.map((p) => p.id);

    const { rows: parlayLegs } = await prodClient.query(
      "SELECT * FROM parlay_legs WHERE parlay_id = ANY($1) AND user_id = ANY($2)",
      [keptParlayIds, demoIds],
    );
    const keptLegIds = parlayLegs.map((l) => l.id);

    const { rows: disputesRaw } = await prodClient.query(
      "SELECT * FROM parlay_leg_disputes WHERE parlay_leg_id = ANY($1) AND raised_by_user_id = ANY($2)",
      [keptLegIds, demoIds],
    );
    const demoIdSet = new Set(demoIds);
    const disputes = disputesRaw.map((d) => ({
      ...d,
      resolved_by_user_id: d.resolved_by_user_id && demoIdSet.has(d.resolved_by_user_id) ? d.resolved_by_user_id : null,
    }));

    const { rows: weekLocks } = await prodClient.query(
      "SELECT * FROM league_week_locks WHERE league_id = ANY($1) AND locked_by = ANY($2)",
      [keptLeagueIds, demoIds],
    );
    const { rows: notifications } = await prodClient.query(
      "SELECT * FROM notifications WHERE user_id = ANY($1) AND (league_id IS NULL OR league_id = ANY($2))",
      [demoIds, keptLeagueIds],
    );
    const { rows: customIndexes } = await prodClient.query(
      "SELECT * FROM custom_indexes WHERE owner_id = ANY($1) AND (published_league_id IS NULL OR published_league_id = ANY($2))",
      [demoIds, keptLeagueIds],
    );
    const keptIndexIds = customIndexes.map((c) => c.id);
    const { rows: indexShares } = await prodClient.query(
      "SELECT * FROM custom_index_shares WHERE custom_index_id = ANY($1) AND shared_with_user_id = ANY($2)",
      [keptIndexIds, demoIds],
    );
    const { rows: storyReports } = await prodClient.query(
      "SELECT * FROM story_reports WHERE league_id = ANY($1) AND user_id = ANY($2)",
      [keptLeagueIds, demoIds],
    );
    const keptReportIds = storyReports.map((r) => r.id);
    const { rows: storySections } = await prodClient.query(
      "SELECT * FROM story_sections WHERE report_id = ANY($1)",
      [keptReportIds],
    );
    const { rows: bets } = await prodClient.query(
      "SELECT * FROM bets WHERE user_id = ANY($1)",
      [demoIds],
    );

    prodClient.release();
    await prod.end();

    console.log(
      `Filtered to ${demoUsers.length} demo users, ${leagues.length} leagues, ${parlays.length} parlays, ${parlayLegs.length} parlay legs.`,
    );

    await dest.query("BEGIN");
    console.log("Wiping local app data...");
    await dest.query(`TRUNCATE TABLE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(",")} RESTART IDENTITY CASCADE`);

    console.log("Loading replica...");
    await copyRows(dest, "teams", teams);
    await copyRows(dest, "users", demoUsers);
    await copyRows(dest, "weeks", weeks);
    await copyRows(dest, "games", games);
    await copyRows(dest, "players", players);
    await copyRows(dest, "player_week_stats", playerWeekStats);
    await copyRows(dest, "historical_odds_snapshots", oddsSnapshots);
    await copyRows(dest, "leagues", leagues);
    await copyRows(dest, "league_members", leagueMembers);
    await copyRows(dest, "import_batches", importBatches);
    await copyRows(dest, "parlays", parlays);
    await copyRows(dest, "parlay_legs", parlayLegs);
    await copyRows(dest, "parlay_leg_disputes", disputes);
    await copyRows(dest, "league_week_locks", weekLocks);
    await copyRows(dest, "notifications", notifications);
    await copyRows(dest, "custom_indexes", customIndexes);
    await copyRows(dest, "custom_index_shares", indexShares);
    await copyRows(dest, "story_reports", storyReports);
    await copyRows(dest, "story_sections", storySections);
    await copyRows(dest, "bets", bets);

    await dest.query("COMMIT");
    console.log(`
Done. Local database now mirrors production's demo dataset:
  Users:   ${demoUsers.length} demo users
  Leagues: ${leagues.length}
  Parlays: ${parlays.length}  (${parlayLegs.length} legs)
  Weeks:   ${weeks.length}  Games: ${games.length}

Note: this wiped local auth (user_passwords/password_reset_tokens) and
audit_events as a side effect of truncating "users" — re-run
'npm run backfill:local-auth' if you need local password logins again.
`);
  } catch (err) {
    await dest.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    dest.release();
    await localPool.end();
  }
}

main().catch((err) => {
  console.error("Production replica seed failed:", err);
  process.exit(1);
});
