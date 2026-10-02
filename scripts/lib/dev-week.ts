/**
 * Database side of keeping local dev data testable: moving a stale active
 * week back into the future, and giving the seed users a way to sign in.
 * Shared by scripts/seed-dev.ts and scripts/refresh-dev-week.ts.
 *
 * Everything here refuses to run against a database that isn't on this
 * machine.
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../server/db";
import { games, leagues, leagueWeekLocks, parlays, parlayLegs, userPasswords, users, weeks } from "../../shared/db-schema";
import { DEV_ACTIVE_WEEK_GAMES, devWeekKickoff, isSlateStale, wholeWeekShiftMs } from "./dev-week-schedule";

export const DEV_USER_IDS = ["dev_admin", "dev_user1", "dev_user2", "dev_user3"];
export const DEV_LEAGUE_INVITE_CODE = "DEVTEST";
/** The seed's active week (see seed-dev.ts). */
export const DEV_ACTIVE_WEEK = { season: 2024, weekNumber: 18 };

/**
 * Sign-in password for the seed users, on a local database only. Override
 * with DEV_SEED_PASSWORD in .env.local.
 */
export const DEV_LOGIN_PASSWORD = process.env.DEV_SEED_PASSWORD || "parlay-dev-local";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True when DATABASE_URL points at this machine. */
export function isLocalDatabase(): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

export function assertLocalDatabase(what: string): void {
  if (!isLocalDatabase()) {
    throw new Error(`${what} only runs against a local database (DATABASE_URL host must be localhost).`);
  }
}

/** Gives every seed user that has no password yet the shared dev one, so
 * the "Logins" the seed prints can actually sign in. Returns how many were set. */
export async function ensureDevLogins(): Promise<number> {
  assertLocalDatabase("Setting dev passwords");
  const present = await db.select({ id: users.id }).from(users).where(inArray(users.id, DEV_USER_IDS));
  if (present.length === 0) return 0;
  const withPassword = await db.select({ userId: userPasswords.userId }).from(userPasswords)
    .where(inArray(userPasswords.userId, present.map(u => u.id)));
  const have = new Set(withPassword.map(p => p.userId));
  const missing = present.filter(u => !have.has(u.id));
  if (missing.length === 0) return 0;
  const passwordHash = await bcrypt.hash(DEV_LOGIN_PASSWORD, 10);
  await db.insert(userPasswords).values(missing.map(u => ({ userId: u.id, passwordHash })));
  return missing.length;
}

const NOT_PLAYED = { isFinished: false, homeScore: null, awayScore: null, winner: null, finishedAt: null };

export type RefreshResult = {
  /** Why nothing changed, when nothing did. */
  skipped?: "no-active-week" | "not-stale" | "not-seed-data";
  week?: { id: number; label: string; season: number };
  gamesMoved: number;
  gamesAdded: number;
  locksRemoved: number;
  /** Legs on the moved games that already had a result — left as they are. */
  decidedLegs: number;
  firstKickoff?: Date;
  lastKickoff?: Date;
};

/**
 * Makes the active week pickable again.
 *
 * On the dev seed's own week, every seed game goes back to its slot on the
 * coming weekend, and any seed game that's missing (an older seed had four
 * of them) is added. Any other game in the week — and every game, on other
 * data such as a production replica — is pushed forward by whole weeks, so
 * it keeps its weekday and time slot. Moved games are reset to "not played".
 *
 * Nothing is deleted: parlays, legs and results stay as they are.
 */
export async function refreshActiveWeek(opts: {
  /** Refresh even when some games are still pickable. */
  force?: boolean;
  /** Only touch the dev seed's own week (used by the automatic run). */
  seedDataOnly?: boolean;
  /** Also remove this week's league locks, which block picks on their own. */
  unlock?: boolean;
} = {}): Promise<RefreshResult> {
  assertLocalDatabase("Refreshing the active week");
  const result: RefreshResult = { gamesMoved: 0, gamesAdded: 0, locksRemoved: 0, decidedLegs: 0 };

  const [week] = await db.select().from(weeks).where(eq(weeks.isActive, true));
  if (!week) return { ...result, skipped: "no-active-week" };
  result.week = { id: week.id, label: week.label, season: week.season };

  const [devLeague] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.inviteCode, DEV_LEAGUE_INVITE_CODE));
  const isSeedWeek = !!devLeague && week.season === DEV_ACTIVE_WEEK.season && week.weekNumber === DEV_ACTIVE_WEEK.weekNumber;
  if (opts.seedDataOnly && !isSeedWeek) return { ...result, skipped: "not-seed-data" };

  const weekGames = await db.select().from(games).where(eq(games.weekId, week.id));
  const missingSeedGames = isSeedWeek
    ? DEV_ACTIVE_WEEK_GAMES.filter(d => !weekGames.some(g => g.homeTeam === d.homeTeam && g.awayTeam === d.awayTeam))
    : [];
  if (!opts.force && !isSlateStale(weekGames) && missingSeedGames.length === 0) {
    return { ...result, skipped: "not-stale" };
  }
  // A slate that's only short of games gets topped up, not rescheduled.
  const reschedule = !!opts.force || isSlateStale(weekGames);

  const now = new Date();
  const kickoffs: Date[] = [];
  await db.transaction(async (tx) => {
    const seedGameIds = new Set<number>();
    if (isSeedWeek) {
      for (const def of DEV_ACTIVE_WEEK_GAMES) {
        const gameTime = devWeekKickoff(def, now);
        const existing = weekGames.find(g => g.homeTeam === def.homeTeam && g.awayTeam === def.awayTeam);
        if (!existing) {
          await tx.insert(games).values({
            weekId: week.id, homeTeam: def.homeTeam, awayTeam: def.awayTeam,
            spread: def.spread, spreadOdds: "-110", overUnder: def.overUnder, overOdds: "-110", underOdds: "-110",
            moneylineHome: def.moneylineHome, moneylineAway: def.moneylineAway, gameTime,
          });
          result.gamesAdded++;
          kickoffs.push(gameTime);
          continue;
        }
        seedGameIds.add(existing.id);
        if (!reschedule) continue;
        await tx.update(games).set({ gameTime, ...NOT_PLAYED }).where(eq(games.id, existing.id));
        result.gamesMoved++;
        kickoffs.push(gameTime);
      }
    }

    if (reschedule) {
      const others = weekGames.filter(g => !seedGameIds.has(g.id) && g.gameTime);
      const shiftMs = wholeWeekShiftMs(others.map(g => g.gameTime!), now);
      for (const game of others) {
        const gameTime = new Date(game.gameTime!.getTime() + shiftMs);
        await tx.update(games).set({ gameTime, ...NOT_PLAYED }).where(eq(games.id, game.id));
        result.gamesMoved++;
        kickoffs.push(gameTime);
      }
    }

    if (opts.unlock) {
      const removed = await tx.delete(leagueWeekLocks).where(eq(leagueWeekLocks.weekId, week.id)).returning({ id: leagueWeekLocks.id });
      result.locksRemoved = removed.length;
    }
  });

  if (reschedule && weekGames.length > 0) {
    const decided = await db.select({ id: parlayLegs.id, result: parlayLegs.result }).from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(eq(parlays.weekId, week.id), inArray(parlayLegs.gameId, weekGames.map(g => g.id))));
    result.decidedLegs = decided.filter(l => l.result != null).length;
  }
  if (kickoffs.length > 0) {
    result.firstKickoff = new Date(Math.min(...kickoffs.map(k => k.getTime())));
    result.lastKickoff = new Date(Math.max(...kickoffs.map(k => k.getTime())));
  }
  return result;
}
