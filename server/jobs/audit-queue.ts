import { Queue, Worker, type Job } from "bullmq";
import { createBullMqConnection, isRedisConfigured } from "../redis-clients";
import { db } from "../db";
import { auditEvents, type InsertAuditEvent } from "@shared/schema";
import { logger } from "../logger";

// Single-writer, many-producers audit ledger.
//
// Every app instance (route handlers, auth, background jobs) is a producer —
// they push events onto this queue and return immediately, never touching the
// audit_events table directly. Exactly one Worker (concurrency: 1) drains the
// queue and does the actual INSERT, so writes to the ledger are always
// serialized through a single connection no matter how many replicas or
// concurrent requests are producing events. That's what keeps this from
// turning into N-replicas-worth of concurrent writes flooding the DB, and
// it's what makes the ledger a true ordered log instead of something that
// needs merging/reconciling later.
const QUEUE_NAME = "audit-events";

let queue: Queue<InsertAuditEvent> | null = null;
let worker: Worker<InsertAuditEvent> | null = null;

function getQueue(): Queue<InsertAuditEvent> | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: createBullMqConnection() });
  }
  return queue;
}

export function startAuditWriter(): void {
  if (!isRedisConfigured() || worker) return;

  worker = new Worker<InsertAuditEvent>(
    QUEUE_NAME,
    async (job: Job<InsertAuditEvent>) => {
      await db.insert(auditEvents).values(job.data);
    },
    { connection: createBullMqConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[audit writer] failed to persist audit event");
  });
}

// Enqueue an audit event. Never throws — a producer's request should not fail
// because auditing is unavailable. Falls back to a direct insert when Redis
// isn't configured (e.g. local dev) so the ledger still works without the queue.
export async function enqueueAuditEvent(event: InsertAuditEvent): Promise<void> {
  try {
    const q = getQueue();
    if (q) {
      await q.add("write", event, { removeOnComplete: 1000, removeOnFail: 1000 });
      return;
    }
    await db.insert(auditEvents).values(event);
  } catch (err) {
    logger.error({ err, eventType: event.eventType }, "[audit] failed to enqueue audit event");
  }
}