import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { storage } from "../storage";
import { syncGamesFromOddsApi } from "../services/oddsApi";

const QUEUE_NAME = "week-rollover";
const REPEATABLE_JOB_NAME = "advance-active-week";

// Daily, 8am UTC — comfortably after Monday Night Football wraps (even the
// latest MNF kickoffs finish by ~4-5am UTC Tuesday), so the first run after
// a week's games all finish activates the next week the following morning.
const DAILY_CRON = "0 8 * * *";

let queue: Queue | null = null;
let worker: Worker | null = null;

export type WeekRolloverResult =
  | { advanced: false; reason: string }
  | { advanced: true; fromWeekId: number; toWeekId: number; gamesSynced: { added: number; updated: number } };

/**
 * If the currently-active week's games are all finished, syncs fresh odds
 * into the next week (same season, weekNumber + 1 — already created ahead
 * of time by season-rollover's one-time full-season import) and activates
 * it. No-ops if there's no active week, its games aren't all finished yet,
 * or the next week doesn't exist (e.g. season's last week, or the next
 * season hasn't been imported yet — falls back to the manual admin flow).
 */
export async function runWeekRolloverCheckNow(): Promise<WeekRolloverResult> {
  const weeks = await storage.getWeeks();
  const activeWeek = weeks.find((w) => w.isActive);
  if (!activeWeek) return { advanced: false, reason: "No active week" };

  const games = await storage.getGamesByWeek(activeWeek.id);
  if (games.length === 0) return { advanced: false, reason: "Active week has no games yet" };
  if (!games.every((g) => g.isFinished)) return { advanced: false, reason: "Active week's games aren't all finished yet" };

  const nextWeek = await storage.getWeekBySeasonAndNumber(activeWeek.season, activeWeek.weekNumber + 1);
  if (!nextWeek) return { advanced: false, reason: `No week ${activeWeek.weekNumber + 1} row for season ${activeWeek.season} yet` };

  const gamesSynced = await syncGamesFromOddsApi(nextWeek.id);
  await storage.setActiveWeek(nextWeek.id);

  logger.info(
    { fromWeekId: activeWeek.id, toWeekId: nextWeek.id, gamesSynced },
    "[week-rollover] advanced active week",
  );
  return { advanced: true, fromWeekId: activeWeek.id, toWeekId: nextWeek.id, gamesSynced };
}

function getQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

/** Starts the worker and (idempotently) registers the daily repeatable check. No-ops without Redis. */
export async function startWeekRolloverWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    logger.warn("[week-rollover] Redis not configured — automatic week advancement is disabled. Use the Season Admin page's Activate Week button.");
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
