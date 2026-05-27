import type { UserSettings } from "./schema";

/** Statuses that count toward win/loss/push standings. */
export const DECIDED_PARLAY_STATUSES = ["win", "loss", "push"] as const;
export type DecidedParlayStatus = (typeof DECIDED_PARLAY_STATUSES)[number];

export function isDecidedParlayStatus(status: string | null | undefined): status is DecidedParlayStatus {
  return status != null && (DECIDED_PARLAY_STATUSES as readonly string[]).includes(status);
}

export type ParlayOutcomeCounts = {
  wins: number;
  losses: number;
  pushes: number;
};

export function countParlayOutcomes(
  parlays: ReadonlyArray<{ status: string | null }>,
): ParlayOutcomeCounts {
  const decided = parlays.filter((p) => isDecidedParlayStatus(p.status));
  return {
    wins: decided.filter((p) => p.status === "win").length,
    losses: decided.filter((p) => p.status === "loss").length,
    pushes: decided.filter((p) => p.status === "push").length,
  };
}

export function computeWinRate(counts: ParlayOutcomeCounts): number {
  const totalDecided = counts.wins + counts.losses;
  return totalDecided > 0 ? (counts.wins / totalDecided) * 100 : 0;
}

export type UserStatIdentity = {
  userId: string;
  firstName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  settings?: UserSettings | null;
};

/** Build a UserStat row from identity + outcome counts (shared by global and league stats). */
export function buildUserStat(identity: UserStatIdentity, counts: ParlayOutcomeCounts) {
  const settings = identity.settings;
  return {
    userId: identity.userId,
    username: settings?.displayName || identity.firstName || identity.email || "Unknown",
    profileImageUrl: identity.profileImageUrl,
    wins: counts.wins,
    losses: counts.losses,
    pushes: counts.pushes,
    winRate: computeWinRate(counts),
    region: settings?.region ?? null,
  };
}

/** Normalize SQL aggregate counts (may arrive as strings from pg). */
export function normalizeOutcomeCounts(raw: {
  wins: number | string;
  losses: number | string;
  pushes: number | string;
}): ParlayOutcomeCounts {
  return {
    wins: Number(raw.wins),
    losses: Number(raw.losses),
    pushes: Number(raw.pushes),
  };
}

/** Deep-merge user settings without dropping nested notificationPreferences keys. */
export function mergeUserSettings(
  current: UserSettings | null | undefined,
  patch: UserSettings,
): UserSettings {
  const base = current ?? {};
  const merged: UserSettings = { ...base, ...patch };

  if (patch.notificationPreferences !== undefined) {
    merged.notificationPreferences = {
      ...(base.notificationPreferences ?? {}),
      ...patch.notificationPreferences,
    };
  }

  return merged;
}
