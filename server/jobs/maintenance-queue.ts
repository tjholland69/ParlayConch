import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { logger } from "../logger";
import { storage } from "../storage";
import { resolvePropsFromStats } from "../services/propEnrichment";
import { detectExactDecisionMoments } from "../services/decisionDetection";
import { syncGameFinishTimesFromPlayByPlay } from "../services/playByPlay";

const QUEUE_NAME = "maintenance";

// Rollup and prop-resolution are cheap, DB-only passes over already-synced
// data — worth running often during the NFL window so results/statuses
// reflect reality without an admin having to click a button.
const ROLLUP_JOB_NAME = "rollup-parlay-statuses";
const ROLLUP_CRON = "*/30 * * * *";

const PROPS_JOB_NAME = "resolve-props";
const PROPS_CRON = "*/30 * * * *";

// Finish-time backfill re-fetches play-by-play CSVs per season from
// nflverse — heavier and slower-changing than the two above, so once a day
// is plenty (it's also still available on-demand via the admin button).
const BACKFILL_JOB_NAME = "backfill-game-finished-at";
const BACKFILL_CRON = "0 10 * * *";

let queue: Queue | null = null;
let worker: Worker | null = null;

async function runRollupParlayStatuses() {
  return storage.rollupLeagueParlayStatuses();
}

async function runResolveProps() {
  const result: Record<string, unknown> = { ...(await resolvePropsFromStats()) };
  try {
    result.decisionMoments = await detectExactDecisionMoments();
  } catch (err) {
    logger.warn({ err }, "[maintenance] decision detection failed during scheduled prop resolution");
  }
  return result;
}

async function runBackfillGameFinishedAt() {
  const seasons = await storage.getDistinctSeasons();
  const finishTimeSync = { updated: 0, noMatch: 0, notYetFinished: 0 };
  for (const season of seasons) {
    try {
      const r = await syncGameFinishTimesFromPlayByPlay(season);
      finishTimeSync.updated += r.updated;
      finishTimeSync.noMatch += r.noMatch;
      finishTimeSync.notYetFinished += r.notYetFinished;
    } catch (err) {
      logger.warn({ err, season }, "[maintenance] play-by-play backfill pass failed for season; continuing");
    }
  }
  const fallback = await storage.backfillGameFinishedAt();
  return { finishTimeSync, ...fallback };
}

const JOB_HANDLERS: Record<string, () => Promise<unknown>> = {
  [ROLLUP_JOB_NAME]: runRollupParlayStatuses,
  [PROPS_JOB_NAME]: runResolveProps,
  [BACKFILL_JOB_NAME]: runBackfillGameFinishedAt,
};

function getQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

async function scheduleRepeatable(q: Queue, name: string, pattern: string) {
  const existing = await q.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === name && j.pattern === pattern);
  if (alreadyScheduled) return;
  for (const j of existing.filter((j) => j.name === name)) {
    await q.removeRepeatableByKey(j.key);
  }
  await q.add(name, {}, { repeat: { pattern }, removeOnComplete: 20, removeOnFail: 20 });
  logger.info(`[maintenance] Scheduled "${name}" (cron: "${pattern}").`);
}

/** Starts the worker and (idempotently) registers all three maintenance
 * jobs' repeatable schedules. No-ops without Redis — the existing manual
 * admin buttons keep working either way. */
export async function startMaintenanceWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    logger.warn("[maintenance] Redis not configured — scheduled rollup/prop-resolution/backfill are disabled. Use the Admin Home maintenance buttons.");
    return;
  }

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const handler = JOB_HANDLERS[job.name];
        if (!handler) throw new Error(`Unknown maintenance job: ${job.name}`);
        return handler();
      },
      { connection: createBullMqConnection(), concurrency: 1 },
    );
    worker.on("completed", (job) => {
      logger.info({ job: job.name, result: job.returnvalue }, "[maintenance] scheduled job completed");
    });
    worker.on("failed", (job, err) => {
      logger.error({ err, job: job?.name, jobId: job?.id }, "[maintenance worker] job failed");
    });
  }

  const q = getQueue();
  if (!q) return;

  await scheduleRepeatable(q, ROLLUP_JOB_NAME, ROLLUP_CRON);
  await scheduleRepeatable(q, PROPS_JOB_NAME, PROPS_CRON);
  await scheduleRepeatable(q, BACKFILL_JOB_NAME, BACKFILL_CRON);
}
