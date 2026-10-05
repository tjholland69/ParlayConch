import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, parlays, parlayLegs, players } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb } from "./helpers/test-db";

describe("weekly parlay status, boost, active week and player search", () => {
  setupTestDatabase();

  test("members are counted by legs contributed, not parlay rows", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const ids = ["wf-owner", "wf-amy", "wf-bo", "wf-cal"];
    await db.insert(users).values(ids.map((id) => ({ id, email: `${id}@example.com`, isDemo: false })));
    const [league] = await db.insert(leagues).values({ name: "Feedback League", inviteCode: "WFLEAGUE01" }).returning();
    await db.insert(leagueMembers).values(ids.map((userId, i) => ({ leagueId: league.id, userId, role: i === 0 ? "admin" : "member" })));
    const [week] = await db.insert(weeks).values({ season: 2031, weekNumber: 1, label: "2031 Week 1" }).returning();
    const [other] = await db.insert(weeks).values({ season: 2031, weekNumber: 2, label: "2031 Week 2", isActive: true }).returning();

    // One shared parlay: the owner and Amy each have a leg in it.
    const [shared] = await db.insert(parlays).values({ userId: "wf-owner", leagueId: league.id, weekId: week.id, status: "pending" }).returning();
    await db.insert(parlayLegs).values([
      { parlayId: shared.id, userId: "wf-owner", betType: "moneyline", pick: "home" },
      { parlayId: shared.id, userId: "wf-amy", betType: "moneyline", pick: "away" },
    ]);
    // Bo has only started a draft, which doesn't count.
    const [draft] = await db.insert(parlays).values({ userId: "wf-bo", leagueId: league.id, weekId: week.id, status: "draft" }).returning();
    await db.insert(parlayLegs).values({ parlayId: draft.id, userId: "wf-bo", betType: "moneyline", pick: "home" });

    const lock = await storage.getWeekLockStatus(league.id, week.id);
    expect(lock.submittedCount).toBe(2);
    expect(lock.totalMembers).toBe(4);
    expect(lock.allSubmitted).toBe(false);
    expect([...lock.missingMemberIds].sort()).toEqual(["wf-bo", "wf-cal"]);

    // setActiveWeek moves the flag in one step: exactly one active week after.
    await storage.setActiveWeek(week.id);
    const active = (await db.select().from(weeks)).filter((w) => w.isActive);
    expect(active.map((w) => w.id)).toEqual([week.id]);
    expect(active.some((w) => w.id === other.id)).toBe(false);

    const status = (await storage.getActiveWeekParlayStatus([league.id], "wf-amy"))[league.id];
    expect(status.submittedCount).toBe(2);
    expect(status.currentUserSubmitted).toBe(true); // has a leg in, though she owns no parlay
    expect(status.hasPendingParlay).toBe(true);
    expect([...status.missingMemberIds].sort()).toEqual(["wf-bo", "wf-cal"]);
    const bo = (await storage.getActiveWeekParlayStatus([league.id], "wf-bo"))[league.id];
    expect(bo.currentUserSubmitted).toBe(false);
    expect(bo.currentUserHasUnsubmittedDraft).toBe(true);
  });

  test("a boost can be set on submit and changed or cleared afterwards", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const [draft] = await db.select().from(parlays).where(eq(parlays.userId, "wf-bo"));
    const submitted = await storage.submitDraftParlay("wf-bo", draft.id, 1, 5, 25);
    expect(submitted.status).toBe("pending");
    expect(submitted.boostPct).toBe(25);

    // Editable once live: a boost is often recorded after the bet is placed.
    await db.update(parlays).set({ status: "placed" }).where(eq(parlays.id, draft.id));
    expect((await storage.setParlayBoost(draft.id, 30)).boostPct).toBe(30);
    const cleared = await storage.setParlayBoost(draft.id, null);
    expect(cleared.boostPct).toBeNull();
    expect(cleared.status).toBe("placed");
  });

  test("player search ranks by prop picks in the caller's leagues, then alphabetically", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    await db.insert(players).values([
      { name: "Zzq Alpha", displayName: "Zzq Alpha", position: "WR", team: "KC" },
      { name: "Zzq Bravo", displayName: "Zzq Bravo", position: "RB", team: "KC" },
      { name: "Zzq Charlie", displayName: "Zzq Charlie", position: "QB", team: "KC" },
      { name: "Zzq Delta", displayName: "Zzq Delta", position: "TE", team: "BUF" },
    ]);
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, "WFLEAGUE01"));
    const [shared] = await db.select().from(parlays).where(eq(parlays.userId, "wf-owner"));
    const prop = (userId: string, playerName: string) => ({
      parlayId: shared.id, userId, betType: "player_prop", pick: "over", line: "49.5", propType: "rec_yards", playerName,
    });
    // Charlie picked twice, Bravo and Delta once each, Alpha never.
    await db.insert(parlayLegs).values([
      prop("wf-owner", "Zzq Charlie"), prop("wf-amy", "Zzq Charlie"), prop("wf-cal", "Zzq Bravo"), prop("wf-bo", "Zzq Delta"),
    ]);

    const names = async (opts: Parameters<typeof storage.searchPlayers>[2]) =>
      (await storage.searchPlayers("zzq", 25, opts)).map((p) => p.displayName);
    expect(await names({ leagueIds: [league.id] })).toEqual(["Zzq Charlie", "Zzq Bravo", "Zzq Delta", "Zzq Alpha"]);
    // Scoped to one game's rosters (the prop picker): Delta's team isn't playing.
    expect(await names({ teams: ["KC"], leagueIds: [league.id] })).toEqual(["Zzq Charlie", "Zzq Bravo", "Zzq Alpha"]);
    // Picks in someone else's league don't count: all level, so alphabetical.
    expect(await names({ leagueIds: [league.id + 9999] })).toEqual(["Zzq Alpha", "Zzq Bravo", "Zzq Charlie", "Zzq Delta"]);
  });
});
