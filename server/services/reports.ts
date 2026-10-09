/**
 * Gathers the rows behind each league report and hands them to the builders
 * in shared/reports.ts. See that file for what a report is.
 */
import { and, eq, inArray, not } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { storage } from "../storage";
import { games, leagues, parlayLegDisputes, parlayLegs, parlays, users, weeks } from "@shared/db-schema";
import type { UserSettings } from "@shared/schema";
import { loserLabelText } from "@shared/leagueLabels";
import { legShortLabel } from "@shared/formatPick";
import {
  buildAllocationReport,
  buildDisputesReport,
  buildLoserReport,
  buildSussReport,
  buildStandingsReport,
  type Report,
  type ReportId,
} from "@shared/reports";

export type ReportScope = "season" | "all";

/** Parlays that never became a real bet don't belong in a report. */
const NOT_A_BET = ["draft", "void", "rejected"];

async function currentSeason(): Promise<number | null> {
  const [active] = await db.select({ season: weeks.season }).from(weeks).where(eq(weeks.isActive, true)).limit(1);
  if (active) return active.season;
  const seasons = await storage.getDistinctSeasons();
  return seasons.length > 0 ? Math.max(...seasons) : null;
}

const ms = (t: Date | null | undefined) => (t ? new Date(t).getTime() : null);

async function loserReport(league: typeof leagues.$inferSelect, season: number): Promise<Report> {
  const rows = await db
    .select({ parlay: parlays, week: weeks })
    .from(parlays)
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(and(eq(parlays.leagueId, league.id), eq(weeks.season, season), not(inArray(parlays.status, NOT_A_BET))));
  const lost = rows.filter((r) => r.parlay.status === "loss").map((r) => r.parlay.id);
  const legRows = lost.length === 0 ? [] : await db
    .select({ leg: parlayLegs, game: games, owner: users })
    .from(parlayLegs)
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .leftJoin(users, eq(parlayLegs.userId, users.id))
    .where(and(inArray(parlayLegs.parlayId, lost), eq(parlayLegs.result, "loss")));

  // The busted leg is the losing leg decided first: the same rule the
  // parlay cards use (client/src/lib/parlayLoser.ts).
  const bustedByParlay = new Map<number, (typeof legRows)[number]>();
  const decided = (r: (typeof legRows)[number]) => ms(r.leg.decidedAt) ?? ms(r.game?.finishedAt) ?? Infinity;
  for (const row of legRows) {
    const best = bustedByParlay.get(row.leg.parlayId);
    if (!best || decided(row) < decided(best) || (decided(row) === decided(best) && row.leg.id < best.leg.id)) {
      bustedByParlay.set(row.leg.parlayId, row);
    }
  }

  return buildLoserReport({
    leagueName: league.name,
    season,
    loserLabel: loserLabelText(league.loserLabel),
    emoji: league.shameEmoji,
    weeks: rows.map(({ parlay, week }) => {
      const busted = bustedByParlay.get(parlay.id);
      const owner = busted?.owner;
      return {
        weekNumber: week.weekNumber,
        weekLabel: week.label,
        parlayId: parlay.id,
        parlayStatus: parlay.status,
        loserName: busted
          ? (owner?.settings as UserSettings | null)?.displayName || owner?.firstName || owner?.email || "Unknown"
          : null,
        pick: busted ? legShortLabel(busted.leg, busted.game) : null,
      };
    }),
  });
}

async function allocationReport(league: typeof leagues.$inferSelect, scope: ReportScope, season: number | null): Promise<Report> {
  const rows = await db
    .select({ betType: parlayLegs.betType, result: parlayLegs.result, season: weeks.season })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(and(eq(parlays.leagueId, league.id), not(inArray(parlays.status, NOT_A_BET))));
  const seasonOnly = scope === "season" && season != null;
  return buildAllocationReport({
    leagueName: league.name,
    scopeLabel: seasonOnly ? "Current Year" : "All Time",
    season: seasonOnly ? season : null,
    legs: seasonOnly ? rows.filter((r) => r.season === season) : rows,
  });
}

type NameUser = { settings: unknown; firstName: string | null; email: string | null } | null | undefined;
const nameOf = (u: NameUser) => (u?.settings as UserSettings | null)?.displayName || u?.firstName || u?.email || "Unknown";

async function disputesReport(league: typeof leagues.$inferSelect): Promise<Report> {
  const raiser = alias(users, "raiser");
  const owner = alias(users, "bet_owner");
  const resolver = alias(users, "resolver");
  const rows = await db
    .select({ dispute: parlayLegDisputes, leg: parlayLegs, game: games, week: weeks, raiser, owner, resolver })
    .from(parlayLegDisputes)
    .innerJoin(parlayLegs, eq(parlayLegDisputes.parlayLegId, parlayLegs.id))
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .leftJoin(raiser, eq(parlayLegDisputes.raisedByUserId, raiser.id))
    .leftJoin(owner, eq(parlayLegs.userId, owner.id))
    .leftJoin(resolver, eq(parlayLegDisputes.resolvedByUserId, resolver.id))
    .where(eq(parlays.leagueId, league.id));
  return buildDisputesReport({
    leagueName: league.name,
    disputes: rows.map((r) => ({
      id: r.dispute.id,
      raisedAt: r.dispute.createdAt,
      raisedBy: nameOf(r.raiser),
      betOwner: nameOf(r.owner),
      bet: legShortLabel(r.leg, r.game),
      season: r.week.season,
      weekNumber: r.week.weekNumber,
      weekLabel: r.week.label,
      reasonType: r.dispute.reasonType,
      justification: r.dispute.justification,
      status: r.dispute.status,
      resolvedBy: r.resolver ? nameOf(r.resolver) : null,
      resolvedAt: r.dispute.resolvedAt,
      notes: r.dispute.resolutionNotes,
    })),
  });
}

async function sussReport(league: typeof leagues.$inferSelect): Promise<Report> {
  const [rows, suss] = await Promise.all([
    db.select({ parlay: parlays, week: weeks, leg: parlayLegs, game: games, owner: users })
      .from(parlays)
      .innerJoin(weeks, eq(parlays.weekId, weeks.id))
      .innerJoin(parlayLegs, eq(parlayLegs.parlayId, parlays.id))
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .leftJoin(users, eq(parlayLegs.userId, users.id))
      .where(and(eq(parlays.leagueId, league.id), eq(parlays.status, "draft"))),
    storage.getSussForLeague(league.id, null),
  ]);
  const byParlay = new Map<number, { parlayId: number; weekLabel: string; legs: { owner: string; bet: string; votes: number; voters: number }[] }>();
  for (const r of rows) {
    const entry = byParlay.get(r.parlay.id) ?? { parlayId: r.parlay.id, weekLabel: r.week.label, legs: [] };
    const tally = suss[r.leg.id] ?? { votes: 0, voters: 0 };
    entry.legs.push({ owner: nameOf(r.owner), bet: legShortLabel(r.leg, r.game), votes: tally.votes, voters: tally.voters });
    byParlay.set(r.parlay.id, entry);
  }
  return buildSussReport({ leagueName: league.name, parlays: [...byParlay.values()] });
}

/** Null when the league doesn't exist. `scope` only applies to the allocation report. */
export async function getLeagueReport(leagueId: number, reportId: ReportId, scope: ReportScope = "season"): Promise<Report | null> {
  const league = await storage.getLeague(leagueId);
  if (!league) return null;
  const season = await currentSeason();

  switch (reportId) {
    case "standings_season":
    case "standings_all_time": {
      const stats = await storage.getLeagueDataStats(leagueId);
      const isSeason = reportId === "standings_season";
      return buildStandingsReport({
        id: reportId,
        leagueName: league.name,
        scopeLabel: isSeason ? "Current Year" : "All Time",
        season: isSeason ? season : null,
        standings: isSeason ? stats.currentSeasonStandings : stats.allTimeStandings,
      });
    }
    case "loser_report":
      return loserReport(league, season ?? new Date().getFullYear());
    case "allocation":
      return allocationReport(league, scope, season);
    case "disputes":
      return disputesReport(league);
    case "suss":
      return sussReport(league);
  }
}
