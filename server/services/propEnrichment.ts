/**
 * Prop bet enrichment service
 *
 * Two capabilities:
 *   1. resolvePropsFromStats()   — reads already-synced player_week_stats rows
 *      and calculates win/loss for over/under/yes/no prop legs.
 *   2. fetchPropLinesFromOddsApi() — fetches player prop lines/odds from
 *      The Odds API and writes them back to parlay legs that are missing odds.
 *
 * Both functions are safe to run multiple times (idempotent).
 */

import { db } from "../db";
import { parlayLegs, parlays, weeks } from "@shared/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { storage } from "../storage";

const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT    = "americanfootball_nfl";

// ─── Prop type → stat column mapping ─────────────────────────────────────────

type StatKey =
  | "rushingYards" | "rushingTds" | "carries"
  | "receivingYards" | "receivingTds" | "receptions"
  | "passingYards" | "passingTds" | "attempts" | "completions" | "interceptions"
  | "defSacks"
  | "fantasyPoints";

/**
 * For numeric over/under props: which stat column to read.
 * TD-scorer props (anytime_td etc.) use a separate yes/no path.
 * "tackles" isn't here — it's solo + assist combined, resolved separately
 * below rather than as a single-column lookup.
 */
const PROP_TYPE_TO_STAT: Partial<Record<string, StatKey>> = {
  rush_yards:       "rushingYards",
  rush_attempts:    "carries",
  rec_yards:        "receivingYards",
  receptions:       "receptions",
  pass_yards:       "passingYards",
  pass_tds:         "passingTds",
  pass_attempts:    "attempts",
  pass_completions: "completions",
  interceptions:    "interceptions",
  sacks:            "defSacks",
  kicking_pts:      "fantasyPoints",   // best available proxy
};

/** TD-scorer props where pick='yes'/'no' and we check for any TD scored */
const TD_SCORER_PROPS = new Set(["anytime_td", "first_td", "last_td", "rec_tds", "rush_tds"]);

// ─── 1. Resolve prop results from nflverse player stats ──────────────────────

export interface PropResolveResult {
  resolved: number;
  skipped:  number;
  noStats:  number;
  errors:   number;
  details:  string[];
}

export async function resolvePropsFromStats(): Promise<PropResolveResult> {
  const result: PropResolveResult = { resolved: 0, skipped: 0, noStats: 0, errors: 0, details: [] };

  // Fetch all prop legs that have a player name + prop type, no result yet,
  // and belong to a parlay with a known weekId.
  const rows = await db
    .select({ leg: parlayLegs, weekId: parlays.weekId })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .where(
      and(
        eq(parlayLegs.betType, "player_prop"),
        isNull(parlayLegs.result),
        isNotNull(parlayLegs.playerName),
        isNotNull(parlayLegs.propType),
      )
    );

  if (rows.length === 0) {
    result.details.push("No unresolved prop legs found.");
    return result;
  }

  result.details.push(`Found ${rows.length} unresolved prop legs.`);

  for (const { leg, weekId } of rows) {
    if (!leg.playerName || !leg.propType) { result.skipped++; continue; }

    try {
      // Look up the week's season + week number
      const [weekRow] = await db.select().from(weeks).where(eq(weeks.id, weekId));
      if (!weekRow) { result.skipped++; continue; }

      const stat = await storage.getPlayerStatByName(leg.playerName, weekRow.season, weekRow.weekNumber);
      if (!stat) {
        result.noStats++;
        result.details.push(`No stats found for "${leg.playerName}" week ${weekRow.weekNumber} ${weekRow.season}`);
        continue;
      }

      let legResult: "win" | "loss" | "push" | null = null;
      const pick   = (leg.pick ?? "").toLowerCase();
      const lineRaw = parseFloat(leg.line ?? "");
      const propType = leg.propType;

      // ── TD scorer props (yes/no) ──────────────────────────────────────────
      if (TD_SCORER_PROPS.has(propType)) {
        let tds = 0;
        if (propType === "rush_tds")    tds = stat.rushingTds   ?? 0;
        else if (propType === "rec_tds") tds = stat.receivingTds ?? 0;
        else {
          // anytime_td / first_td / last_td — any TD counts
          tds = (stat.rushingTds ?? 0) + (stat.receivingTds ?? 0) + (stat.passingTds ?? 0);
        }
        if (pick === "yes")       legResult = tds > 0 ? "win" : "loss";
        else if (pick === "no")   legResult = tds === 0 ? "win" : "loss";

      // ── FG made (yes/no or over/under) ────────────────────────────────────
      } else if (propType === "fg_made") {
        // We don't have kicker FG data in player_week_stats; skip.
        result.skipped++;
        result.details.push(`Skipped fg_made for "${leg.playerName}" — no FG column in stats`);
        continue;

      // ── All-purpose yards (rushing + receiving combined) ─────────────────
      } else if (propType === "all_purpose_yards") {
        if (isNaN(lineRaw)) {
          result.skipped++;
          result.details.push(`No numeric line for "${leg.playerName}" ${propType} — skipped`);
          continue;
        }
        if (stat.rushingYards == null && stat.receivingYards == null) {
          result.noStats++;
          result.details.push(`Neither rushing nor receiving yards tracked for "${leg.playerName}" week ${weekRow.weekNumber}`);
          continue;
        }
        const actual = (stat.rushingYards ?? 0) + (stat.receivingYards ?? 0);
        if (actual > lineRaw)        legResult = pick === "over"  ? "win" : "loss";
        else if (actual < lineRaw)   legResult = pick === "under" ? "win" : "loss";
        else                         legResult = "push";

      // ── Tackles (solo + assist combined — the standard sportsbook line) ──
      } else if (propType === "tackles") {
        if (isNaN(lineRaw)) {
          result.skipped++;
          result.details.push(`No numeric line for "${leg.playerName}" ${propType} — skipped`);
          continue;
        }
        if (stat.defTacklesSolo == null && stat.defTacklesWithAssist == null) {
          result.noStats++;
          result.details.push(`No defensive tackle stats tracked for "${leg.playerName}" week ${weekRow.weekNumber}`);
          continue;
        }
        const actual = (stat.defTacklesSolo ?? 0) + (stat.defTacklesWithAssist ?? 0);
        if (actual > lineRaw)        legResult = pick === "over"  ? "win" : "loss";
        else if (actual < lineRaw)   legResult = pick === "under" ? "win" : "loss";
        else                         legResult = "push";

      // ── Numeric over/under props ──────────────────────────────────────────
      } else {
        const statKey = PROP_TYPE_TO_STAT[propType];
        if (!statKey) {
          result.skipped++;
          result.details.push(`No stat mapping for prop type "${propType}" — skipped`);
          continue;
        }

        if (isNaN(lineRaw)) {
          result.skipped++;
          result.details.push(`No numeric line for "${leg.playerName}" ${propType} — skipped`);
          continue;
        }

        const actual = (stat as any)[statKey] as number | null;
        if (actual === null || actual === undefined) {
          result.noStats++;
          result.details.push(`Stat "${statKey}" is null for "${leg.playerName}" week ${weekRow.weekNumber}`);
          continue;
        }

        if (actual > lineRaw)        legResult = pick === "over"  ? "win" : "loss";
        else if (actual < lineRaw)   legResult = pick === "under" ? "win" : "loss";
        else                         legResult = "push";
      }

      if (legResult) {
        await storage.enrichParlayLeg(leg.id, { result: legResult, oddsEnriched: true });
        result.resolved++;
        result.details.push(
          `Resolved "${leg.playerName}" ${propType} ${pick} ${leg.line ?? ""} → ${legResult}`
        );
      } else {
        result.skipped++;
      }

    } catch (err: any) {
      result.errors++;
      result.details.push(`Error on leg ${leg.id}: ${err.message}`);
    }
  }

  return result;
}

// ─── 2. Fetch prop lines from The Odds API ───────────────────────────────────

/**
 * Map our internal prop types to The Odds API market keys.
 * The Odds API uses "player_rush_yds", "player_receptions", etc.
 */
const PROP_TYPE_TO_ODDS_MARKET: Partial<Record<string, string>> = {
  rush_yards:       "player_rush_yds",
  rush_attempts:    "player_rush_attempts",
  rec_yards:        "player_reception_yds",
  receptions:       "player_receptions",
  pass_yards:       "player_pass_yds",
  pass_tds:         "player_pass_tds",
  pass_attempts:    "player_pass_attempts",
  pass_completions: "player_pass_completions",
  interceptions:    "player_pass_interceptions",
  anytime_td:       "player_anytime_td",
  first_td:         "player_first_td",
  last_td:          "player_last_td",
  rush_tds:         "player_rush_tds",
  rec_tds:          "player_receiving_td",
  kicking_pts:      "player_kicking_points",
  fg_made:          "player_field_goals",
  sacks:            "player_sacks",
  all_purpose_yards: "player_rush_reception_yds",
};

export interface PropLineResult {
  updated: number;
  notFound: number;
  apiRemaining: number | null;
  details: string[];
}

export async function fetchPropLinesFromOddsApi(
  leagueId: number,
  weekId: number
): Promise<PropLineResult> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY is not configured");

  const result: PropLineResult = { updated: 0, notFound: 0, apiRemaining: null, details: [] };

  // Find prop legs in this league+week that are missing odds
  const rows = await db
    .select({ leg: parlayLegs })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .where(
      and(
        eq(parlays.leagueId, leagueId),
        eq(parlays.weekId, weekId),
        eq(parlayLegs.betType, "player_prop"),
        isNotNull(parlayLegs.playerName),
        isNotNull(parlayLegs.propType),
      )
    );

  if (rows.length === 0) {
    result.details.push("No prop legs found for this league + week.");
    return result;
  }

  // Collect the unique prop market keys we need to fetch
  const neededMarkets = new Set<string>();
  for (const { leg } of rows) {
    const market = PROP_TYPE_TO_ODDS_MARKET[leg.propType ?? ""];
    if (market) neededMarkets.add(market);
  }

  if (neededMarkets.size === 0) {
    result.details.push("No mappable prop types found.");
    return result;
  }

  // The Odds API supports requesting multiple markets in one call (comma-separated)
  const marketsParam = Array.from(neededMarkets).join(",");
  const url =
    `${BASE_URL}/sports/${SPORT}/events?apiKey=${apiKey}&regions=us` +
    `&markets=${marketsParam}&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm`;

  const res = await fetch(url);
  result.apiRemaining = parseInt(res.headers.get("x-requests-remaining") ?? "0", 10) || null;

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Odds API error ${res.status}: ${txt}`);
  }

  // The /events endpoint returns games; each game has bookmakers → markets → outcomes
  const events: any[] = await res.json();

  // Build a flat lookup: "PlayerName|marketKey" → { line, odds }
  const propLookup = new Map<string, { line: string | null; odds: string }>();
  for (const event of events) {
    for (const bookmaker of (event.bookmakers ?? [])) {
      for (const market of (bookmaker.markets ?? [])) {
        for (const outcome of (market.outcomes ?? [])) {
          const nameKey = normalizePlayerName(outcome.description ?? outcome.name ?? "");
          const mKey    = market.key;
          const lookupKey = `${nameKey}|${mKey}`;
          if (!propLookup.has(lookupKey)) {
            propLookup.set(lookupKey, {
              line:  outcome.point != null ? String(outcome.point) : null,
              odds:  outcome.price > 0 ? `+${outcome.price}` : String(outcome.price),
            });
          }
        }
      }
    }
  }

  result.details.push(`Odds API returned ${events.length} events, ${propLookup.size} prop outcomes.`);

  // Match legs to outcomes and update
  for (const { leg } of rows) {
    if (!leg.playerName || !leg.propType) continue;
    const market = PROP_TYPE_TO_ODDS_MARKET[leg.propType];
    if (!market) continue;

    const nameKey   = normalizePlayerName(leg.playerName);
    const lookupKey = `${nameKey}|${market}`;
    const found     = propLookup.get(lookupKey);

    if (!found) {
      result.notFound++;
      result.details.push(`No odds found for "${leg.playerName}" (${leg.propType})`);
      continue;
    }

    // Only write what's actually missing so we don't overwrite manual entries
    const updates: { line?: string; odds?: string } = {};
    if (!leg.line && found.line)  updates.line = found.line;
    if (!leg.odds && found.odds)  updates.odds = found.odds;

    if (Object.keys(updates).length > 0) {
      await db.update(parlayLegs)
        .set(updates)
        .where(eq(parlayLegs.id, leg.id));
      result.updated++;
      result.details.push(
        `Updated "${leg.playerName}" ${leg.propType}: line=${updates.line ?? "—"} odds=${updates.odds ?? "—"}`
      );
    } else {
      result.details.push(`"${leg.playerName}" ${leg.propType} already has line/odds — skipped`);
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
