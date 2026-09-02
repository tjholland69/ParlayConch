import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/db-schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const max = process.env.PG_POOL_MAX
  ? parseInt(process.env.PG_POOL_MAX, 10)
  : 20;
const idleTimeoutMillis = process.env.PG_POOL_IDLE_MS
  ? parseInt(process.env.PG_POOL_IDLE_MS, 10)
  : 30_000;
const connectionTimeoutMillis = process.env.PG_POOL_CONNECT_TIMEOUT_MS
  ? parseInt(process.env.PG_POOL_CONNECT_TIMEOUT_MS, 10)
  : 10_000;

const sslEnv = process.env.PG_SSL;
const ssl =
  sslEnv === "true" || sslEnv === "1"
    ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" }
    : false;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(max) ? max : 20,
  idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30_000,
  connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis)
    ? connectionTimeoutMillis
    : 10_000,
  ssl,
});

export const db = drizzle(pool, { schema });
