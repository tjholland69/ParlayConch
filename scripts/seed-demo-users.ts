/**
 * Seed script: creates 12 demo users for testing purposes.
 *
 * Run with:  npx tsx scripts/seed-demo-users.ts
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO UPDATE so existing
 * demo users are refreshed rather than duplicated.
 *
 * Demo users:
 *   ID:        demo_user_01 … demo_user_12
 *   Name:      ParlayConch Demo 1 … ParlayConch Demo 12
 *   Email:     demo1@parlayconch.demo … demo12@parlayconch.demo
 *              (fake TLD — no real emails ever sent)
 *   isDemo:    true
 */

import { db } from "../server/db";
import { users } from "../shared/schema";
import { sql } from "drizzle-orm";

const DEMO_COUNT = 12;

async function seedDemoUsers() {
  console.log("Seeding demo users…");

  for (let i = 1; i <= DEMO_COUNT; i++) {
    const n = String(i).padStart(2, "0");
    const id = `demo_user_${n}`;
    const firstName = `ParlayConch Demo ${i}`;
    const email = `demo${i}@parlayconch.demo`;

    await db
      .insert(users)
      .values({
        id,
        firstName,
        email,
        isDemo: true,
        settings: {},
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          firstName,
          email,
          isDemo: true,
          updatedAt: new Date(),
        },
      });

    console.log(`  ✓ ${id}  ${firstName}  <${email}>`);
  }

  console.log(`\nDone — ${DEMO_COUNT} demo users seeded.`);
  process.exit(0);
}

seedDemoUsers().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
