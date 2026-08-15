import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "../server/db";

async function main() {
  await migrate(drizzle(pool), { migrationsFolder: "./migrations" });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});