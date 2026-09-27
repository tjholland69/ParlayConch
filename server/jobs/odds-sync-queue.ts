import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { syncGamesFromOddsApi, hasQuotaHeadroom } from "../services/oddsApi";
import { storage } from "../storage";
import { logger } from "../logger";

const QUEUE_NAME = "odds-sync";

// Every 3 hours during the season — frequent enough that lines don't go
// stale for a whole day between manual admin syncs, without hammering the
// monthly request quota (also guarded by hasQuotaHeadroom below).
const REPEATABLE_JOB_NAME = "scheduled-active-week-sync";
const SCHEDULE_CRON = "0 */3 * * *";

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

/** Syncs the currently-active week's odds board, skipping if quota is low.
 * No-op (not an error) if there's no active week — nothing to sync yet. */
async function runScheduledSync(): Promise<{ skipped: true; reason: string } | { added: number; updated: number; skippedOutOfRange: number }> {
  const weeks = await storage.getWeeks();
  const activeWeek = weeks.find((w) => w.isActive);
  if (!activeWeek) return { skipped: true, reason: "No active week" };

  if (!(await hasQuotaHeadroom())) {
    return { skipped: true, reason: "Odds API quota too low" };
  }

  return syncGamesFromOddsApi(activeWeek.id);
}

export function startOddsSyncWorker(): void {
  if (!isRedisConfigured()) return;

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (job: Job<{ weekId: number } | undefined>) => {
        if (job.name === REPEATABLE_JOB_NAME) return runScheduledSync();
        const { weekId } = job.data as { weekId: number };
        return syncGamesFromOddsApi(weekId);
      },
      { connection: createBullMqConnection(), concurrency: 2 },
    );
    worker.on("completed", (job) => {
      if (job.name === REPEATABLE_JOB_NAME) {
        logger.info({ result: job.returnvalue }, "[odds-sync] scheduled sync completed");
      }
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id }, "[odds-sync worker] job failed");
    });
  }

  scheduleRecurringSync().catch((err) => {
    logger.error({ err }, "[odds-sync] failed to register recurring sync schedule");
  });
}

async function scheduleRecurringSync(): Promise<void> {
  const q = getOddsSyncQueue();
  if (!q) return;

  const existing = await q.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === REPEATABLE_JOB_NAME && j.pattern === SCHEDULE_CRON);
  if (alreadyScheduled) return;

  for (const j of existing.filter((j) => j.name === REPEATABLE_JOB_NAME)) {
    await q.removeRepeatableByKey(j.key);
  }
  await q.add(REPEATABLE_JOB_NAME, undefined, { repeat: { pattern: SCHEDULE_CRON }, removeOnComplete: 20, removeOnFail: 20 });
  logger.info(`[odds-sync] Scheduled recurring active-week sync (cron: "${SCHEDULE_CRON}").`);
}

export function getOddsSyncQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

export function getOddsSyncQueueEvents(): QueueEvents | null {
  if (!isRedisConfigured()) return null;
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: createBullMqConnection(),
    });
  }
  return queueEvents;
}

/**
 * Queue odds sync and return immediately when Redis queue is enabled.
 * Falls back to inline sync when queue is unavailable.
 */
export async function runOddsSyncQueued(
  weekId: number,
): Promise<
  | { queued: true; jobId: string }
  | { queued: false; added: number; updated: number }
> {
  const q = getOddsSyncQueue();
  if (!q || process.env.USE_ODDS_SYNC_QUEUE !== "1") {
    const result = await syncGamesFromOddsApi(weekId);
    return { queued: false, ...result };
  }

  const job = await q.add("sync", { weekId }, { removeOnComplete: 100, removeOnFail: 50 });
  return { queued: true, jobId: String(job.id) };
}

export async function getOddsSyncJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  result?: { added: number; updated: number };
  failedReason?: string;
} | null> {
  const q = getOddsSyncQueue();
  if (!q) return null;
  const job = await q.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: String(job.id),
    state,
    result: state === "completed" ? (job.returnvalue as { added: number; updated: number }) : undefined,
    failedReason: job.failedReason,
  };
}
