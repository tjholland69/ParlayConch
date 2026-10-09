/**
 * The open-parlay reminder: one text for the group chat that lists who's in,
 * who isn't, and how long is left before the week's main slate kicks off.
 */

type ReminderGame = { gameTime?: Date | string | null };

const ET = "America/New_York";

/** The first kickoff of the week that isn't a Thursday game (Eastern time). */
export function firstNonThursdayKickoff(games: ReminderGame[]): Date | null {
  const times = games
    .map((g) => (g.gameTime ? new Date(g.gameTime) : null))
    .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
    .filter((d) => d.toLocaleDateString("en-US", { timeZone: ET, weekday: "short" }) !== "Thu")
    .sort((a, b) => a.getTime() - b.getTime());
  return times[0] ?? null;
}

/** "2d 4h", "3h 12m", "45m"; null once the moment has passed. */
export function countdownLabel(target: Date, now: Date = new Date()): string | null {
  const minutes = Math.floor((target.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return null;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** "Sun 1:00pm EDT" */
export function kickoffLabel(date: Date | string): string {
  const d = new Date(date);
  const day = d.toLocaleDateString("en-US", { timeZone: ET, weekday: "short" });
  return `${day} ${kickoffTimeLabel(d)}`;
}

/** "1:05pm EDT": a kickoff time in Eastern time, with the zone it's really in. */
export function kickoffTimeLabel(date: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(new Date(date));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const zone = get("timeZoneName");
  // Some engines answer "GMT-4" instead of a name; "ET" is right year round.
  return `${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()} ${/^E[SD]T$/.test(zone) ? zone : "ET"}`;
}

export function openParlayReminderText(input: {
  leagueName: string;
  weekLabel: string;
  /** Picks in the open parlay, each with its owner. */
  legs: { owner: string; bet: string }[];
  /** Members with no pick in yet. */
  missing: string[];
  games: ReminderGame[];
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const kickoff = firstNonThursdayKickoff(input.games);
  const countdown = kickoff ? countdownLabel(kickoff, now) : null;
  const lines = [`⏰ ${input.leagueName} · ${input.weekLabel} parlay is open`];
  if (kickoff) {
    lines.push(countdown
      ? `${countdown} until the first non-Thursday kickoff (${kickoffLabel(kickoff)})`
      : `The first non-Thursday game has kicked off (${kickoffLabel(kickoff)})`);
  }
  lines.push("", input.legs.length > 0 ? `Picks in (${input.legs.length}):` : "No picks in yet.");
  for (const leg of input.legs) lines.push(`• ${leg.owner} - ${leg.bet}`);
  lines.push("", input.missing.length > 0 ? `Still need a pick (${input.missing.length}): ${input.missing.join(", ")}` : "Everyone's pick is in.");
  return lines.join("\n");
}
