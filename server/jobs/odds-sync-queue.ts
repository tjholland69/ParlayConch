import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { syncGamesFromOddsApi } from "../services/oddsApi";
import { logger } from "../logger";

const QUEUE_NAME = "odds-sync";

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

export function startOddsSyncWorker(): void {
  if (!isRedisConfigured() || worker) return;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<{ weekId: number }>) => {
      const { weekId } = job.data;
      return syncGamesFromOddsApi(weekId);
    },
    { connection: createBullMqConnection(), concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[odds-sync worker] job failed");
  });
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
