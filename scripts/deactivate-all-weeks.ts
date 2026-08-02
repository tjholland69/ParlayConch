/**
 * One-time data fix: deactivates every week in the `weeks` table.
 *
 * Root cause: a since-removed `/api/seed` route created weeks without ever
 * passing `isActive`, back when the column's schema default was `true` — so
 * multiple stale 2024 weeks ended up flagged "active" simultaneously, and
 * whichever one the DB happened to return first (no ORDER BY, just
 * `.limit(1)`) won. The schema default is now `false` and new weeks must be
 * explicitly activated via `storage.setActiveWeek()`, but that fix doesn't
 * retroactively touch rows already sitting in the database.
 *
 * Run with:  npx tsx scripts/deactivate-all-weeks.ts
 *
 * After running, the app will correctly show "No Active Week" until you
 * activate a real one (e.g. via POST /api/admin/weeks/:id/activate once
 * Week 1, 2026 data is seeded).
 */

import { db } from "../server/db";
import { weeks } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const before = await db.select().from(weeks).where(eq(weeks.isActive, true));
  console.log(`Found ${before.length} week(s) currently flagged active:`);
  for (const w of before) {
    console.log(`  - id=${w.id} season=${w.season} week=${w.weekNumber} label="${w.label}"`);
  }

  await db.update(weeks).set({ isActive: false });

  const after = await db.select().from(weeks).where(eq(weeks.isActive, true));
  console.log(`\nDone — ${after.length} week(s) now flagged active (should be 0).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
