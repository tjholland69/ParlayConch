/**
 * Read-only audit: looks for parlays, legs and games that have ended up
 * under the wrong week, or otherwise look rearranged. It never writes.
 *
 * Each check prints a count and a sample of offending rows, with the ids
 * you'd need to look them up (the card's ⓘ popover shows the same ids).
 *
 * Run with:
 *   npm run audit:parlays                 (local database)
 *   railway run npm run audit:parlays     (production)
 *   npm run audit:parlays -- --all        (print every row, not a sample)
 */
import { pool } from "../server/db";
import { estimateWeekDateRange } from "../shared/nflWeek";

const SHOW_ALL = process.argv.includes("--all");
const SAMPLE = 15;
let problems = 0;

/** `info` checks depend on how a league plays, so they're listed but don't count as problems. */
async function check(title: string, why: string, sqlText: string, opts: { keep?: (row: any) => boolean; info?: boolean } = {}) {
  let { rows } = await pool.query(sqlText);
  if (opts.keep) rows = rows.filter(opts.keep);
  console.log(`\n${rows.length === 0 ? "✓" : opts.info ? "•" : "✗"} ${title}: ${rows.length}`);
  if (rows.length === 0) return;
  if (!opts.info) problems++;
  console.log(`  ${why}`);
  console.table(SHOW_ALL ? rows : rows.slice(0, SAMPLE));
  if (!SHOW_ALL && rows.length > SAMPLE) console.log(`  …and ${rows.length - SAMPLE} more (re-run with --all)`);
}

// Timestamps are selected as text and read as UTC, the way the app reads
// them. Left to the pg driver they'd be parsed in this machine's timezone.
const utc = (text: string) => new Date(`${text.replace(" ", "T")}Z`).getTime();
const DAY = 24 * 3600_000;

/** A time falls outside the calendar window of the week it's filed under, give or take `slackDays`. */
function outsideWeekWindow(season: number, weekNumber: number, text: string, slackDays: number): boolean {
  const { start, end } = estimateWeekDateRange(season, weekNumber);
  const t = utc(text);
  return t < start.getTime() - slackDays * DAY || t >= end.getTime() + slackDays * DAY;
}

async function main() {
  const { rows: [totals] } = await pool.query(`
    select (select count(*)::int from parlays) parlays, (select count(*)::int from parlay_legs) legs,
           (select count(*)::int from games) games, (select count(*)::int from weeks) weeks`);
  console.log("Auditing", totals);

  await check(
    "Legs pointing at a game from a different week than their parlay",
    "The parlay says one week, the leg's game belongs to another. This is the direct sign of rearranged data.",
    `select pl.id leg_id, pl.parlay_id, pw.label parlay_week, gw.label game_week,
            g.away_team || ' @ ' || g.home_team matchup, p.source, p.created_at::date created
       from parlay_legs pl
       join parlays p on p.id = pl.parlay_id
       join weeks pw on pw.id = p.week_id
       join games g on g.id = pl.game_id
       join weeks gw on gw.id = g.week_id
      where g.week_id <> p.week_id
      order by pw.season, pw.week_number, pl.parlay_id`,
  );

  await check(
    "Games whose kickoff date doesn't fit the week they're filed under",
    "Either the game sits in the wrong week or its kickoff time is wrong. Every leg on it shows the wrong date.",
    `select g.id game_id, w.season, w.week_number, w.label filed_under, g.away_team || ' @ ' || g.home_team matchup,
            g.game_time::text kickoff_utc, (select count(*)::int from parlay_legs pl where pl.game_id = g.id) legs
       from games g join weeks w on w.id = g.week_id
      where g.game_time is not null
      order by w.season, w.week_number`,
    { keep: (r) => outsideWeekWindow(r.season, r.week_number, r.kickoff_utc, 1) },
  );

  await check(
    "The same matchup stored more than once in a season",
    "Duplicate copies of a game split its legs between two rows, possibly in different weeks.",
    `select w.season, g.away_team || ' @ ' || g.home_team matchup, count(*)::int copies,
            string_agg(g.id::text || ' (wk ' || w.week_number || ')', ', ' order by g.id) game_ids
       from games g join weeks w on w.id = g.week_id
      group by w.season, g.home_team, g.away_team
     having count(*) > 1
      order by w.season`,
  );

  await check(
    "Parlays whose legs kick off more than 6 days apart",
    "One week's slate runs Thursday to Monday. A wider spread means legs from two weeks share a parlay.",
    `select p.id parlay_id, w.label parlay_week, count(*)::int legs,
            min(g.game_time)::date first_kickoff, max(g.game_time)::date last_kickoff, p.source
       from parlays p
       join weeks w on w.id = p.week_id
       join parlay_legs pl on pl.parlay_id = p.id
       join games g on g.id = pl.game_id
      where g.game_time is not null
      group by p.id, w.label, w.season, w.week_number, p.source
     having max(g.game_time) - min(g.game_time) > interval '6 days'
      order by w.season, w.week_number`,
  );

  await check(
    "Live parlays created more than two weeks away from their week",
    "A parlay made in the app is created during its week. One created far from it was probably moved or re-filed.",
    `select p.id parlay_id, w.season, w.week_number, w.label parlay_week, p.created_at::text created_utc, p.status
       from parlays p join weeks w on w.id = p.week_id
      where p.source = 'live' and p.created_at is not null
      order by w.season, w.week_number`,
    { keep: (r) => outsideWeekWindow(r.season, r.week_number, r.created_utc, 14) },
  );

  await check(
    "Members with more than one leg in the same parlay",
    "In a group parlay each member places one leg, so two can mean parlays were merged or a leg was reassigned. Expected when members build their own parlays.",
    `select pl.parlay_id, w.label parlay_week, pl.user_id, count(*)::int legs,
            string_agg(pl.id::text, ', ' order by pl.id) leg_ids
       from parlay_legs pl
       join parlays p on p.id = pl.parlay_id
       join weeks w on w.id = p.week_id
      group by pl.parlay_id, w.label, w.season, w.week_number, pl.user_id
     having count(*) > 1
      order by w.season, w.week_number`,
    { info: true },
  );

  await check(
    "More than one parlay for a league in the same week",
    "Normal if members submit separately; unexpected if your league builds one group parlay a week.",
    `select p.league_id, w.label week, count(*)::int parlays,
            string_agg(p.id::text || ' (' || coalesce(p.status, '?') || ')', ', ' order by p.id) parlay_ids
       from parlays p join weeks w on w.id = p.week_id
      where p.status <> 'draft'
      group by p.league_id, w.label, w.season, w.week_number
     having count(*) > 1
      order by w.season, w.week_number`,
    { info: true },
  );

  await check(
    "Games whose spread disagrees with their moneyline",
    "The home team is the moneyline favorite but carries a plus spread (or the reverse). Lines imported from nflverse were stored with the sign flipped.",
    `select g.id game_id, w.label week, g.away_team || ' @ ' || g.home_team matchup,
            g.spread home_spread, g.moneyline_home, g.moneyline_away
       from games g join weeks w on w.id = g.week_id
      where g.spread ~ '^[+-]?[0-9.]+$' and g.moneyline_home ~ '^[+-]?[0-9]+$' and g.moneyline_away ~ '^[+-]?[0-9]+$'
        and g.spread::numeric <> 0
        and g.moneyline_home::int <> g.moneyline_away::int
        and (g.spread::numeric < 0) <> (g.moneyline_home::int < g.moneyline_away::int)
      order by w.season, w.week_number`,
  );

  // Not a pass/fail check: what has been changing parlays lately, and who did it.
  const { rows: events } = await pool.query(`
    select event_type, count(*)::int events, min(created_at)::date first, max(created_at)::date last
      from audit_events
     where created_at > now() - interval '90 days'
       and (event_type ilike '%parlay%' or event_type ilike '%leg%' or event_type ilike '%import%'
            or event_type ilike '%game%' or event_type ilike '%week%' or event_type ilike '%season%')
     group by event_type order by max(created_at) desc`);
  console.log("\nChanges recorded in audit_events over the last 90 days (who/when is in the table):");
  console.table(events);

  console.log(problems === 0 ? "\nNo problems found." : `\n${problems} check(s) found rows to look at.`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
