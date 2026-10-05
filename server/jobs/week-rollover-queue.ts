import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { storage } from "../storage";
import { syncGamesFromOddsApi } from "../services/oddsApi";
import { estimateWeekDateRange } from "@shared/nflWeek";
import { isNewSeasonOpen, isWeekOver, NEW_SEASON_LEAD_DAYS } from "@shared/weekRollover";
import type { Week } from "@shared/schema";

const QUEUE_NAME = "week-rollover";
const REPEATABLE_JOB_NAME = "advance-active-week";

// Daily, 8am UTC — comfortably after Monday Night Football wraps (even the
// latest MNF kickoffs finish by ~4-5am UTC Tuesday), so the first run after
// a week's games all finish activates the next week the following morning.
const DAILY_CRON = "0 8 * * *";

// Without Redis there's no queue to schedule on, so production falls back to
// checking on a timer in this process. The check is idempotent, so several
// instances running it is harmless.
const FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
let fallbackTimer: NodeJS.Timeout | null = null;

let queue: Queue | null = null;
let worker: Worker | null = null;

export type WeekRolloverResult =
  | { advanced: false; reason: string }
  | {
      advanced: true;
      fromWeekId: number;
      toWeekId: number;
      /** Null when the odds pull failed; the week still advanced. */
      gamesSynced: { added: number; updated: number } | null;
      /** Games in the old week that were never marked finished. */
      unfinishedGames: number;
    };

/**
 * The week that follows `week`: the next one in its season, or Week 1 of the
 * following season once that's close enough to open (see
 * NEW_SEASON_LEAD_DAYS). Both are created ahead of time by season-rollover's
 * full-season import.
 */
async function findNextWeek(week: Week, now: Date): Promise<{ week: Week } | { reason: string }> {
  const sameSeason = await storage.getWeekBySeasonAndNumber(week.season, week.weekNumber + 1);
  if (sameSeason) return { week: sameSeason };

  const nextSeason = week.season + 1;
  const opener = await storage.getWeekBySeasonAndNumber(nextSeason, 1);
  if (!opener) return { reason: `${week.label} is the season's last week and the ${nextSeason} schedule isn't imported yet` };

  const kickoffs = (await storage.getGamesByWeek(opener.id))
    .filter((g) => g.gameTime)
    .map((g) => new Date(g.gameTime!).getTime());
  // No kickoff times yet: fall back to the calendar estimate for Week 1.
  const firstKickoff = kickoffs.length ? new Date(Math.min(...kickoffs)) : estimateWeekDateRange(nextSeason, 1).start;
  if (!isNewSeasonOpen(firstKickoff, now)) {
    return { reason: `${nextSeason} Week 1 opens ${NEW_SEASON_LEAD_DAYS} days before its first kickoff` };
  }
  return { week: opener };
}

/**
 * Advances the active week once it's over: every game finished, or
 * ROLLOVER_GRACE_HOURS past its last kickoff (so one postponed or unscored
 * game can't hold it open). Moves to the next week of the season, or to the
 * next season's Week 1 when that's due to open. Fresh odds are pulled into
 * the new week on the way; a failed pull is logged and doesn't stop the
 * rollover. No-ops when there's no active week or nothing to move to yet.
 */
export async function runWeekRolloverCheckNow(now = new Date()): Promise<WeekRolloverResult> {
  const weeks = await storage.getWeeks();
  const activeWeek = weeks.find((w) => w.isActive);
  if (!activeWeek) return { advanced: false, reason: "No active week" };

  const decision = isWeekOver(await storage.getGamesByWeek(activeWeek.id), now);
  if (!decision.over) return { advanced: false, reason: decision.reason };

  const next = await findNextWeek(activeWeek, now);
  if ("reason" in next) return { advanced: false, reason: next.reason };
  const nextWeek = next.week;

  let gamesSynced: { added: number; updated: number } | null = null;
  try {
    gamesSynced = await syncGamesFromOddsApi(nextWeek.id);
  } catch (err) {
    logger.error({ err, weekId: nextWeek.id }, "[week-rollover] odds sync failed; advancing anyway");
  }
  await storage.setActiveWeek(nextWeek.id);

  const summary = { fromWeekId: activeWeek.id, toWeekId: nextWeek.id, gamesSynced, unfinishedGames: decision.unfinished };
  if (decision.unfinished > 0) {
    logger.warn(summary, `[week-rollover] advanced with ${decision.unfinished} game(s) in ${activeWeek.label} never marked finished`);
  } else {
    logger.info(summary, "[week-rollover] advanced active week");
  }
  return { advanced: true, ...summary };
}

function getQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

/**
 * Starts the worker and (idempotently) registers the daily repeatable check.
 * Without Redis, production runs the same check hourly in-process instead;
 * dev leaves the active week to scripts/refresh-dev-week.ts.
 */
export async function startWeekRolloverWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV !== "production" || fallbackTimer) return;
    logger.warn("[week-rollover] Redis not configured — checking the active week hourly in-process instead.");
    fallbackTimer = setInterval(() => {
      runWeekRolloverCheckNow().catch((err) => logger.error({ err }, "[week-rollover] in-process check failed"));
    }, FALLBACK_INTERVAL_MS);
    fallbackTimer.unref();
    return;
  }

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (_job: Job) => runWeekRolloverCheckNow(),
      { connection: createBullMqConnection(), concurrency: 1 },
    );
    worker.on("completed", (job) => {
      logger.info({ result: job.returnvalue }, "[week-rollover] daily check completed");
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id }, "[week-rollover worker] job failed");
    });
  }

  const q = getQueue();
  if (!q) return;

  const existing = await q.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === REPEATABLE_JOB_NAME && j.pattern === DAILY_CRON);
  if (!alreadyScheduled) {
    for (const j of existing.filter((j) => j.name === REPEATABLE_JOB_NAME)) {
      await q.removeRepeatableByKey(j.key);
    }
    await q.add(REPEATABLE_JOB_NAME, {}, { repeat: { pattern: DAILY_CRON }, removeOnComplete: 20, removeOnFail: 20 });
    logger.info(`[week-rollover] Scheduled daily active-week check (cron: "${DAILY_CRON}").`);
  }
}
