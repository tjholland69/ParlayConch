import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { syncGamesFromOddsApi } from "../services/oddsApi";

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
    console.error("[odds-sync worker] job failed", job?.id, err);
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

export async function runOddsSyncQueued(weekId: number): Promise<{ added: number; updated: number }> {
  const q = getOddsSyncQueue();
  const ev = getOddsSyncQueueEvents();
  if (!q || !ev || process.env.USE_ODDS_SYNC_QUEUE !== "1") {
    return syncGamesFromOddsApi(weekId);
  }

  const job = await q.add("sync", { weekId }, { removeOnComplete: 100, removeOnFail: 50 });
  const result = await job.waitUntilFinished(ev, 120_000);
  return result as { added: number; updated: number };
}
