/**
 * Additive local seed — adds historical parlay data for a local test account
 * so the mobile Dashboard (Summary / My Analytics / Performance / Weekly)
 * has real data to render. Unlike seed-dev.ts, this NEVER deletes anything;
 * it only adds one league membership + a few parlays/legs for one user.
 *
 * Prereqs: `npm run db:seed` has been run at least once (provides the
 * "Dev League" + Weeks 15-17 historical games this script attaches to).
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/seed-tim-local-history.ts <userId>
 */
import { db } from "../server/db";
import { leagues, leagueMembers, weeks, games, parlays, parlayLegs } from "../shared/schema";
import { and, eq } from "drizzle-orm";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: tsx scripts/seed-tim-local-history.ts <userId>");
  process.exit(1);
}

async function resolvedParlay(
  leagueId: number,
  weekId: number,
  status: string,
  legs: Array<{ gameId?: number; betType: string; pick: string; line?: string; result: string; playerName?: string; propType?: string }>,
) {
  const [p] = await db.insert(parlays).values({
    userId, leagueId, weekId, status,
    approvedBy: "dev_admin", approvedAt: new Date(),
  }).returning();
  await db.insert(parlayLegs).values(
    legs.map(l => ({ ...l, parlayId: p.id, userId, oddsEnriched: true })),
  );
  return p;
}

async function seed() {
  const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, "DEVTEST"));
  if (!league) {
    console.error('"Dev League" not found — run `npm run db:seed` first.');
    process.exit(1);
  }

  const [existingMembership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)));
  if (!existingMembership) {
    await db.insert(leagueMembers).values({ leagueId: league.id, userId, role: "member" });
    console.log("  ✓ joined Dev League");
  } else {
    console.log("  · already a Dev League member");
  }

  const allWeeks = await db.select().from(weeks).where(eq(weeks.season, 2024));
  const w15 = allWeeks.find(w => w.weekNumber === 15)!;
  const w16 = allWeeks.find(w => w.weekNumber === 16)!;
  const w17 = allWeeks.find(w => w.weekNumber === 17)!;
  const w18 = allWeeks.find(w => w.weekNumber === 18)!;

  const [existingParlay] = await db
    .select()
    .from(parlays)
    .where(and(eq(parlays.userId, userId), eq(parlays.leagueId, league.id), eq(parlays.weekId, w15.id)));
  if (existingParlay) {
    console.log("  · historical parlays already seeded for this user — skipping.");
    process.exit(0);
  }

  const allGames = await db.select().from(games);
  const g = (weekId: number, home: string) => allGames.find(x => x.weekId === weekId && x.homeTeam === home)!;

  // Week 15 — win (spread + player prop + moneyline, all hit)
  await resolvedParlay(league.id, w15.id, "win", [
    { gameId: g(w15.id, "Broncos").id, betType: "spread", pick: "home", line: "-4.5", result: "win" },
    { betType: "player_prop", pick: "over", line: "245.5", result: "win", playerName: "Josh Allen", propType: "passing_yards" },
    { gameId: g(w15.id, "Eagles").id, betType: "moneyline", pick: "home", line: "-265", result: "win" },
  ]);

  // Week 16 — loss (one leg busts)
  await resolvedParlay(league.id, w16.id, "loss", [
    { gameId: g(w16.id, "Bills").id, betType: "spread", pick: "home", line: "-14.0", result: "loss" },
    { gameId: g(w16.id, "Bengals").id, betType: "over", pick: "over", line: "46.5", result: "win" },
    { betType: "player_prop", pick: "under", line: "85.5", result: "loss", playerName: "Justin Jefferson", propType: "receiving_yards" },
  ]);

  // Week 17 — push (no losses, one push)
  await resolvedParlay(league.id, w17.id, "push", [
    { gameId: g(w17.id, "Bills").id, betType: "moneyline", pick: "home", line: "-520", result: "win" },
    { gameId: g(w17.id, "Jaguars").id, betType: "spread", pick: "home", line: "-7.0", result: "push" },
  ]);

  // Week 18 (active) — pending, so "My Picks" has an in-progress entry too
  const [pending] = await db.insert(parlays).values({
    userId, leagueId: league.id, weekId: w18.id, status: "pending",
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: pending.id, userId, gameId: g(w18.id, "Eagles").id, betType: "spread", pick: "away", line: "+3.0" },
    { parlayId: pending.id, userId, gameId: g(w18.id, "Lions").id, betType: "moneyline", pick: "home", line: "-148" },
  ]);

  console.log("  ✓ 3 resolved weeks (win/loss/push) + 1 pending week seeded for user", userId);
  process.exit(0);
}

seed().catch(err => { console.error("Seed failed:", err); process.exit(1); });