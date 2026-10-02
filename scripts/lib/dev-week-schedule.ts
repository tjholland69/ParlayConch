/**
 * The dev seed's active-week slate and where its kickoffs go.
 *
 * Pure date/data logic with no database import, so it can be unit tested
 * and shared by scripts/seed-dev.ts (which creates the games) and
 * scripts/refresh-dev-week.ts (which moves them back into the future once
 * they've gone stale).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const EASTERN = "America/New_York";

/** Day of the game weekend a kickoff falls on. */
type SlotDay = "sat" | "sun" | "mon";
const DAY_OFFSET: Record<SlotDay, number> = { sat: -1, sun: 0, mon: 1 };

export type DevWeekGame = {
  homeTeam: string;
  awayTeam: string;
  spread: string;
  overUnder: string;
  moneylineHome: string;
  moneylineAway: string;
  /** Kickoff, in US Eastern wall-clock time on the game weekend. */
  day: SlotDay;
  hourET: number;
  minuteET: number;
};

/**
 * Real 2024 Week 18 matchups (nflverse) — game identity has to match the
 * real schedule or play-by-play-driven features can never find a matching
 * game for these legs. Lines are approximate.
 *
 * The first four are referenced by index for the seeded Week 18 parlays in
 * seed-dev.ts, so append rather than reorder. The slate spans every betting
 * window (Saturday, Sunday early / afternoon / night, Monday night) and
 * includes the Commanders, the one team name long enough to need its own
 * handling on the game tiles.
 */
export const DEV_ACTIVE_WEEK_GAMES: DevWeekGame[] = [
  { homeTeam: "Eagles",     awayTeam: "Giants",     spread: "-3.0",  overUnder: "36.5", moneylineHome: "-155",  moneylineAway: "+130",  day: "sun", hourET: 13, minuteET: 0 },
  { homeTeam: "Buccaneers", awayTeam: "Saints",     spread: "-14.5", overUnder: "44.5", moneylineHome: "-1050", moneylineAway: "+675",  day: "sun", hourET: 13, minuteET: 0 },
  { homeTeam: "Colts",      awayTeam: "Jaguars",    spread: "-3.5",  overUnder: "45.5", moneylineHome: "-180",  moneylineAway: "+150",  day: "sun", hourET: 13, minuteET: 0 },
  { homeTeam: "Lions",      awayTeam: "Vikings",    spread: "-3.0",  overUnder: "56.5", moneylineHome: "-148",  moneylineAway: "+124",  day: "sun", hourET: 20, minuteET: 20 },
  { homeTeam: "Ravens",     awayTeam: "Browns",     spread: "-19.5", overUnder: "41.5", moneylineHome: "-2500", moneylineAway: "+1200", day: "sat", hourET: 16, minuteET: 30 },
  { homeTeam: "Packers",    awayTeam: "Bears",      spread: "-10.0", overUnder: "41.5", moneylineHome: "-500",  moneylineAway: "+380",  day: "sun", hourET: 13, minuteET: 0 },
  { homeTeam: "Cowboys",    awayTeam: "Commanders", spread: "+4.5",  overUnder: "43.5", moneylineHome: "+180",  moneylineAway: "-218",  day: "sun", hourET: 16, minuteET: 25 },
  { homeTeam: "Broncos",    awayTeam: "Chiefs",     spread: "-10.5", overUnder: "40.5", moneylineHome: "-550",  moneylineAway: "+410",  day: "sun", hourET: 16, minuteET: 25 },
  { homeTeam: "Rams",       awayTeam: "Seahawks",   spread: "+6.5",  overUnder: "38.5", moneylineHome: "+235",  moneylineAway: "-290",  day: "mon", hourET: 20, minuteET: 15 },
];

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")) % 24, minute: Number(get("minute")),
  };
}

/** The instant a US Eastern wall-clock time happens, whichever side of a
 * daylight-saving change it falls on. */
function easternTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Guess with standard time (UTC-5), then correct by however far the
  // guess reads off in Eastern time (an hour, during daylight time).
  const guess = new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
  const read = easternParts(guess);
  const offBy = (read.hour * 60 + read.minute) - (hour * 60 + minute);
  return new Date(guess.getTime() - offBy * 60_000);
}

/**
 * The Sunday the refreshed slate is built around: the first one whose
 * Saturday game is still at least a day away, so every game on the slate is
 * pickable when the refresh finishes.
 */
export function upcomingGameSunday(now = new Date()): { year: number; month: number; day: number } {
  for (let ahead = 2; ; ahead++) {
    const candidate = easternParts(new Date(now.getTime() + ahead * DAY_MS));
    if (candidate.weekday === "Sun") return candidate;
  }
}

/** Kickoff for one seed game on the weekend of `upcomingGameSunday(now)`. */
export function devWeekKickoff(game: Pick<DevWeekGame, "day" | "hourET" | "minuteET">, now = new Date()): Date {
  const sunday = upcomingGameSunday(now);
  // Date.UTC normalizes a day that runs past the end of the month.
  const onDay = new Date(Date.UTC(sunday.year, sunday.month - 1, sunday.day + DAY_OFFSET[game.day]));
  return easternTime(onDay.getUTCFullYear(), onDay.getUTCMonth() + 1, onDay.getUTCDate(), game.hourET, game.minuteET);
}

/**
 * How far to push a set of kickoffs so the earliest lands in the future:
 * a whole number of weeks, which keeps every game on its weekday and in its
 * time slot. Zero when the earliest kickoff is already more than
 * `minLeadMs` away.
 */
export function wholeWeekShiftMs(kickoffs: Date[], now = new Date(), minLeadMs = DAY_MS): number {
  if (kickoffs.length === 0) return 0;
  const earliest = Math.min(...kickoffs.map(k => k.getTime()));
  const short = now.getTime() + minLeadMs - earliest;
  return short <= 0 ? 0 : Math.ceil(short / WEEK_MS) * WEEK_MS;
}

/** A week's slate is stale once nothing on it can still be picked. */
export function isSlateStale(games: { gameTime: Date | null; isFinished: boolean | null }[], now = new Date()): boolean {
  if (games.length === 0) return false;
  return !games.some(g => !g.isFinished && (!g.gameTime || g.gameTime.getTime() > now.getTime()));
}
