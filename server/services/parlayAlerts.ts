/**
 * The alerts that come from results arriving: a parlay busting, and the
 * wrap-up at the end of each slate. Both only speak for the week being
 * played, so regrading or importing old weeks never sends anything, and
 * both are once-only per member (see notifications.dedupeKey).
 */
import { and, eq, inArray, not } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";
import { games, leagues, parlayLegs, parlays, users, weeks } from "@shared/db-schema";
import type { Game, UserSettings, Week } from "@shared/schema";
import { legShortLabel } from "@shared/formatPick";
import { loserLabelText } from "@shared/leagueLabels";
import { groupGamesBySlate } from "@shared/slate";
import { notifyLeague } from "./notify";

const ms = (t: Date | null | undefined) => (t ? new Date(t).getTime() : null);

/** Tells each league whose parlay just lost who busted it. */
export async function announceBustedParlays(parlayIds: number[]): Promise<void> {
  if (parlayIds.length === 0) return;
  try {
    const rows = await db
      .select({ parlay: parlays, league: leagues, week: weeks })
      .from(parlays)
      .innerJoin(leagues, eq(parlays.leagueId, leagues.id))
      .innerJoin(weeks, eq(parlays.weekId, weeks.id))
      .where(and(inArray(parlays.id, parlayIds), eq(parlays.status, "loss"), eq(weeks.isActive, true), eq(parlays.source, "live")));
    if (rows.length === 0) return;

    const lostLegs = await db
      .select({ leg: parlayLegs, game: games, owner: users })
      .from(parlayLegs)
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .leftJoin(users, eq(parlayLegs.userId, users.id))
      .where(and(inArray(parlayLegs.parlayId, rows.map((r) => r.parlay.id)), eq(parlayLegs.result, "loss")));

    for (const { parlay, league, week } of rows) {
      // The losing leg decided first, as on the parlay cards.
      const when = (r: (typeof lostLegs)[number]) => ms(r.leg.decidedAt) ?? ms(r.game?.finishedAt) ?? Infinity;
      const [busted] = lostLegs
        .filter((r) => r.leg.parlayId === parlay.id)
        .sort((a, b) => when(a) - when(b) || a.leg.id - b.leg.id);
      if (!busted) continue;
      const name = (busted.owner?.settings as UserSettings | null)?.displayName || busted.owner?.firstName || busted.owner?.email || "Someone";
      await notifyLeague(league.id, {
        event: "parlay_busted",
        title: `${league.name}: the ${week.label} parlay is busted`,
        message: `${loserLabelText(league.loserLabel)}: ${name} - ${legShortLabel(busted.leg, busted.game)}.`,
        path: `/leagues/${league.id}`,
        dedupeKey: `parlay_busted:${parlay.id}`,
      });
    }
  } catch (err) {
    logger.error({ err }, "[alerts] busted-parlay alert failed");
  }
}

/** A slate older than this when we first notice it's over is old news. */
const SLATE_FRESH_MS = 6 * 60 * 60 * 1000;
/** Slates this process already wrapped up, so each tick doesn't redo the work. */
const announcedSlates = new Set<string>();

/**
 * Once every game in a slate is final, tells each league where its parlay
 * stands. Leagues with no leg in that slate hear nothing.
 */
export async function announceFinishedSlates(week: Week, weekGames: Game[], now: Date = new Date()): Promise<number> {
  let sent = 0;
  try {
    for (const group of groupGamesBySlate(weekGames)) {
      const slateKey = `${week.id}|${group.key}`;
      if (group.key === "tbd" || announcedSlates.has(slateKey)) continue;
      if (!group.games.every((g) => g.isFinished)) continue;
      announcedSlates.add(slateKey);
      const lastFinish = Math.max(...group.games.map((g) => ms(g.finishedAt) ?? 0));
      if (now.getTime() - lastFinish > SLATE_FRESH_MS) continue;

      const slateGameIds = new Set(group.games.map((g) => g.id));
      const rows = await db
        .select({ leg: parlayLegs, parlay: parlays, league: leagues })
        .from(parlayLegs)
        .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
        .innerJoin(leagues, eq(parlays.leagueId, leagues.id))
        .where(and(eq(parlays.weekId, week.id), eq(parlays.source, "live"), not(inArray(parlays.status, ["draft", "void", "rejected"]))));

      const byParlay = new Map<number, typeof rows>();
      for (const row of rows) byParlay.set(row.parlay.id, [...(byParlay.get(row.parlay.id) ?? []), row]);

      for (const legs of byParlay.values()) {
        const inSlate = legs.filter((r) => r.leg.gameId != null && slateGameIds.has(r.leg.gameId));
        if (inSlate.length === 0) continue;
        const { parlay, league } = legs[0];
        const hit = inSlate.filter((r) => r.leg.result === "win").length;
        const lost = legs.some((r) => r.leg.result === "loss");
        const toGo = legs.filter((r) => r.leg.result == null).length;
        const standing = lost
          ? "The parlay is busted."
          : toGo === 0
            ? "Every leg is in: the parlay hit!"
            : `Still alive with ${toGo} leg${toGo === 1 ? "" : "s"} to go.`;
        await notifyLeague(league.id, {
          event: "slate_summary",
          title: `${league.name}: ${group.label} is in the books`,
          message: `${hit} of ${inSlate.length} leg${inSlate.length === 1 ? "" : "s"} hit this slate. ${standing}`,
          path: `/leagues/${league.id}`,
          dedupeKey: `slate_summary:${parlay.id}:${group.key}`,
        });
        sent++;
      }
    }
  } catch (err) {
    logger.error({ err }, "[alerts] slate summary failed");
  }
  return sent;
}
