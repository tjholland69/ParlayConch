/**
 * Idempotent dev seed script — wipes and rebuilds a clean local dataset.
 *
 * Run with:
 *   npm run db:seed
 *
 * What gets created:
 *   Users:   dev_admin (Parlay Maestro), dev_user1 (Alice), dev_user2 (Bob), dev_user3 (Carol)
 *   Weeks:   2024 Weeks 15-17 (historical, resolved) + Week 18 (active)
 *   Games:   4 NFL games per week (16 total), historical games have final scores
 *   League:  "Dev League" (invite code: DEVTEST)
 *
 * Final standings after Weeks 15-17:
 *   dev_admin  3W  0L  0P  → 100.0%  (leaderboard #1)
 *   Alice      2W  1L  0P  →  66.7%  (leaderboard #2)
 *   Bob        1W  1L  1P  →  50.0%  (leaderboard #3)
 *   Carol      1W  2L  0P  →  33.3%  (leaderboard #4)
 *
 * Week 18 active state:
 *   Alice → pending   Bob → approved   Carol → rejected
 */

import { db } from "../server/db";
import {
  users, weeks, games, leagues, leagueMembers,
  parlays, parlayLegs, notifications,
} from "../shared/schema";
import { eq } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolvedParlay(
  userId: string,
  leagueId: number,
  weekId: number,
  status: string,
  approvedAt: Date,
  legs: Array<{ gameId: number; betType: string; pick: string; line: string; result: string }>,
) {
  const [p] = await db.insert(parlays).values({
    userId, leagueId, weekId, status,
    approvedBy: "dev_admin", approvedAt,
  }).returning();
  await db.insert(parlayLegs).values(
    legs.map(l => ({ ...l, parlayId: p.id, userId, oddsEnriched: true })),
  );
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function wipe() {
  console.log("Wiping existing dev data...");
  await db.delete(notifications);
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(leagueMembers);
  await db.delete(leagues);
  await db.delete(games);
  await db.delete(weeks);
  for (const id of ["dev_admin", "dev_user1", "dev_user2", "dev_user3"]) {
    await db.delete(users).where(eq(users.id, id));
  }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await wipe();
  console.log("Seeding...");

  // Users — isDemo: false so they appear in the leaderboard during local testing
  await db.insert(users).values([
    { id: "dev_admin", firstName: "Dev Admin", email: "admin@dev.local", isDemo: false, settings: { displayName: "Dev Admin", region: "US"   } },
    { id: "dev_user1", firstName: "Alice",     email: "alice@dev.local", isDemo: false, settings: { displayName: "Alice",     region: "US"   } },
    { id: "dev_user2", firstName: "Bob",       email: "bob@dev.local",   isDemo: false, settings: { displayName: "Bob",       region: "EMEA" } },
    { id: "dev_user3", firstName: "Carol",     email: "carol@dev.local", isDemo: false, settings: { displayName: "Carol",     region: "APAC" } },
  ]);
  console.log("  ✓ users");

  // ── Week 15 (historical — all results: admin=W alice=W bob=W carol=L) ────────
  const [w15] = await db.insert(weeks).values({
    season: 2024, weekNumber: 15, label: "Week 15", isActive: false,
  }).returning();

  // Real 2024 Week 15 matchups/scores (nflverse) — game identity has to match
  // the real schedule or play-by-play-driven features (decided_* backfill,
  // finish-time sync) can never find a matching game_id for these legs.
  const [w15g1, w15g2, w15g3, w15g4] = await db.insert(games).values([
    {
      weekId: w15.id,
      homeTeam: "Broncos",  awayTeam: "Colts",
      spread: "-4.5",      spreadOdds: "-110", overUnder: "43.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-238", moneylineAway: "+195",
      gameTime: new Date("2024-12-15T21:25:00Z"),
      homeScore: 31, awayScore: 13, isFinished: true, winner: "home",
    },
    {
      weekId: w15.id,
      homeTeam: "Cardinals",  awayTeam: "Patriots",
      spread: "-6.0",      spreadOdds: "-110", overUnder: "46.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-258", moneylineAway: "+210",
      gameTime: new Date("2024-12-15T21:25:00Z"),
      homeScore: 30, awayScore: 17, isFinished: true, winner: "home",
    },
    {
      weekId: w15.id,
      homeTeam: "Eagles",   awayTeam: "Steelers",
      spread: "-5.5",     spreadOdds: "-110", overUnder: "43.0", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-265", moneylineAway: "+215",
      gameTime: new Date("2024-12-15T21:25:00Z"),
      homeScore: 27, awayScore: 13, isFinished: true, winner: "home",
    },
    {
      weekId: w15.id,
      homeTeam: "Vikings",   awayTeam: "Bears",
      spread: "-7.0",      spreadOdds: "-110", overUnder: "43.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-325", moneylineAway: "+260",
      gameTime: new Date("2024-12-17T01:00:00Z"),
      homeScore: 30, awayScore: 12, isFinished: true, winner: "home",
    },
  ]).returning();

  // ── Week 16 (historical — all results: admin=W alice=L bob=L carol=W) ────────
  const [w16] = await db.insert(weeks).values({
    season: 2024, weekNumber: 16, label: "Week 16", isActive: false,
  }).returning();

  // Real 2024 Week 16 matchups/scores (nflverse).
  const [w16g1, w16g2, w16g3, w16g4] = await db.insert(games).values([
    {
      weekId: w16.id,
      homeTeam: "Falcons",  awayTeam: "Giants",
      spread: "-9.5",      spreadOdds: "-110", overUnder: "42.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-550", moneylineAway: "+410",
      gameTime: new Date("2024-12-22T18:00:00Z"),
      homeScore: 34, awayScore: 7, isFinished: true, winner: "home",
    },
    {
      weekId: w16.id,
      homeTeam: "Bills",   awayTeam: "Patriots",
      spread: "-14.0",     spreadOdds: "-110", overUnder: "48.0", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-1100", moneylineAway: "+700",
      gameTime: new Date("2024-12-22T21:25:00Z"),
      homeScore: 24, awayScore: 21, isFinished: true, winner: "home",
    },
    {
      weekId: w16.id,
      homeTeam: "Bengals", awayTeam: "Browns",
      spread: "-10.0",      spreadOdds: "-110", overUnder: "46.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-575", moneylineAway: "+425",
      gameTime: new Date("2024-12-22T18:00:00Z"),
      homeScore: 24, awayScore: 6, isFinished: true, winner: "home",
    },
    {
      weekId: w16.id,
      homeTeam: "Bears",    awayTeam: "Lions",
      spread: "-7.0",      spreadOdds: "-110", overUnder: "47.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "+270", moneylineAway: "-340",
      gameTime: new Date("2024-12-22T18:00:00Z"),
      homeScore: 17, awayScore: 34, isFinished: true, winner: "away",
    },
  ]).returning();

  // ── Week 17 (historical — all results: admin=W alice=W bob=P carol=L) ────────
  const [w17] = await db.insert(weeks).values({
    season: 2024, weekNumber: 17, label: "Week 17", isActive: false,
  }).returning();

  // Real 2024 Week 17 matchups/scores (nflverse).
  const [w17g1, w17g2, w17g3, w17g4] = await db.insert(games).values([
    {
      weekId: w17.id,
      homeTeam: "Bills",    awayTeam: "Jets",
      spread: "-10.0",       spreadOdds: "-110", overUnder: "44.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-520", moneylineAway: "+390",
      gameTime: new Date("2024-12-29T18:00:00Z"),
      homeScore: 40, awayScore: 14, isFinished: true, winner: "home",
    },
    {
      weekId: w17.id,
      homeTeam: "Eagles",    awayTeam: "Cowboys",
      spread: "-14.0",       spreadOdds: "-110", overUnder: "37.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-325", moneylineAway: "+260",
      gameTime: new Date("2024-12-29T18:00:00Z"),
      homeScore: 41, awayScore: 7, isFinished: true, winner: "home",
    },
    {
      weekId: w17.id,
      homeTeam: "Jaguars",   awayTeam: "Titans",
      spread: "-7.0",        spreadOdds: "-110", overUnder: "33.0", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-112", moneylineAway: "-108",
      gameTime: new Date("2024-12-29T18:00:00Z"),
      homeScore: 20, awayScore: 13, isFinished: true, winner: "home",
    },
    {
      weekId: w17.id,
      homeTeam: "Steelers",  awayTeam: "Chiefs",
      spread: "-3.0",        spreadOdds: "-110", overUnder: "43.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "+136", moneylineAway: "-162",
      gameTime: new Date("2024-12-25T18:00:00Z"),
      homeScore: 10, awayScore: 29, isFinished: true, winner: "away",
    },
  ]).returning();

  // ── Week 18 (active) ─────────────────────────────────────────────────────────
  const [w18] = await db.insert(weeks).values({
    season: 2024, weekNumber: 18, label: "Week 18", isActive: true,
  }).returning();

  // Real 2024 Week 18 matchups (nflverse) — not yet finished, no scores.
  const [w18g1, w18g2, w18g3, w18g4] = await db.insert(games).values([
    {
      weekId: w18.id,
      homeTeam: "Eagles",  awayTeam: "Giants",
      spread: "-3.0",      spreadOdds: "-110", overUnder: "36.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-155", moneylineAway: "+130",
      gameTime: new Date("2025-01-05T18:00:00Z"),
    },
    {
      weekId: w18.id,
      homeTeam: "Buccaneers",  awayTeam: "Saints",
      spread: "-14.5",      spreadOdds: "-110", overUnder: "44.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-1050", moneylineAway: "+675",
      gameTime: new Date("2025-01-05T18:00:00Z"),
    },
    {
      weekId: w18.id,
      homeTeam: "Colts", awayTeam: "Jaguars",
      spread: "-3.5",      spreadOdds: "-110", overUnder: "45.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-180", moneylineAway: "+150",
      gameTime: new Date("2025-01-05T18:00:00Z"),
    },
    {
      weekId: w18.id,
      homeTeam: "Lions",   awayTeam: "Vikings",
      spread: "-3.0",      spreadOdds: "-110", overUnder: "56.5", overOdds: "-110", underOdds: "-110",
      moneylineHome: "-148", moneylineAway: "+124",
      gameTime: new Date("2025-01-06T01:20:00Z"),
    },
  ]).returning();

  console.log("  ✓ weeks + games  (4 weeks × 4 games)");

  // ── League + members ─────────────────────────────────────────────────────────
  const [league] = await db.insert(leagues).values({
    name: "Dev League",
    description: "Local dev test league — safe to wipe and reseed",
    inviteCode: "DEVTEST",
    maxParlaysPerWeek: 1,
    minLegsPerParlay: 2,
    maxLegsPerParlay: 5,
  }).returning();

  await db.insert(leagueMembers).values([
    { leagueId: league.id, userId: "dev_admin", role: "admin"  },
    { leagueId: league.id, userId: "dev_user1", role: "member" },
    { leagueId: league.id, userId: "dev_user2", role: "member" },
    { leagueId: league.id, userId: "dev_user3", role: "member" },
  ]);
  console.log(`  ✓ league  (id=${league.id}, code=DEVTEST)`);

  // ── Historical parlays ────────────────────────────────────────────────────────
  const d15 = new Date("2024-12-16T12:00:00Z");
  const d16 = new Date("2024-12-23T12:00:00Z");
  const d17 = new Date("2024-12-30T12:00:00Z");

  // Week 15 — admin W, alice W, bob W, carol L
  await resolvedParlay("dev_admin", league.id, w15.id, "win", d15, [
    { gameId: w15g1.id, betType: "spread",    pick: "home",  line: "-4.5",  result: "win" },
    { gameId: w15g3.id, betType: "moneyline", pick: "home",  line: "-265",  result: "win" },
    { gameId: w15g4.id, betType: "spread",    pick: "home",  line: "-7.0",  result: "win" },
  ]);
  await resolvedParlay("dev_user1", league.id, w15.id, "win", d15, [
    { gameId: w15g1.id, betType: "spread",    pick: "home",  line: "-4.5",  result: "win" },
    { gameId: w15g2.id, betType: "moneyline", pick: "home",  line: "-258",  result: "win" },
    { gameId: w15g3.id, betType: "under",     pick: "under", line: "43.0",  result: "win" },
  ]);
  await resolvedParlay("dev_user2", league.id, w15.id, "win", d15, [
    { gameId: w15g2.id, betType: "spread",    pick: "home",  line: "-6.0",  result: "win" },
    { gameId: w15g4.id, betType: "spread",    pick: "home",  line: "-7.0",  result: "win" },
  ]);
  await resolvedParlay("dev_user3", league.id, w15.id, "loss", d15, [
    { gameId: w15g1.id, betType: "spread",    pick: "away",  line: "+4.5",  result: "loss" },
    { gameId: w15g2.id, betType: "moneyline", pick: "away",  line: "+210",  result: "loss" },
    { gameId: w15g3.id, betType: "under",     pick: "under", line: "43.0",  result: "win"  },
  ]);

  // Week 16 — admin W, alice L, bob L, carol W
  await resolvedParlay("dev_admin", league.id, w16.id, "win", d16, [
    { gameId: w16g1.id, betType: "spread",    pick: "home",  line: "-9.5",  result: "win" },
    { gameId: w16g4.id, betType: "moneyline", pick: "away",  line: "-340",  result: "win" },
    { gameId: w16g3.id, betType: "moneyline", pick: "home",  line: "-575",  result: "win" },
  ]);
  await resolvedParlay("dev_user1", league.id, w16.id, "loss", d16, [
    { gameId: w16g2.id, betType: "spread",    pick: "home",  line: "-14.0", result: "loss" },
    { gameId: w16g3.id, betType: "moneyline", pick: "home",  line: "-575",  result: "win"  },
    { gameId: w16g4.id, betType: "over",      pick: "over",  line: "47.5",  result: "win"  },
  ]);
  await resolvedParlay("dev_user2", league.id, w16.id, "loss", d16, [
    { gameId: w16g4.id, betType: "spread",    pick: "home",  line: "-7.0",  result: "loss" },
    { gameId: w16g2.id, betType: "moneyline", pick: "home",  line: "-1100", result: "win"  },
  ]);
  await resolvedParlay("dev_user3", league.id, w16.id, "win", d16, [
    { gameId: w16g4.id, betType: "moneyline", pick: "away",  line: "-340",  result: "win" },
    { gameId: w16g2.id, betType: "spread",    pick: "away",  line: "+14.0", result: "win" },
  ]);

  // Week 17 — admin W, alice W, bob P, carol L
  await resolvedParlay("dev_admin", league.id, w17.id, "win", d17, [
    { gameId: w17g1.id, betType: "spread",    pick: "home",  line: "-10.0", result: "win" },
    { gameId: w17g2.id, betType: "moneyline", pick: "home",  line: "-325",  result: "win" },
  ]);
  await resolvedParlay("dev_user1", league.id, w17.id, "win", d17, [
    { gameId: w17g1.id, betType: "moneyline", pick: "home",  line: "-520",  result: "win" },
    { gameId: w17g4.id, betType: "moneyline", pick: "away",  line: "-162",  result: "win" },
  ]);
  await resolvedParlay("dev_user2", league.id, w17.id, "push", d17, [
    { gameId: w17g3.id, betType: "spread",    pick: "home",  line: "-7.0",  result: "push" },
    { gameId: w17g3.id, betType: "over",      pick: "over",  line: "33.0",  result: "push" },
  ]);
  await resolvedParlay("dev_user3", league.id, w17.id, "loss", d17, [
    { gameId: w17g1.id, betType: "moneyline", pick: "away",  line: "+390",  result: "loss" },
    { gameId: w17g2.id, betType: "spread",    pick: "away",  line: "+14.0", result: "loss" },
    { gameId: w17g4.id, betType: "moneyline", pick: "home",  line: "+136",  result: "loss" },
  ]);

  // ── Active week parlays (Week 18) ─────────────────────────────────────────────
  // Alice — pending
  const [pAlice] = await db.insert(parlays).values({
    userId: "dev_user1", leagueId: league.id, weekId: w18.id, status: "pending",
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: pAlice.id, userId: "dev_user1", gameId: w18g1.id, betType: "spread",    pick: "home",  line: "-3.0"  },
    { parlayId: pAlice.id, userId: "dev_user1", gameId: w18g2.id, betType: "moneyline", pick: "away",  line: "+675"  },
    { parlayId: pAlice.id, userId: "dev_user1", gameId: w18g3.id, betType: "over",      pick: "over",  line: "45.5"  },
  ]);

  // Bob — approved
  const [pBob] = await db.insert(parlays).values({
    userId: "dev_user2", leagueId: league.id, weekId: w18.id,
    status: "approved", approvedBy: "dev_admin", approvedAt: new Date(),
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: pBob.id, userId: "dev_user2", gameId: w18g1.id, betType: "moneyline", pick: "away",  line: "+130"  },
    { parlayId: pBob.id, userId: "dev_user2", gameId: w18g4.id, betType: "spread",    pick: "home",  line: "-3.0"  },
  ]);

  // Carol — rejected
  const [pCarol] = await db.insert(parlays).values({
    userId: "dev_user3", leagueId: league.id, weekId: w18.id,
    status: "rejected", approvedBy: "dev_admin", approvedAt: new Date(),
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: pCarol.id, userId: "dev_user3", gameId: w18g2.id, betType: "spread",    pick: "away",  line: "+14.5" },
    { parlayId: pCarol.id, userId: "dev_user3", gameId: w18g3.id, betType: "under",     pick: "under", line: "45.5"  },
  ]);

  console.log("  ✓ parlays  (3 resolved weeks + 1 active week)");

  // ── Notifications ─────────────────────────────────────────────────────────────
  await db.insert(notifications).values([
    {
      userId: "dev_user1", leagueId: league.id,
      type: "announcement",
      title: "Welcome to Dev League",
      message: "Local dev environment — reseed anytime with npm run db:seed.",
    },
    {
      userId: "dev_user2", leagueId: league.id,
      type: "parlay_approved",
      title: "Week 18 parlay approved",
      message: "Your Week 18 parlay has been approved by Dev Admin.",
    },
    {
      userId: "dev_user3", leagueId: league.id,
      type: "parlay_rejected",
      title: "Week 18 parlay rejected",
      message: "Your Week 18 parlay was rejected. Check with the league admin.",
    },
  ]);
  console.log("  ✓ notifications");

  console.log(`
Done. Quick reference:
  League:      Dev League  (id=${league.id}, invite=DEVTEST)
  Active week: 2024 Week 18 (id=${w18.id})
  Logins:      admin@dev.local | alice@dev.local | bob@dev.local | carol@dev.local

  Standings after Weeks 15-17:
    dev_admin  3W  0L  0P  → 100.0%
    Alice      2W  1L  0P  →  66.7%
    Bob        1W  1L  1P  →  50.0%
    Carol      1W  2L  0P  →  33.3%
`);
  process.exit(0);
}

seed().catch(err => { console.error("Seed failed:", err); process.exit(1); });