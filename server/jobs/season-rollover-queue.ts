import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { detectAndImportNewSeason } from "../services/nflverse";

const QUEUE_NAME = "season-rollover";
const REPEATABLE_JOB_NAME = "check-new-season";

// Weekly, Monday 9am UTC — comfortably covers the NFL's annual schedule
// release (historically mid-May) without polling nflverse more than needed.
const WEEKLY_CRON = "0 9 * * 1";

let queue: Queue | null = null;
let worker: Worker | null = null;

export type SeasonRolloverResult = Awaited<ReturnType<typeof detectAndImportNewSeason>>;

function getQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

/** Starts the worker and (idempotently) registers the weekly repeatable check. No-ops without Redis. */
export async function startSeasonRolloverWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    logger.warn("[season-rollover] Redis not configured — automatic weekly season check is disabled. Trigger manually via POST /api/admin/check-new-season.");
    return;
  }

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (_job: Job) => detectAndImportNewSeason(),
      { connection: createBullMqConnection(), concurrency: 1 },
    );
    worker.on("completed", (job) => {
      logger.info({ result: job.returnvalue }, "[season-rollover] weekly check completed");
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, jobId: job?.id }, "[season-rollover worker] job failed");
    });
  }

  const q = getQueue();
  if (!q) return;

  // Avoid stacking duplicate repeatable schedules across restarts/deploys.
  const existing = await q.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === REPEATABLE_JOB_NAME && j.pattern === WEEKLY_CRON);
  if (!alreadyScheduled) {
    for (const j of existing.filter((j) => j.name === REPEATABLE_JOB_NAME)) {
      await q.removeRepeatableByKey(j.key);
    }
    await q.add(REPEATABLE_JOB_NAME, {}, { repeat: { pattern: WEEKLY_CRON }, removeOnComplete: 20, removeOnFail: 20 });
    logger.info(`[season-rollover] Scheduled weekly season check (cron: "${WEEKLY_CRON}").`);
  }
}

/**
 * Runs the check immediately (used by the admin manual-trigger endpoint).
 * Always runs inline rather than going through the queue — it's a single
 * CSV fetch plus a handful of inserts, cheap enough not to need worker
 * offload, and this keeps the endpoint's response synchronous.
 */
export async function runSeasonRolloverCheckNow(): Promise<SeasonRolloverResult> {
  return detectAndImportNewSeason();
}
