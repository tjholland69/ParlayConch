/**
 * formatPickLabel — human-readable pick description for a parlay leg.
 *
 * Game bets  : team name instead of "Home"/"Away"; spread includes the line,
 *              "+"-prefixed when positive ("BUF +3.5").
 * Over/Under : "Over 47.5" / "Under 47.5"
 * Player props:
 *   - stat props  : "Rushing Over 87.5 Yds", "Passing Under 2.5 TDs"
 *   - scoring props: "Anytime TD Scorer", "First TD Scorer"
 */

type LegLike = {
  betType: string | null;
  pick: string | null;
  line: string | null;
  propType: string | null;
  gameSegment?: string | null;
  game?: {
    homeTeam?: string | null;
    awayTeam?: string | null;
    overUnder?: string | number | null;
  } | null;
};

type PropMeta =
  | { kind: "label"; label: string }
  | { kind: "stat"; prefix?: string; unit: string };

const PROP_META: Record<string, PropMeta> = {
  rush_yards:       { kind: "stat", prefix: "Rushing",   unit: "Yds" },
  rush_tds:         { kind: "stat", prefix: "Rushing",   unit: "TDs" },
  rush_attempts:    { kind: "stat",                      unit: "Rush Att" },
  rec_yards:        { kind: "stat", prefix: "Receiving", unit: "Yds" },
  rec_tds:          { kind: "stat", prefix: "Receiving", unit: "TDs" },
  receptions:       { kind: "stat",                      unit: "Receptions" },
  all_purpose_yards: { kind: "stat", prefix: "All-Purpose", unit: "Yds" },
  pass_yards:       { kind: "stat", prefix: "Passing",   unit: "Yds" },
  pass_tds:         { kind: "stat", prefix: "Passing",   unit: "TDs" },
  pass_attempts:    { kind: "stat",                      unit: "Pass Att" },
  pass_completions: { kind: "stat",                      unit: "Completions" },
  interceptions:    { kind: "stat",                      unit: "INTs" },
  anytime_td:       { kind: "label", label: "Anytime TD Scorer" },
  first_td:         { kind: "label", label: "First TD Scorer" },
  last_td:          { kind: "label", label: "Last TD Scorer" },
  kicking_pts:      { kind: "stat",                      unit: "Kicking Pts" },
  fg_made:          { kind: "stat",                      unit: "FGs Made" },
  sacks:            { kind: "stat",                      unit: "Sacks" },
  tackles:          { kind: "stat",                      unit: "Tackles" },
};

/** "+3.5" / "+150" for a positive numeric line or American odds; anything
 * else (negatives, "PK", already-signed, non-numeric) passes through as-is. */
export function withPlusSign(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && !s.startsWith("+") ? `+${s}` : s;
}

function withSegment(label: string, gameSegment?: string | null): string {
  if (!gameSegment) return label;
  const trimmed = gameSegment.trim();
  if (!trimmed || /^full game$/i.test(trimmed)) return label;
  return `${label} (${trimmed})`;
}

export function formatPickLabel(leg: LegLike): string {
  const { betType, pick, line, propType, gameSegment, game } = leg;

  if (betType === "player_prop") {
    if (!propType) {
      const dir = pick ? pick.charAt(0).toUpperCase() + pick.slice(1) : "";
      return withSegment(line ? `${dir} ${line}` : dir || "—", gameSegment);
    }
    const meta = PROP_META[propType];
    if (!meta) {
      const dir = pick ? pick.charAt(0).toUpperCase() + pick.slice(1) : "";
      return withSegment(line ? `${dir} ${line}` : dir || "—", gameSegment);
    }
    if (meta.kind === "label") {
      return withSegment(pick === "no" ? `No ${meta.label}` : meta.label, gameSegment);
    }
    const dir = pick === "over" ? "Over" : pick === "under" ? "Under" : pick ?? "";
    const lineStr = line ? ` ${line}` : "";
    const unitStr = ` ${meta.unit}`;
    const base = meta.prefix
      ? `${meta.prefix} ${dir}${lineStr}${unitStr}`
      : `${dir}${lineStr}${unitStr}`;
    return withSegment(base, gameSegment);
  }

  if (betType === "over" || pick === "over") {
    const l = line ?? (game?.overUnder != null ? String(game.overUnder) : null);
    return withSegment(l ? `Over ${l}` : "Over", gameSegment);
  }
  if (betType === "under" || pick === "under") {
    const l = line ?? (game?.overUnder != null ? String(game.overUnder) : null);
    return withSegment(l ? `Under ${l}` : "Under", gameSegment);
  }

  if (pick === "home") {
    const team = game?.homeTeam;
    const base = betType === "spread" && line ? `${team ?? "Home"} ${withPlusSign(line)}` : team ?? "Home";
    return withSegment(base, gameSegment);
  }
  if (pick === "away") {
    const team = game?.awayTeam;
    const base = betType === "spread" && line ? `${team ?? "Away"} ${withPlusSign(line)}` : team ?? "Away";
    return withSegment(base, gameSegment);
  }

  return withSegment(pick ? pick.charAt(0).toUpperCase() + pick.slice(1) : "—", gameSegment);
}

type ChipLeg = {
  betType: string | null;
  pick: string | null;
  line: string | null;
  playerName?: string | null;
  propType: string | null;
  gameSegment?: string | null;
};

type ChipGame = {
  homeTeam?: string | null;
  awayTeam?: string | null;
  spread?: string | null;
  overUnder?: string | null;
  moneylineHome?: string | null;
  moneylineAway?: string | null;
};

/**
 * One-line summary of a pick for the web "Your Parlay" chips and the mobile
 * bet slip: the side taken, then the market and its number — "Colts (Spread
 * -3.5)", "Colts (Moneyline +150)", "Over 47.5 (Total)", "Josh Allen (Passing
 * Over 249.5 Yds)".
 *
 * A game leg's `line` is stored as "number (odds)" (see getLineForBet); only
 * the number is shown. A leg with no line falls back to the game's own.
 */
export function legChipLabel(leg: ChipLeg, game?: ChipGame | null): string {
  if (leg.betType === "player_prop") {
    return `${leg.playerName || "Player"} (${formatPickLabel(leg)})`;
  }
  const lineNumber = leg.line?.trim().split(/\s+/)[0] || null;
  if (leg.betType === "over" || leg.betType === "under") {
    const total = lineNumber?.replace(/^[ou]/i, "") || game?.overUnder;
    const side = leg.betType === "over" ? "Over" : "Under";
    return `${total ? `${side} ${total}` : side} (Total)`;
  }
  const isHome = leg.pick === "home";
  const team = (isHome ? game?.homeTeam : game?.awayTeam) || (isHome ? "Home" : "Away");
  if (leg.betType === "spread") {
    const homeSpread = parseFloat(game?.spread ?? "");
    const fromGame = Number.isNaN(homeSpread) ? null : String(isHome ? homeSpread : -homeSpread || 0);
    const spread = withPlusSign(lineNumber ?? fromGame);
    return `${team} (${spread ? `Spread ${spread}` : "Spread"})`;
  }
  if (leg.betType === "moneyline") {
    const odds = withPlusSign(lineNumber ?? (isHome ? game?.moneylineHome : game?.moneylineAway));
    return `${team} (${odds ? `Moneyline ${odds}` : "Moneyline"})`;
  }
  return team;
}

/** Prop names as they're said in a group chat: "Rush", "Rec TD", "Anytime TD". */
const PROP_SHORT: Record<string, string> = {
  rush_yards: "Rush",
  rush_tds: "Rush TD",
  rush_attempts: "Rush Att",
  rec_yards: "Rec",
  rec_tds: "Rec TD",
  receptions: "Recs",
  all_purpose_yards: "Rush+Rec",
  pass_yards: "Pass",
  pass_tds: "Pass TD",
  pass_attempts: "Pass Att",
  pass_completions: "Comp",
  interceptions: "INT",
  anytime_td: "Anytime TD",
  first_td: "First TD",
  last_td: "Last TD",
  kicking_pts: "Kick Pts",
  fg_made: "FG",
  sacks: "Sacks",
  tackles: "Tackles",
};

/**
 * The shortest readable form of a pick, for text that gets pasted into a
 * group chat: "Lamar (Rush O25)", "Chiefs -4.5", "Cardinals ML (-346)",
 * "Bills/Chiefs O47.5". Same inputs as legChipLabel.
 */
export function legShortLabel(leg: ChipLeg, game?: ChipGame | null): string {
  const lineNumber = leg.line?.trim().split(/\s+/)[0] || null;
  if (leg.betType === "player_prop") {
    const first = leg.playerName?.trim().split(/\s+/)[0] || "Player";
    const prop = (leg.propType && PROP_SHORT[leg.propType]) || "Prop";
    if (leg.pick === "yes" || leg.pick === "no") return `${first} (${leg.pick === "no" ? "No " : ""}${prop})`;
    const side = leg.pick === "over" ? "O" : leg.pick === "under" ? "U" : "";
    return `${first} (${[prop, `${side}${lineNumber ?? ""}`].filter(Boolean).join(" ")})`;
  }
  if (leg.betType === "over" || leg.betType === "under") {
    const total = lineNumber?.replace(/^[ou]/i, "") || game?.overUnder || "";
    const matchup = game?.awayTeam && game?.homeTeam ? `${game.awayTeam}/${game.homeTeam} ` : "";
    return `${matchup}${leg.betType === "over" ? "O" : "U"}${total}`;
  }
  const isHome = leg.pick === "home";
  const team = (isHome ? game?.homeTeam : game?.awayTeam) || (isHome ? "Home" : "Away");
  if (leg.betType === "spread") {
    const homeSpread = parseFloat(game?.spread ?? "");
    const fromGame = Number.isNaN(homeSpread) ? null : String(isHome ? homeSpread : -homeSpread || 0);
    const spread = withPlusSign(lineNumber ?? fromGame);
    return spread ? `${team} ${spread}` : team;
  }
  if (leg.betType === "moneyline") {
    const odds = withPlusSign(lineNumber ?? (isHome ? game?.moneylineHome : game?.moneylineAway));
    return odds ? `${team} ML (${odds})` : `${team} ML`;
  }
  return team;
}
