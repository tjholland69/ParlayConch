import { createClient, type RedisClientType } from "redis";
import IORedis from "ioredis";

const keyPrefix = process.env.REDIS_KEY_PREFIX ?? "pc:";

let sessionRedis: RedisClientType | null = null;
let ioredisPublisher: IORedis | null = null;

export function redisKeyPrefix(): string {
  return keyPrefix;
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

/** Node-redis client for connect-redis (sessions). */
export async function connectSessionRedis(): Promise<void> {
  if (!isRedisConfigured()) return;
  const url = process.env.REDIS_URL!;
  sessionRedis = createClient({
    url,
    socket: process.env.REDIS_TLS === "1" ? { tls: true } : undefined,
  });
  sessionRedis.on("error", (err) => console.error("[redis session]", err));
  await sessionRedis.connect();
}

export function getSessionRedis(): RedisClientType | null {
  return sessionRedis;
}

/** New ioredis connection for BullMQ (Worker/Queue/QueueEvents each need their own). */
export function createBullMqConnection(): IORedis {
  const url = process.env.REDIS_URL!;
  const conn = new IORedis(url, {
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_TLS === "1" ? {} : undefined,
  });
  conn.on("error", (err) => console.error("[ioredis bullmq]", err));
  return conn;
}

export function getIORedisPublisher(): IORedis | null {
  if (!isRedisConfigured()) return null;
  if (!ioredisPublisher) {
    const url = process.env.REDIS_URL!;
    ioredisPublisher = new IORedis(url, {
      maxRetriesPerRequest: null,
      tls: process.env.REDIS_TLS === "1" ? {} : undefined,
    });
    ioredisPublisher.on("error", (err) => console.error("[ioredis pub]", err));
  }
  return ioredisPublisher;
}
