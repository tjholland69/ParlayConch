import { getSessionRedis, redisKeyPrefix } from "./redis-clients";

const prefix = `${redisKeyPrefix()}cache:`;

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const r = getSessionRedis();
  if (!r) return null;
  const raw = await r.get(`${prefix}${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const r = getSessionRedis();
  if (!r) return;
  await r.set(`${prefix}${key}`, JSON.stringify(value), { EX: ttlSec });
}

export async function cacheDel(key: string): Promise<void> {
  const r = getSessionRedis();
  if (!r) return;
  await r.del(`${prefix}${key}`);
}
