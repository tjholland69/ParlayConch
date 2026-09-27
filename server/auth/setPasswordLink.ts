import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { passwordResetTokens, type User } from "@shared/models/auth";
import { sendSetPasswordEmail } from "../services/email";
import { hashResetToken } from "./localAuth";
import { logger } from "../logger";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
// Don't send another link if one went out this recently (stops inbox flooding
// from repeated sign-in attempts).
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Emails a one-time "set your password" link to an account that has no
 * password yet (accounts created through the retired single sign-on).
 * Only the owner of the inbox can use the link, so attaching a password to an
 * existing account always requires proving control of its email address.
 *
 * Best effort: failures are logged, never thrown, so callers can always reply
 * with the same generic message.
 */
export async function sendSetPasswordLink(user: Pick<User, "id" | "email" | "firstName">): Promise<void> {
  if (!user.email) return;
  try {
    const [recent] = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS))
        )
      );
    if (recent) return;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const baseUrl = process.env.APP_BASE_URL ?? "https://parlayconch.com";
    await sendSetPasswordEmail({
      toEmail: user.email,
      toName: user.firstName ?? null,
      setPasswordUrl: `${baseUrl}/set-password?token=${rawToken}`,
    });
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "[local auth] failed to send set-password link");
  }
}
