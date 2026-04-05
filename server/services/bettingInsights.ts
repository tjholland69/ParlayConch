import OpenAI from "openai";
import { db } from "../db";
import { parlayLegs, parlays, games, leagueMembers } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type InsightFocus = "general" | "bet_types" | "teams" | "props" | "trends";

interface LegRecord {
  wins: number;
  losses: number;
  pushes: number;
  total: number;
  winRate: number | null; // null if no decided legs
}

function emptyRecord(): LegRecord {
  return { wins: 0, losses: 0, pushes: 0, total: 0, winRate: null };
}

function addResult(rec: LegRecord, result: string | null) {
  if (!result) return;
  rec.total++;
  if (result === "win") rec.wins++;
  else if (result === "loss") rec.losses++;
  else if (result === "push") rec.pushes++;
  const decided = rec.wins + rec.losses;
  rec.winRate = decided > 0 ? Math.round((rec.wins / decided) * 100) : null;
}

export interface BettingStats {
  scope: "user" | "league";
  entityName: string;
  totalLegs: number;
  record: LegRecord;
  byBetType: Record<string, LegRecord>;
  spreadPick: { home: LegRecord; away: LegRecord };
  totalsPick: { over: LegRecord; under: LegRecord };
  byPropType: Record<string, LegRecord>;
  topTeams: { team: string; record: LegRecord }[];
  recentForm: { winRate: number | null; legs: number };
  favoritePlayer: { name: string; count: number } | null;
  leagueMemberCount?: number;
}

interface RawLeg {
  result: string | null;
  betType: string;
  pick: string;
  playerName: string | null;
  propType: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  legIndex: number; // chronological order proxy
}

function computeStats(
  legs: RawLeg[],
  scope: "user" | "league",
  entityName: string,
  memberCount?: number
): BettingStats {
  const record = emptyRecord();
  const byBetType: Record<string, LegRecord> = {};
  const spreadPick = { home: emptyRecord(), away: emptyRecord() };
  const totalsPick = { over: emptyRecord(), under: emptyRecord() };
  const byPropType: Record<string, LegRecord> = {};
  const teamMap: Record<string, LegRecord> = {};
  const playerCount: Record<string, number> = {};
  const recent = legs.slice(-20);

  for (const leg of legs) {
    addResult(record, leg.result);

    const bt = leg.betType;
    if (!byBetType[bt]) byBetType[bt] = emptyRecord();
    addResult(byBetType[bt], leg.result);

    if (bt === "spread") {
      if (leg.pick === "home") addResult(spreadPick.home, leg.result);
      else if (leg.pick === "away") addResult(spreadPick.away, leg.result);

      // Track team tendencies for spread bets
      const pickedTeam =
        leg.pick === "home" ? leg.homeTeam : leg.pick === "away" ? leg.awayTeam : null;
      if (pickedTeam) {
        if (!teamMap[pickedTeam]) teamMap[pickedTeam] = emptyRecord();
        addResult(teamMap[pickedTeam], leg.result);
      }
    }

    if (bt === "moneyline") {
      const pickedTeam =
        leg.pick === "home" ? leg.homeTeam : leg.pick === "away" ? leg.awayTeam : null;
      if (pickedTeam) {
        if (!teamMap[pickedTeam]) teamMap[pickedTeam] = emptyRecord();
        addResult(teamMap[pickedTeam], leg.result);
      }
    }

    if (bt === "over" || bt === "under") {
      if (bt === "over" || leg.pick === "over")
        addResult(totalsPick.over, leg.result);
      else addResult(totalsPick.under, leg.result);
    }

    if (bt === "player_prop") {
      const pt = leg.propType ?? "unknown";
      if (!byPropType[pt]) byPropType[pt] = emptyRecord();
      addResult(byPropType[pt], leg.result);
      if (leg.playerName) {
        playerCount[leg.playerName] = (playerCount[leg.playerName] ?? 0) + 1;
      }
    }
  }

  // Recent form (last 20 resolved legs)
  const recentResolved = recent.filter((l) => l.result === "win" || l.result === "loss");
  const recentWins = recentResolved.filter((l) => l.result === "win").length;
  const recentForm = {
    legs: recentResolved.length,
    winRate:
      recentResolved.length > 0
        ? Math.round((recentWins / recentResolved.length) * 100)
        : null,
  };

  // Top 5 teams by volume
  const topTeams = Object.entries(teamMap)
    .filter(([, r]) => r.total >= 2)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([team, rec]) => ({ team, record: rec }));

  // Favorite player
  const playerEntries = Object.entries(playerCount).sort((a, b) => b[1] - a[1]);
  const favoritePlayer =
    playerEntries.length > 0
      ? { name: playerEntries[0][0], count: playerEntries[0][1] }
      : null;

  return {
    scope,
    entityName,
    totalLegs: legs.length,
    record,
    byBetType,
    spreadPick,
    totalsPick,
    byPropType,
    topTeams,
    recentForm,
    favoritePlayer,
    ...(memberCount !== undefined ? { leagueMemberCount: memberCount } : {}),
  };
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchUserLegs(userId: string, leagueId?: number): Promise<RawLeg[]> {
  const conditions = [eq(parlays.userId, userId)];
  if (leagueId) conditions.push(eq(parlays.leagueId, leagueId));

  const rows = await db
    .select({
      result: parlayLegs.result,
      betType: parlayLegs.betType,
      pick: parlayLegs.pick,
      playerName: parlayLegs.playerName,
      propType: parlayLegs.propType,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      parlayId: parlays.id,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(and(...conditions));

  return rows.map((r, i) => ({ ...r, legIndex: i }));
}

async function fetchLeagueLegs(leagueId: number): Promise<{ legs: RawLeg[]; memberCount: number }> {
  const memberRows = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));

  const memberCount = memberRows.length;
  const memberIds = memberRows.map((m) => m.userId);
  if (memberIds.length === 0) return { legs: [], memberCount: 0 };

  const rows = await db
    .select({
      result: parlayLegs.result,
      betType: parlayLegs.betType,
      pick: parlayLegs.pick,
      playerName: parlayLegs.playerName,
      propType: parlayLegs.propType,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      parlayId: parlays.id,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(
      and(
        eq(parlays.leagueId, leagueId),
        inArray(parlays.userId, memberIds)
      )
    );

  return { legs: rows.map((r, i) => ({ ...r, legIndex: i })), memberCount };
}

// ─── OpenAI Commentary ────────────────────────────────────────────────────────

function buildPrompt(stats: BettingStats, focus: InsightFocus): string {
  const name = stats.entityName;
  const scope = stats.scope === "league" ? "league" : "bettor";
  const isLeague = stats.scope === "league";

  const r = stats.record;
  const overall = r.total > 0
    ? `${r.wins}W-${r.losses}L-${r.pushes}P (${r.winRate ?? "N/A"}% win rate, ${r.total} resolved legs)`
    : "no resolved legs yet";

  const betTypeLines = Object.entries(stats.byBetType)
    .filter(([, rec]) => rec.total > 0)
    .map(([bt, rec]) => `  ${bt}: ${rec.wins}W-${rec.losses}L-${rec.pushes}P (${rec.winRate ?? "?"}% win rate, ${rec.total} legs)`)
    .join("\n");

  const spreadLines = [
    `  Spread - picking home: ${stats.spreadPick.home.wins}W-${stats.spreadPick.home.losses}L (${stats.spreadPick.home.winRate ?? "?"}%)`,
    `  Spread - picking away: ${stats.spreadPick.away.wins}W-${stats.spreadPick.away.losses}L (${stats.spreadPick.away.winRate ?? "?"}%)`,
    `  Totals - over: ${stats.totalsPick.over.wins}W-${stats.totalsPick.over.losses}L (${stats.totalsPick.over.winRate ?? "?"}%)`,
    `  Totals - under: ${stats.totalsPick.under.wins}W-${stats.totalsPick.under.losses}L (${stats.totalsPick.under.winRate ?? "?"}%)`,
  ].join("\n");

  const propLines = Object.entries(stats.byPropType)
    .filter(([, rec]) => rec.total > 0)
    .map(([pt, rec]) => `  ${pt}: ${rec.wins}W-${rec.losses}L (${rec.winRate ?? "?"}%)`)
    .join("\n");

  const teamLines = stats.topTeams
    .map((t) => `  ${t.team}: ${t.record.wins}W-${t.record.losses}L (${t.record.winRate ?? "?"}%)`)
    .join("\n");

  const recentStr = stats.recentForm.legs > 0
    ? `${stats.recentForm.winRate ?? "?"}% over last ${stats.recentForm.legs} resolved legs`
    : "no recent data";

  const playerStr = stats.favoritePlayer
    ? `${stats.favoritePlayer.name} (${stats.favoritePlayer.count} bets)`
    : "none";

  const leagueNote = isLeague
    ? `This is a league with ${stats.leagueMemberCount} members. Commentary should reflect aggregate league tendencies.\n`
    : "";

  const focusInstructions: Record<InsightFocus, string> = {
    general: "Provide a well-rounded 3-5 sentence commentary covering overall performance, standout strengths or weaknesses, and one notable pattern.",
    bet_types: "Focus specifically on how different bet types perform. Identify the best and worst performing bet types. Mention over/under and spread tendencies. Keep it to 3-4 sentences.",
    teams: "Focus on team-specific betting tendencies. Highlight which teams have been most or least profitable picks. Mention home vs. away tendencies on the spread if notable. Keep it to 3-4 sentences.",
    props: "Focus specifically on player prop betting. Comment on which prop types perform best/worst, any favorite players, and over/under tendencies on props. Keep it to 3-4 sentences.",
    trends: "Focus on trajectory and recent form compared to overall performance. Is performance improving or declining? Identify any hot or cold streaks. Keep it to 3-4 sentences.",
  };

  return `You are a sharp, witty sports betting analyst providing candid performance commentary for a ${scope} named "${name}".
${leagueNote}
Use conversational, direct language — like a knowledgeable friend giving honest feedback, not a formal report. Use "you" for individual bettors, "your league" for leagues. Be specific with numbers when they're telling. If the data is sparse, acknowledge it briefly and comment on what's there.

${focusInstructions[focus]}

DATA:
Overall: ${overall}
Recent form: ${recentStr}

By bet type:
${betTypeLines || "  No data"}

Home/Away & Totals tendencies:
${spreadLines}

Player props by type:
${propLines || "  No props data"}

Most bet teams:
${teamLines || "  No team data"}

Favorite prop player: ${playerStr}

Write ONLY the commentary paragraphs — no headers, no bullet points, no JSON. Plain conversational text.`;
}

async function generateCommentary(
  stats: BettingStats,
  focus: InsightFocus
): Promise<string> {
  if (stats.totalLegs === 0) {
    return stats.scope === "league"
      ? "Your league hasn't logged any picks yet. Once members start submitting parlays, you'll see betting tendency insights here."
      : "You haven't logged any picks yet. Once you submit some parlays, you'll see personalized betting insights here.";
  }

  const prompt = buildPrompt(stats, focus);
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 400,
  });
  return response.choices[0]?.message?.content?.trim() ?? "Unable to generate insights at this time.";
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getUserInsights(
  userId: string,
  userName: string,
  focus: InsightFocus = "general",
  leagueId?: number
): Promise<{ stats: BettingStats; commentary: string }> {
  const legs = await fetchUserLegs(userId, leagueId);
  const stats = computeStats(legs, "user", userName);
  const commentary = await generateCommentary(stats, focus);
  return { stats, commentary };
}

export async function getLeagueInsights(
  leagueId: number,
  leagueName: string,
  focus: InsightFocus = "general"
): Promise<{ stats: BettingStats; commentary: string }> {
  const { legs, memberCount } = await fetchLeagueLegs(leagueId);
  const stats = computeStats(legs, "league", leagueName, memberCount);
  const commentary = await generateCommentary(stats, focus);
  return { stats, commentary };
}
