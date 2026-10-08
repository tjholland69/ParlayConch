/**
 * One place alerts leave from. Call notifyUsers/notifyLeague with an alert
 * from shared/notifications.ts and it works out who wants it and on which
 * channels.
 *
 * Every alert is written to the in-app inbox (the bell on web, and the
 * source for anything else that reads notifications). Email goes out to
 * members who switched it on, when Resend is configured. Text and push have
 * a member-facing switch but no provider wired up yet: CHANNEL_SENDERS is
 * where a Twilio or Expo push sender plugs in, and nothing else changes.
 *
 * Sending never throws into the caller: a failed alert is logged and the
 * action that triggered it still succeeds.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";
import { leagueMembers, notifications, users } from "@shared/db-schema";
import type { UserNotificationPreferences, UserSettings } from "@shared/schema";
import {
  enabledChannels,
  wantsNotification,
  type NotificationChannel,
  type NotificationEventKey,
} from "@shared/notifications";
import { publishUserEvent } from "../realtime-bus";
import { sendNotificationEmail } from "./email";

type Recipient = {
  id: string;
  email: string | null;
  firstName: string | null;
  prefs: UserNotificationPreferences | null;
};

export type NotifyInput = {
  event: NotificationEventKey;
  leagueId?: number;
  title: string;
  message?: string;
  /** Where the alert leads, as an app path ("/leagues/3"). */
  path?: string;
  /** Left out of the recipients: whoever caused the alert doesn't need it. */
  actorUserId?: string | null;
  /** Makes the alert once-only per member (see notifications.dedupeKey). */
  dedupeKey?: string;
};

type ChannelSender = (to: Recipient, input: NotifyInput) => Promise<void>;

const CHANNEL_SENDERS: Record<NotificationChannel, ChannelSender | null> = {
  email: async (to, input) => {
    if (!to.email || !process.env.RESEND_API_KEY) return;
    await sendNotificationEmail({
      toEmail: to.email,
      toName: to.firstName,
      title: input.title,
      message: input.message ?? "",
      path: input.path,
    });
  },
  // No text or push provider is set up yet.
  sms: null,
  push: null,
};

async function loadRecipients(userIds: string[]): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, settings: users.settings })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    prefs: (r.settings as UserSettings | null)?.notificationPreferences ?? null,
  }));
}

/** Sends an alert to these members, minus the actor and anyone who opted out. */
export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
  try {
    const ids = [...new Set(userIds)].filter((id) => id !== input.actorUserId);
    const recipients = (await loadRecipients(ids)).filter((r) => wantsNotification(r.prefs, input.event));
    if (recipients.length === 0) return;

    // With a dedupe key, only members who didn't already have the alert get
    // it again on the other channels.
    const inserted = await db
      .insert(notifications)
      .values(recipients.map((r) => ({
        userId: r.id,
        leagueId: input.leagueId,
        type: input.event,
        title: input.title,
        message: input.message,
        dedupeKey: input.dedupeKey,
      })))
      .onConflictDoNothing()
      .returning({ userId: notifications.userId });
    const fresh = new Set(inserted.map((r) => r.userId));

    for (const to of recipients) {
      if (!fresh.has(to.id)) continue;
      void publishUserEvent(to.id, "notifications_updated").catch(() => undefined);
      for (const channel of enabledChannels(to.prefs)) {
        const send = CHANNEL_SENDERS[channel];
        if (!send) continue;
        send(to, input).catch((err) => logger.warn({ err, channel, event: input.event }, "[notify] channel send failed"));
      }
    }
  } catch (err) {
    logger.error({ err, event: input.event }, "[notify] failed");
  }
}

/** Sends an alert to every active member of a league. */
export async function notifyLeague(leagueId: number, input: Omit<NotifyInput, "leagueId">): Promise<void> {
  try {
    const members = await db
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.isActive, true)));
    await notifyUsers(members.map((m) => m.userId), { ...input, leagueId });
  } catch (err) {
    logger.error({ err, event: input.event }, "[notify] failed");
  }
}
