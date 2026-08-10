/**
 * One-off backfill for the Replit-auth -> email/password migration.
 *
 * Finds every user with no row in `user_passwords` (i.e. accounts that can
 * currently only sign in via Replit), issues a one-time "set your password"
 * token (shared/models/auth.ts:passwordResetTokens), and emails them a link
 * to client's /set-password page.
 *
 * Skips users who already have an unused, unexpired token from a prior run
 * unless --resend is passed. Skips users with no email on file (can't be
 * migrated — flagged in the output for manual follow-up).
 *
 * Safe by default — runs as a dry run and only logs who would be emailed.
 * Pass --apply to actually issue tokens and send emails.
 *
 * Run with:
 *   npm run backfill:local-auth            (dry run)
 *   npm run backfill:local-auth -- --apply (issues tokens + sends emails)
 *   npm run backfill:local-auth -- --apply --resend (also re-emails users
 *     who already have a pending token)
 */
import crypto from "crypto";
import { db } from "../server/db";
import { users, userPasswords, passwordResetTokens } from "../shared/schema";
import { eq, isNull, and, gt, notExists } from "drizzle-orm";
import { hashResetToken } from "../server/replit_integrations/auth/localAuth";
import { sendSetPasswordEmail } from "../server/services/email";

const APPLY = process.argv.includes("--apply");
const RESEND = process.argv.includes("--resend");

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://parlayconch.com";

async function main() {
  const replitOnlyUsers = await db
    .select()
    .from(users)
    .where(
      notExists(
        db.select().from(userPasswords).where(eq(userPasswords.userId, users.id))
      )
    );

  console.log(`Found ${replitOnlyUsers.length} account(s) without a local password.`);

  let skippedNoEmail = 0;
  let skippedPendingToken = 0;
  let migrated = 0;

  for (const user of replitOnlyUsers) {
    if (!user.email) {
      skippedNoEmail++;
      console.log(`  SKIP (no email on file): user ${user.id}`);
      continue;
    }

    if (!RESEND) {
      const [pending] = await db
        .select({ id: passwordResetTokens.id })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        );
      if (pending) {
        skippedPendingToken++;
        console.log(`  SKIP (already has a pending token): ${user.email}`);
        continue;
      }
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const setPasswordUrl = `${APP_BASE_URL}/set-password?token=${rawToken}`;

    if (!APPLY) {
      console.log(`  [dry run] would email ${user.email} — ${setPasswordUrl}`);
      migrated++;
      continue;
    }

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    await sendSetPasswordEmail({
      toEmail: user.email,
      toName: user.firstName,
      setPasswordUrl,
    });

    console.log(`  Emailed ${user.email}`);
    migrated++;
  }

  console.log(
    `\nDone. ${migrated} ${APPLY ? "emailed" : "would be emailed"}, ` +
      `${skippedPendingToken} skipped (pending token), ${skippedNoEmail} skipped (no email).`
  );
  if (!APPLY) {
    console.log("This was a dry run — pass --apply to actually send emails.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });