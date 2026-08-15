import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Integration test files share one Postgres instance/schema (see
    // tests/helpers/test-db.ts) and CI resets the schema before migrating —
    // running files in parallel races that reset against other files' tables.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
