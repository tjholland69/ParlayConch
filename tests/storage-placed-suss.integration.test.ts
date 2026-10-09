import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, leagueWeekLocks, legSussVotes, parlayLegDisputes } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";
import { sussLevel } from "@shared/suss";

/**
 * A locked parlay going to a sportsbook (placed by confirmation or at
 * kickoff, and the Maestro's bust-and-reopen), the anonymous Suss Meter
 * votes, and the Disputes and Suss reports.
 */
describe("placed parlays, reopening, and the Suss Meter", () => {
  setupTestDatabase();

  const members = ["ps-maestro", "ps-amy", "ps-bo", "ps-cal", "ps-dee"];
  let leagueId = 0;
  let weekId = 0;
  let gameIds: number[] = [];

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values(members.map((id) => ({ id, email: `${id}@example.com`, firstName: id.slice(3) })));
    const [league] = await db.insert(leagues)
      .values({ name: "Placed League", inviteCode: "PLACED0001", minLegsPerParlay: 2, maxLegsPerParlay: 5 })
      .returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values(members.map((userId, i) => ({ leagueId, userId, role: i === 0 ? "admin" : "member" })));
    const [week] = await db.insert(weeks).values({ season: 2043, weekNumber: 1, label: "2043 Week 1", isActive: false }).returning();
    weekId = week.id;
    const kickoff = new Date(Date.now() + 86_400_000);
    const rows = await db.insert(games).values(
      ["A", "B", "C", "D", "E"].map((t) => ({
        weekId, homeTeam: `${t}-home`, awayTeam: `${t}-away`, spread: "-3.5", overUnder: "44.5", gameTime: kickoff,
      })),
    ).returning();
    gameIds = rows.map((g) => g.id);
  });

  const spread = (game: number) => ({ gameId: gameIds[game], betType: "spread", pick: "home", line: "-3.5 (-110)" });
  const parlayRow = async (parlayId: number) => {
    const { db } = await import("../server/db");
    return (await db.select().from(parlays).where(eq(parlays.id, parlayId)))[0];
  };
  const legOf = async (parlayId: number, userId: string) => {
    const { db } = await import("../server/db");
    return (await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId))).find((l) => l.userId === userId)!;
  };
  const kickOff = async (game: number) => {
    const { db } = await import("../server/db");
    await db.update(games).set({ gameTime: new Date(Date.now() - 60_000) }).where(eq(games.id, gameIds[game]));
  };

  let parlayId = 0;

  test("down votes are counted per pick, never on your own, and only while the parlay is open", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    parlayId = (await storage.setDraftPick("ps-amy", leagueId, weekId, spread(0))).id;
    await storage.setDraftPick("ps-bo", leagueId, weekId, spread(1));
    const amyLeg = await legOf(parlayId, "ps-amy");

    await expect(storage.setSussVote(amyLeg.id, "ps-amy", true)).rejects.toThrow(/your own pick/);
    await expect(storage.setSussVote(amyLeg.id, "not-a-member", true)).rejects.toThrow(/Only league members/);

    // Four others can vote on Amy's pick. Two of four is half: no meter yet.
    await storage.setSussVote(amyLeg.id, "ps-bo", true);
    await storage.setSussVote(amyLeg.id, "ps-bo", true); // a repeat vote counts once
    await storage.setSussVote(amyLeg.id, "ps-cal", true);
    let suss = await storage.getSussForLeague(leagueId, "ps-bo", weekId);
    expect(suss[amyLeg.id]).toEqual({ votes: 2, voters: 4, mine: true });
    expect(sussLevel(suss[amyLeg.id])).toBe(0);

    await storage.setSussVote(amyLeg.id, "ps-dee", true);
    await storage.setSussVote(amyLeg.id, "ps-maestro", true);
    suss = await storage.getSussForLeague(leagueId, "ps-amy", weekId);
    // Everyone but Amy: full. Amy sees the count, and that she didn't vote.
    expect(suss[amyLeg.id]).toEqual({ votes: 4, voters: 4, mine: false });
    expect(sussLevel(suss[amyLeg.id])).toBe(3);
    // What goes to a client is counts only: no voter ids anywhere in it.
    expect(JSON.stringify(suss)).not.toMatch(/ps-(bo|cal|dee|maestro)/);

    // A vote can be taken back.
    await storage.setSussVote(amyLeg.id, "ps-maestro", false);
    expect((await storage.getSussForLeague(leagueId, null, weekId))[amyLeg.id].votes).toBe(3);

    // Changing the pick clears its votes: they were about the old bet.
    await storage.setDraftPick("ps-amy", leagueId, weekId, spread(2));
    const newLeg = await legOf(parlayId, "ps-amy");
    expect((await storage.getSussForLeague(leagueId, null, weekId))[newLeg.id]).toEqual({ votes: 0, voters: 4, mine: false });
    const { db } = await import("../server/db");
    expect(await db.select().from(legSussVotes).where(eq(legSussVotes.parlayLegId, amyLeg.id))).toHaveLength(0);
  });

  test("the Suss Report grades the open parlay's picks without naming voters", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { getLeagueReport } = await import("../server/services/reports");
    const boLeg = await legOf(parlayId, "ps-bo");
    await storage.setSussVote(boLeg.id, "ps-amy", true);
    await storage.setSussVote(boLeg.id, "ps-cal", true);
    await storage.setSussVote(boLeg.id, "ps-dee", true);
    const report = await getLeagueReport(leagueId, "suss");
    expect(report!.dataset.rows.map((r) => [r.member, r.down_votes, r.possible_votes, r.suss_pct])).toEqual([
      ["bo", 3, 4, 75],
      ["amy", 0, 4, 0],
    ]);
    expect(JSON.stringify(report)).not.toMatch(/ps-/);
  });

  test("only a locked parlay can be marked placed, by any member", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await expect(storage.confirmParlayPlaced(parlayId)).rejects.toThrow(/Only a locked parlay/);
    await storage.lockWeekParlay(leagueId, weekId, "ps-maestro", true);
    expect((await parlayRow(parlayId)).status).toBe("pending");
    // Votes stop once it's locked.
    await expect(storage.setSussVote((await legOf(parlayId, "ps-bo")).id, "ps-maestro", true)).rejects.toThrow(/while the parlay is open/);
    // The games haven't started, and it still goes to Placed on a member's word.
    expect((await storage.confirmParlayPlaced(parlayId)).status).toBe("placed");
    expect((await storage.confirmParlayPlaced(parlayId)).status).toBe("placed");
  });

  test("the Maestro can bust it back open, but a pick on a started game stays put", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    // Bo's game kicks off while the parlay is placed.
    await kickOff(1);
    const reopened = await storage.reopenParlay(parlayId);
    expect(reopened.status).toBe("draft");
    expect(await db.select().from(leagueWeekLocks).where(eq(leagueWeekLocks.weekId, weekId))).toHaveLength(0);

    // Amy's game hasn't started: she can still change her pick.
    await storage.setDraftPick("ps-amy", leagueId, weekId, spread(3));
    expect((await legOf(parlayId, "ps-amy")).gameId).toBe(gameIds[3]);
    // Bo's has: his pick can't be swapped out, removed, or re-bet.
    await expect(storage.setDraftPick("ps-bo", leagueId, weekId, spread(4))).rejects.toThrow(/already started, so it can no longer be changed/);
    await expect(storage.removeDraftParlayLeg("ps-maestro", parlayId, (await legOf(parlayId, "ps-bo")).id, { canRemoveOthers: true }))
      .rejects.toThrow(/can no longer be removed/);
    await expect(storage.setDraftPick("ps-cal", leagueId, weekId, spread(1))).rejects.toThrow(/already started/);
    expect((await legOf(parlayId, "ps-bo")).gameId).toBe(gameIds[1]);

    // A settled parlay isn't reopened this way.
    await db.update(parlays).set({ status: "loss" }).where(eq(parlays.id, parlayId));
    await expect(storage.reopenParlay(parlayId)).rejects.toThrow(/hasn't settled/);
    await db.update(parlays).set({ status: "draft" }).where(eq(parlays.id, parlayId));
  });

  test("a locked parlay whose game has kicked off is taken as placed", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    // Still open: kickoff alone doesn't place a parlay nobody locked.
    expect(await storage.markStartedParlaysPlaced()).toBe(0);
    expect((await parlayRow(parlayId)).status).toBe("draft");

    await storage.lockWeekParlay(leagueId, weekId, "ps-maestro", true);
    expect((await parlayRow(parlayId)).status).toBe("pending");
    expect(await storage.markStartedParlaysPlaced()).toBe(1);
    expect((await parlayRow(parlayId)).status).toBe("placed");
    expect(await storage.markStartedParlaysPlaced()).toBe(0);
  });

  test("both rulings stay on record for the Disputes Report", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { getLeagueReport } = await import("../server/services/reports");
    const { db } = await import("../server/db");
    const amyLeg = await legOf(parlayId, "ps-amy");
    const boLeg = await legOf(parlayId, "ps-bo");
    const upheld = await storage.createDispute({ parlayLegId: amyLeg.id, raisedByUserId: "ps-amy", reasonType: "result_wrong", justification: "It covered" });
    const dismissed = await storage.createDispute({ parlayLegId: boLeg.id, raisedByUserId: "ps-bo", reasonType: "entered_incorrectly", justification: "Wrong line", screenshotKey: "shot.png" });
    await storage.createDispute({ parlayLegId: boLeg.id, raisedByUserId: "ps-bo", reasonType: "result_wrong", justification: "Check again" });
    await storage.resolveDispute(upheld.id, "ps-maestro", "resolved", "Regraded to a win");
    await storage.resolveDispute(dismissed.id, "ps-maestro", "dismissed", "Line was right");

    // The dismissed one is kept, minus its screenshot.
    const [kept] = await db.select().from(parlayLegDisputes).where(eq(parlayLegDisputes.id, dismissed.id));
    expect(kept).toMatchObject({ status: "dismissed", screenshotKey: null, resolutionNotes: "Line was right" });

    const report = await getLeagueReport(leagueId, "disputes");
    expect(report!.chart.bars.map((b) => [b.label, b.value])).toEqual([["Upheld", 1], ["Dismissed", 1], ["Open", 1]]);
    const byId = new Map(report!.dataset.rows.map((r) => [r.dispute_id, r]));
    expect(byId.get(upheld.id)).toMatchObject({
      raised_by: "amy", bet_owner: "amy", season: 2043, week: 1, reason: "Result is wrong",
      ruling: "Upheld", ruled_by: "maestro", ruling_notes: "Regraded to a win",
    });
    expect(byId.get(dismissed.id)).toMatchObject({ ruling: "Dismissed", reason: "Bet entered incorrectly" });
    expect(report!.text.split("\n")[1]).toBe("3 raised: 1 upheld, 1 dismissed, 1 open");
  });
});
