import { afterAll, beforeAll } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { fileURLToPath } from "url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const migrationsFolder = path.join(__dirname, "..", "..", "migrations");

export type TestDbContext = {
  ready: boolean;
  container?: StartedPostgreSqlContainer;
};

export const testDb: TestDbContext = { ready: false };

let initPromise: Promise<void> | null = null;
let suiteCount = 0;
let tornDown = false;

async function initializeDatabase(): Promise<void> {
  if (process.env.CI === "true") {
    if (!process.env.DATABASE_URL) {
      throw new Error("CI requires DATABASE_URL for integration tests");
    }
    const { db, pool } = await import("../../server/db");
    // CI reuses the same DATABASE_URL across runs, so previous runs'
    // tables are still there — reset the schema before migrating so
    // `migrate()` doesn't hit "relation already exists" (42P07). Also drop
    // the `drizzle` schema (its migration-tracking table survives a
    // public-only reset, which makes migrate() think everything's already
    // applied and silently skip recreating the tables).
    await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`);
    await migrate(db, { migrationsFolder });
    testDb.ready = true;
    return;
  }

  try {
    testDb.container = await new PostgreSqlContainer("postgres:16-alpine").start();
  } catch {
    console.warn(
      "[integration tests] No container runtime (start Docker) or use CI with DATABASE_URL — skipping.",
    );
    return;
  }

  process.env.DATABASE_URL = testDb.container.getConnectionUri();
  const { db } = await import("../../server/db");
  await migrate(db, { migrationsFolder });
  testDb.ready = true;
}

async function teardownDatabase(): Promise<void> {
  if (tornDown || !testDb.ready) return;
  tornDown = true;
  const { pool } = await import("../../server/db");
  await pool.end();
  if (testDb.container) await testDb.container.stop();
}

/** Register once per test file; shares a single Postgres instance across integration suites. */
export function setupTestDatabase(): void {
  suiteCount += 1;

  beforeAll(async () => {
    initPromise ??= initializeDatabase();
    await initPromise;
  }, 180_000);

  afterAll(async () => {
    suiteCount -= 1;
    if (suiteCount === 0) {
      await teardownDatabase();
    }
  });
}

export function skipIfNoDb(skip: (condition: boolean, reason?: string) => void): void {
  skip(!testDb.ready, "database not available");
}
