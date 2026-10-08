/**
 * The alerts a member can get, and how each one behaves by default. One
 * catalog for the server (which decides who hears about what), and for the
 * Settings screens on web and mobile (which list them as switches).
 *
 * Every alert lands in the in-app inbox. Email, text and push are extra
 * channels a member turns on in their preferences. To add an alert: add it
 * here, then call notifyLeague/notifyUsers with its key where it happens.
 */
import type { UserNotificationPreferences } from "./schema";

export type NotificationEventKey =
  | "parlay_open"
  | "parlay_locked"
  | "parlay_unlocked"
  | "parlay_busted"
  | "slate_summary"
  | "pick_on_behalf"
  | "unlock_requested";

export type NotificationEventMeta = {
  key: NotificationEventKey;
  label: string;
  description: string;
  /** On unless the member turns it off. */
  defaultOn: boolean;
  /** Asks the member to do something, so it can't be switched off. */
  required?: boolean;
};

export const NOTIFICATION_EVENTS: NotificationEventMeta[] = [
  {
    key: "parlay_open",
    label: "New parlay is open",
    description: "Someone started the week's parlay and it's ready for your pick.",
    defaultOn: true,
  },
  {
    key: "parlay_locked",
    label: "Parlay is locked",
    description: "The week's picks are closed.",
    defaultOn: true,
  },
  {
    key: "parlay_unlocked",
    label: "Parlay is unlocked",
    description: "The week was reopened, so picks can change again.",
    defaultOn: true,
  },
  {
    key: "parlay_busted",
    label: "Parlay is busted",
    description: "A leg lost and took the parlay with it.",
    defaultOn: true,
  },
  {
    key: "slate_summary",
    label: "End-of-slate update",
    description: "Where the parlay stands once each slate of games wraps up.",
    defaultOn: false,
  },
  {
    key: "pick_on_behalf",
    label: "A pick was made for you",
    description: "Someone picked on your behalf and it needs your approval.",
    defaultOn: true,
    required: true,
  },
  {
    key: "unlock_requested",
    label: "Unlock requested",
    description: "A member asked for the week to be unlocked. Sent to whoever can unlock it.",
    defaultOn: true,
    required: true,
  },
];

const EVENT_BY_KEY = new Map(NOTIFICATION_EVENTS.map((e) => [e.key, e]));

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  email: false,
  sms: false,
  push: false,
};

/** Whether a member gets this alert at all, going by their preferences. */
export function wantsNotification(
  prefs: UserNotificationPreferences | null | undefined,
  event: NotificationEventKey,
): boolean {
  const meta = EVENT_BY_KEY.get(event);
  if (!meta) return false;
  if (meta.required) return true;
  return prefs?.events?.[event] ?? meta.defaultOn;
}

export type NotificationChannel = "email" | "sms" | "push";

/** The extra channels (beyond the in-app inbox) a member has switched on. */
export function enabledChannels(prefs: UserNotificationPreferences | null | undefined): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (prefs?.email) channels.push("email");
  if (prefs?.sms && prefs.phone?.trim()) channels.push("sms");
  if (prefs?.push) channels.push("push");
  return channels;
}
