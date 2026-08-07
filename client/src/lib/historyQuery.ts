import type { ParlayLegWithParlayContext, ParlayWithLegs } from "@shared/schema";

// Lightweight JQL-style filter for the "My History" leg list.
// Syntax: space-separated tokens, implicitly AND-ed together.
//   key:value           field contains value (case-insensitive)
//   key:"multi word"    quoted values may contain spaces
//   -key:value          negated — field must NOT contain value
//   word                bare word (no key) — free text match across common fields
//
// Recognized keys: type/betType, pick, result, player, prop, book, segment,
// notes, odds, line, status, week, owner/via.

export const LEG_QUERY_HELP =
  'Filter with key:value tokens, e.g. result:win type:player_prop player:"Josh Allen" -status:void. ' +
  "Keys: type, pick, result, player, prop, book, segment, notes, odds, line, status, week, owner. " +
  "Bare words search across matchup, player, and notes.";

type QueryToken = {
  key: string | null;
  value: string;
  negate: boolean;
};

function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  const re = /-?(?:[a-zA-Z_]+:)?(?:"[^"]*"|'[^']*'|\S+)/g;
  const matches = query.match(re);
  if (matches) tokens.push(...matches);
  return tokens;
}

function parseToken(raw: string): QueryToken {
  let str = raw;
  let negate = false;
  if (str.startsWith("-")) {
    negate = true;
    str = str.slice(1);
  }

  const keyMatch = str.match(/^([a-zA-Z_]+):(.*)$/);
  let key: string | null = null;
  let value = str;
  if (keyMatch) {
    key = keyMatch[1].toLowerCase();
    value = keyMatch[2];
  }

  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }

  return { key, value: value.toLowerCase(), negate };
}

function legMatchupText(leg: ParlayLegWithParlayContext | any): string {
  if (leg.betType === "player_prop") {
    return `${leg.playerName ?? ""} ${leg.propType ?? ""}`;
  }
  return `${leg.game?.awayTeam ?? ""} ${leg.game?.homeTeam ?? ""}`;
}

const KEY_ALIASES: Record<string, string> = {
  type: "betType",
  bettype: "betType",
  book: "oddsSource",
  sportsbook: "oddsSource",
  prop: "propType",
  proptype: "propType",
  player: "playerName",
  segment: "gameSegment",
  via: "owner",
};

function fieldValue(leg: any, key: string): string {
  const field = KEY_ALIASES[key] ?? key;
  switch (field) {
    case "betType":
      return String(leg.betType ?? "");
    case "pick":
      return String(leg.pick ?? "");
    case "result":
      return String(leg.result ?? "");
    case "playerName":
      return String(leg.playerName ?? "");
    case "propType":
      return String(leg.propType ?? "");
    case "oddsSource":
      return String(leg.oddsSource ?? "");
    case "gameSegment":
      return String(leg.gameSegment ?? "");
    case "notes":
      return String(leg.notes ?? "");
    case "odds":
      return String(leg.odds ?? "");
    case "line":
      return String(leg.line ?? "");
    case "status":
      return String(leg.parlay?.status ?? "");
    case "week":
      return `${leg.parlay?.week?.label ?? ""} ${leg.parlay?.weekId ?? ""}`;
    case "owner":
      return leg.parlay?.isOwnParlay
        ? "me"
        : `${leg.parlay?.owner?.firstName ?? ""} ${leg.parlay?.owner?.email ?? ""}`;
    default:
      return "";
  }
}

function tokenMatches(leg: any, token: QueryToken): boolean {
  const haystack = token.key
    ? fieldValue(leg, token.key).toLowerCase()
    : `${legMatchupText(leg)} ${leg.notes ?? ""} ${leg.betType ?? ""} ${leg.pick ?? ""}`.toLowerCase();

  const matched = token.value === "" ? true : haystack.includes(token.value);
  return token.negate ? !matched : matched;
}

export function filterLegsByQuery<T extends ParlayLegWithParlayContext>(legs: T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return legs;

  const tokens = tokenizeQuery(trimmed).map(parseToken);
  if (tokens.length === 0) return legs;

  return legs.filter(leg => tokens.every(token => tokenMatches(leg, token)));
}

// Same syntax, applied to the parlay cards list. Parlay-level keys (status,
// week, id) match the parlay itself; leg-level keys (type, player, result,
// etc.) match if ANY leg in the parlay qualifies. Bare words check both.

export const PARLAY_QUERY_HELP =
  'Filter with key:value tokens, e.g. status:win week:"Week 5" type:player_prop player:"Josh Allen" -status:void. ' +
  "Parlay keys: status, week, id. Leg keys (match if any leg qualifies): type, pick, result, player, prop, book, segment, notes, odds, line. " +
  "Bare words search parlay week/id and leg matchup/player/notes.";

const PARLAY_LEVEL_KEYS = new Set(["status", "week", "id"]);
const LEG_LEVEL_KEYS = new Set([
  "type", "bettype", "pick", "result", "player", "prop", "proptype",
  "book", "sportsbook", "segment", "notes", "odds", "line",
]);

function parlayFieldValue(parlay: ParlayWithLegs, key: string): string {
  switch (key) {
    case "status":
      return String(parlay.status ?? "");
    case "week":
      return `${parlay.week?.label ?? ""} ${parlay.weekId ?? ""}`;
    case "id":
      return String(parlay.id ?? "");
    default:
      return "";
  }
}

function parlayTokenMatches(parlay: ParlayWithLegs, token: QueryToken): boolean {
  let matched: boolean;

  if (token.key && PARLAY_LEVEL_KEYS.has(token.key)) {
    matched = token.value === "" ? true : parlayFieldValue(parlay, token.key).toLowerCase().includes(token.value);
  } else if (token.key && LEG_LEVEL_KEYS.has(token.key)) {
    matched = parlay.legs.some(leg =>
      token.value === "" ? true : fieldValue(leg, token.key!).toLowerCase().includes(token.value),
    );
  } else if (!token.key) {
    const parlayText = parlayFieldValue(parlay, "week").toLowerCase();
    matched =
      token.value === "" ||
      parlayText.includes(token.value) ||
      parlay.legs.some(leg =>
        `${legMatchupText(leg)} ${leg.notes ?? ""} ${leg.betType ?? ""} ${leg.pick ?? ""}`
          .toLowerCase()
          .includes(token.value),
      );
  } else {
    // Unknown key — no match.
    matched = false;
  }

  return token.negate ? !matched : matched;
}

export function filterParlaysByQuery<T extends ParlayWithLegs>(parlays: T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return parlays;

  const tokens = tokenizeQuery(trimmed).map(parseToken);
  if (tokens.length === 0) return parlays;

  return parlays.filter(parlay => tokens.every(token => parlayTokenMatches(parlay, token)));
}