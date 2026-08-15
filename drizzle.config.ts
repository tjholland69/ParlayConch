import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";

// Load .env.local for local dev (no-op if file doesn't exist)
try {
  const lines = readFileSync(".env.local", "utf8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.replace(/^export\s+/, "").split("=");
    if (key && rest.length) process.env[key.trim()] ??= rest.join("=").trim().replace(/^"|"$/g, "");
  }
} catch {}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const sslEnv = process.env.PG_SSL;
const ssl =
  sslEnv === "true" || sslEnv === "1"
    ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl,
  }
});
