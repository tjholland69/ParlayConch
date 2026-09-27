/**
 * One-off migration: hand an existing demo/seed user account off to a real
 * friend so they inherit its history (past parlays, stats, league
 * membership) instead of starting from scratch.
 *
 * `users.id` is a stable, app-generated UUID that every other table's
 * foreign keys point at (parlays.userId, parlayLegs.userId,
 * leagueMembers.userId, etc.) — none of them key off email. So "handing off"
 * an account is just updating that one row's identity fields in place, not a
 * data migration: no parlay/league rows need to move.
 *
 * Steps: update the demo user's email/first/last name, flip isDemo off, then
 * issue a one-time "set your password" token (same mechanism as
 * scripts/backfill-local-auth.ts) and email it to the friend's new address.
 *
 * Safe by default — runs as a dry run and only prints what would change.
 * Pass --apply to actually write the changes and send the email.
 *
 * Run with:
 *   npm run claim-demo-user -- --demo-email=demo1@example.com --new-email=friend@gmail.com --first-name=Alex --last-name=Smith
 *   npm run claim-demo-user -- --demo-email=demo1@example.com --new-email=friend@gmail.com --apply
 */
import crypto from "crypto";
import { db } from "../server/db";
import { users, passwordResetTokens } from "../shared/schema";
import { eq } from "drizzle-orm";
import { hashResetToken } from "../server/replit_integrations/auth/localAuth";
import { sendClaimAccountEmail } from "../server/services/email";

const APPLY = process.argv.includes("--apply");
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://parlayconch.com";

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const demoEmail = argValue("demo-email");
  const newEmail = argValue("new-email");
  const firstName = argValue("first-name");
  const lastName = argValue("last-name");

  if (!demoEmail || !newEmail) {
    console.error("Usage: npm run claim-demo-user -- --demo-email=<existing demo user's email> --new-email=<friend's real email> [--first-name=X] [--last-name=Y] [--apply]");
    process.exit(1);
  }

  const [demoUser] = await db.select().from(users).where(eq(users.email, demoEmail));
  if (!demoUser) {
    console.error(`No user found with email ${demoEmail}`);
    process.exit(1);
  }
  if (!demoUser.isDemo) {
    console.error(`User ${demoEmail} is not flagged isDemo — refusing to claim a real account. If this is intentional, flip isDemo off manually first.`);
    process.exit(1);
  }

  if (newEmail !== demoEmail) {
    const [conflict] = await db.select().from(users).where(eq(users.email, newEmail));
    if (conflict) {
      console.error(`${newEmail} is already in use by a different account (${conflict.id}) — refusing to overwrite it.`);
      process.exit(1);
    }
  }

  console.log(`Claiming demo user ${demoUser.id} (${demoUser.email}):`);
  console.log(`  email:    ${demoUser.email} -> ${newEmail}`);
  if (firstName) console.log(`  firstName: ${demoUser.firstName ?? "(none)"} -> ${firstName}`);
  if (lastName) console.log(`  lastName:  ${demoUser.lastName ?? "(none)"} -> ${lastName}`);
  console.log(`  isDemo:   true -> false`);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const setPasswordUrl = `${APP_BASE_URL}/set-password?token=${rawToken}`;

  if (!APPLY) {
    console.log(`\n[dry run] would email ${newEmail} — ${setPasswordUrl}`);
    console.log("This was a dry run — pass --apply to actually write the changes and send the email.");
    return;
  }

  // Send before persisting the token/user changes: if the send fails we want
  // a clean retry, not a half-migrated account with an orphaned token.
  await sendClaimAccountEmail({
    toEmail: newEmail,
    toName: firstName ?? demoUser.firstName ?? null,
    leagueName: null,
    setPasswordUrl,
  });

  await db.update(users)
    .set({
      email: newEmail,
      firstName: firstName ?? demoUser.firstName,
      lastName: lastName ?? demoUser.lastName,
      isDemo: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, demoUser.id));

  await db.insert(passwordResetTokens).values({
    userId: demoUser.id,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  console.log(`\nDone. ${newEmail} can now set a password and sign in as this account.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
