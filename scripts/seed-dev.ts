/**
 * Idempotent dev seed script — wipes and rebuilds a clean local dataset.
 *
 * Run with:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/parlayconch" \
 *     npx tsx scripts/seed-dev.ts
 *
 * What gets created:
 *   Users:   dev_admin (Parlay Maestro), dev_user1 (Alice), dev_user2 (Bob), dev_user3 (Carol)
 *   Week:    2024 Week 1 (active)
 *   Games:   4 NFL games with spreads, moneylines, and over/unders
 *   League:  "Dev League" (invite code: DEVTEST)
 *   Parlays: one per non-admin user in various statuses (pending, approved, rejected)
 */

import { db } from "../server/db";
import {
  users, weeks, games, leagues, leagueMembers,
  parlays, parlayLegs, notifications,
} from "../shared/schema";

// ── Cleanup (order matters — FK dependencies) ───────────────────────────────

async function wipe() {
  console.log("Wiping existing dev data...");
  await db.delete(notifications);
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(leagueMembers);
  await db.delete(leagues);
  await db.delete(games);
  await db.delete(weeks);
  // Only remove dev users so real accounts aren't touched
  const devUserIds = ["dev_admin", "dev_user1", "dev_user2", "dev_user3"];
  for (const id of devUserIds) {
    await db.delete(users).where((await import("drizzle-orm")).eq(users.id, id));
  }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await wipe();
  console.log("Seeding...");

  // Users
  await db.insert(users).values([
    { id: "dev_admin",  firstName: "Dev Admin", email: "admin@dev.local",  isDemo: true, settings: {} },
    { id: "dev_user1",  firstName: "Alice",     email: "alice@dev.local",  isDemo: true, settings: {} },
    { id: "dev_user2",  firstName: "Bob",       email: "bob@dev.local",    isDemo: true, settings: {} },
    { id: "dev_user3",  firstName: "Carol",     email: "carol@dev.local",  isDemo: true, settings: {} },
  ]);
  console.log("  ✓ users");

  // Week
  const [week] = await db.insert(weeks).values({
    season: 2024,
    weekNumber: 1,
    label: "Week 1",
    isActive: true,
  }).returning();
  console.log(`  ✓ week  (id=${week.id})`);

  // Games
  const gameRows = await db.insert(games).values([
    {
      weekId: week.id,
      homeTeam: "Chiefs",   awayTeam: "Bills",
      spread: "-3.5",       spreadOdds: "-110",
      overUnder: "47.5",    overOdds: "-110", underOdds: "-110",
      moneylineHome: "-185", moneylineAway: "+155",
      gameTime: new Date("2024-09-08T17:00:00Z"),
      venue: "Arrowhead Stadium",
    },
    {
      weekId: week.id,
      homeTeam: "Eagles",   awayTeam: "Packers",
      spread: "-6.5",       spreadOdds: "-110",
      overUnder: "44.5",    overOdds: "-110", underOdds: "-110",
      moneylineHome: "-260", moneylineAway: "+215",
      gameTime: new Date("2024-09-08T20:25:00Z"),
      venue: "Lincoln Financial Field",
    },
    {
      weekId: week.id,
      homeTeam: "Cowboys",  awayTeam: "Browns",
      spread: "-7.0",       spreadOdds: "-110",
      overUnder: "41.5",    overOdds: "-110", underOdds: "-110",
      moneylineHome: "-300", moneylineAway: "+245",
      gameTime: new Date("2024-09-08T20:25:00Z"),
      venue: "AT&T Stadium",
    },
    {
      weekId: week.id,
      homeTeam: "49ers",    awayTeam: "Jets",
      spread: "-9.5",       spreadOdds: "-110",
      overUnder: "43.0",    overOdds: "-110", underOdds: "-110",
      moneylineHome: "-400", moneylineAway: "+320",
      gameTime: new Date("2024-09-09T00:20:00Z"),
      venue: "Levi's Stadium",
    },
  ]).returning();
  const [g1, g2, g3, g4] = gameRows;
  console.log(`  ✓ games  (ids=${gameRows.map(g => g.id).join(",")})`);

  // League
  const [league] = await db.insert(leagues).values({
    name: "Dev League",
    description: "Local dev test league — safe to wipe and reseed",
    inviteCode: "DEVTEST",
    maxParlaysPerWeek: 1,
    minLegsPerParlay: 2,
    maxLegsPerParlay: 5,
  }).returning();
  console.log(`  ✓ league  (id=${league.id}, code=DEVTEST)`);

  // Members
  await db.insert(leagueMembers).values([
    { leagueId: league.id, userId: "dev_admin",  role: "admin"  },
    { leagueId: league.id, userId: "dev_user1",  role: "member" },
    { leagueId: league.id, userId: "dev_user2",  role: "member" },
    { leagueId: league.id, userId: "dev_user3",  role: "member" },
  ]);
  console.log("  ✓ members");

  // Parlays
  // Alice — pending (not yet reviewed)
  const [p1] = await db.insert(parlays).values({
    userId: "dev_user1", leagueId: league.id, weekId: week.id, status: "pending",
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: p1.id, gameId: g1.id, betType: "spread",    pick: "home", line: "-3.5"  },
    { parlayId: p1.id, gameId: g2.id, betType: "moneyline", pick: "away", line: "+215"  },
    { parlayId: p1.id, gameId: g3.id, betType: "over",      pick: "over", line: "41.5"  },
  ]);

  // Bob — approved
  const [p2] = await db.insert(parlays).values({
    userId: "dev_user2", leagueId: league.id, weekId: week.id,
    status: "approved", approvedBy: "dev_admin", approvedAt: new Date(),
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: p2.id, gameId: g1.id, betType: "moneyline", pick: "away", line: "+155"  },
    { parlayId: p2.id, gameId: g4.id, betType: "spread",    pick: "home", line: "-9.5"  },
  ]);

  // Carol — rejected
  const [p3] = await db.insert(parlays).values({
    userId: "dev_user3", leagueId: league.id, weekId: week.id,
    status: "rejected", approvedBy: "dev_admin", approvedAt: new Date(),
  }).returning();
  await db.insert(parlayLegs).values([
    { parlayId: p3.id, gameId: g2.id, betType: "spread",    pick: "away", line: "+6.5"  },
    { parlayId: p3.id, gameId: g3.id, betType: "under",     pick: "under", line: "41.5" },
  ]);

  console.log(`  ✓ parlays  (ids=${[p1.id, p2.id, p3.id].join(",")})`);

  // Sample notification for Alice
  await db.insert(notifications).values({
    userId: "dev_user1",
    leagueId: league.id,
    type: "announcement",
    title: "Welcome to Dev League",
    message: "This is a local dev environment. Reseed anytime.",
  });
  console.log("  ✓ notifications");

  console.log(`
Done. Quick reference:
  League:      Dev League  (id=${league.id}, invite=DEVTEST)
  Week:        2024 Week 1 (id=${week.id})
  Logins:      admin@dev.local | alice@dev.local | bob@dev.local | carol@dev.local
  Parlays:     Alice=pending, Bob=approved, Carol=rejected
`);
  process.exit(0);
}

seed().catch(err => { console.error("Seed failed:", err); process.exit(1); });