/**
 * formatPickLabel — human-readable pick description for a parlay leg.
 *
 * Game bets  : team name instead of "Home"/"Away"; spread includes the line.
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
    const base = betType === "spread" && line ? (team ? `${team} ${line}` : `Home ${line}`) : team ?? "Home";
    return withSegment(base, gameSegment);
  }
  if (pick === "away") {
    const team = game?.awayTeam;
    const base = betType === "spread" && line ? (team ? `${team} ${line}` : `Away ${line}`) : team ?? "Away";
    return withSegment(base, gameSegment);
  }

  return withSegment(pick ? pick.charAt(0).toUpperCase() + pick.slice(1) : "—", gameSegment);
}
