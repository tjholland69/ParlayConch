export const SLATE_NAMES = ["Morning", "Early Slate", "Afternoon Slate", "Primetime"] as const;

export type SlateName = (typeof SLATE_NAMES)[number];

/**
 * NFL broadcast-slate bucket for a kickoff time, evaluated in US Eastern time
 * (the timezone the slates are defined against, regardless of server/client TZ).
 */
export function getSlate(date: Date | string): SlateName {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  const minutesSinceMidnight = hour * 60 + minute;

  if (minutesSinceMidnight < 12 * 60) return "Morning";
  if (minutesSinceMidnight < 16 * 60) return "Early Slate";
  if (minutesSinceMidnight < 18 * 60 + 30) return "Afternoon Slate";
  return "Primetime";
}

export type SlateGroup<T> = { key: string; label: string; games: T[] };

/**
 * Splits a week's games into the windows people bet them in: one group per
 * Eastern-time day and slate ("Thursday Primetime", "Sunday Early Slate"),
 * in kickoff order. Games with no kickoff time yet go in a last "Time TBD" group.
 */
export function groupGamesBySlate<T extends { gameTime?: Date | string | null }>(games: T[]): SlateGroup<T>[] {
  const time = (g: T) => (g.gameTime ? new Date(g.gameTime).getTime() : Infinity);
  const groups = new Map<string, SlateGroup<T>>();
  for (const game of [...games].sort((a, b) => time(a) - time(b))) {
    let key = "tbd";
    let label = "Time TBD";
    if (game.gameTime) {
      const kickoff = new Date(game.gameTime);
      const day = kickoff.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const weekday = kickoff.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
      const slate = getSlate(kickoff);
      key = `${day}|${slate}`;
      label = `${weekday} ${slate}`;
    }
    const group = groups.get(key);
    if (group) group.games.push(game);
    else groups.set(key, { key, label, games: [game] });
  }
  return [...groups.values()];
}
