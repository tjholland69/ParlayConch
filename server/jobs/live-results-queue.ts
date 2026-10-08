import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { runLiveResultsTick } from "../services/liveResults";

const QUEUE_NAME = "live-results";
const REPEATABLE_JOB_NAME = "live-results-tick";

// Every 5 minutes. A tick outside game windows does two small reads and
// stops (see services/liveResults.ts), so the cadence only costs anything
// while games are actually being played.
const TICK_CRON = "*/5 * * * *";
const TICK_INTERVAL_MS = 5 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: NodeJS.Timeout | null = null;
let running = false;

/** One tick at a time: a slow one is skipped over, not stacked up. */
async function tick() {
  if (running) return { ran: false as const, reason: "Previous tick still running" };
  running = true;
  try {
    return await runLiveResultsTick();
  } finally {
    running = false;
  }
}

/**
 * Starts the worker and (idempotently) registers the repeating tick. Without
 * Redis, production runs the same tick on a timer in this process; dev
 * doesn't run it at all, since its weeks are seeded with made-up kickoffs.
 */
export async function startLiveResultsWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV !== "production" || fallbackTimer) return;
    logger.warn("[live-results] Redis not configured — checking for results every 5 minutes in-process instead.");
    fallbackTimer = setInterval(() => {
      tick().catch((err) => logger.error({ err }, "[live-results] in-process tick failed"));
    }, TICK_INTERVAL_MS);
    fallbackTimer.unref();
    return;
  }

  if (!worker) {
    worker = new Worker(QUEUE_NAME, async (_job: Job) => tick(), { connection: createBullMqConnection(), concurrency: 1 });
    worker.on("completed", (job) => {
      // Idle ticks are the norm, so only the ones that did something are logged.
      if (job.returnvalue?.ran) logger.info({ result: job.returnvalue }, "[live-results] tick completed");
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id }, "[live-results worker] job failed");
    });
  }

  if (!queue) queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  const existing = await queue.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === REPEATABLE_JOB_NAME && j.pattern === TICK_CRON);
  if (!alreadyScheduled) {
    for (const j of existing.filter((j) => j.name === REPEATABLE_JOB_NAME)) {
      await queue.removeRepeatableByKey(j.key);
    }
    await queue.add(REPEATABLE_JOB_NAME, {}, { repeat: { pattern: TICK_CRON }, removeOnComplete: 20, removeOnFail: 20 });
    logger.info(`[live-results] Scheduled results tick (cron: "${TICK_CRON}").`);
  }
}
