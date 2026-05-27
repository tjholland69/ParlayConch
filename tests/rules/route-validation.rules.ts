import { expect } from "vitest";
import type { ZodSchema } from "zod";
import {
  addParlayLegInputSchema,
  createParlayInputSchema,
  updateLeagueNotificationSettingsSchema,
  updateLeagueSettingsSchema,
  updateParlayInputSchema,
  updateParlayLegInputSchema,
  updateUserSettingsSchema,
} from "../../shared/routeValidation";

export type RouteValidationRule = {
  id: string;
  description: string;
  schema: ZodSchema;
  payload: unknown;
  expect: "pass" | "fail";
  assertParsed?: (parsed: unknown) => void;
};

export const ROUTE_VALIDATION_RULES: RouteValidationRule[] = [
  // ─── POST /api/parlays ───────────────────────────────────────────────────
  {
    id: "createParlay.valid",
    description: "Accepts leagueId, weekId, and legs with gameId",
    schema: createParlayInputSchema,
    payload: {
      leagueId: 1,
      weekId: 2,
      legs: [
        { gameId: 10, betType: "spread", pick: "home", line: "-3" },
        { gameId: 11, betType: "moneyline", pick: "away" },
        { gameId: 12, betType: "over", pick: "over", line: "47.5" },
      ],
    },
    expect: "pass",
  },
  {
    id: "createParlay.missing-legs",
    description: "Rejects missing legs array",
    schema: createParlayInputSchema,
    payload: { leagueId: 1, weekId: 2 },
    expect: "fail",
  },
  {
    id: "createParlay.invalid-gameId",
    description: "Rejects non-numeric gameId",
    schema: createParlayInputSchema,
    payload: {
      leagueId: 1,
      weekId: 2,
      legs: [{ gameId: "10", betType: "spread", pick: "home" }],
    },
    expect: "fail",
  },
  {
    id: "createParlay.empty-betType",
    description: "Rejects empty betType string",
    schema: createParlayInputSchema,
    payload: {
      leagueId: 1,
      weekId: 2,
      legs: [{ gameId: 10, betType: "", pick: "home" }],
    },
    expect: "fail",
  },

  // ─── PATCH /api/parlays/:id ──────────────────────────────────────────────
  {
    id: "updateParlay.status-only",
    description: "Accepts status-only patch",
    schema: updateParlayInputSchema,
    payload: { status: "win" },
    expect: "pass",
  },
  {
    id: "updateParlay.leg-results",
    description: "Accepts leg result and nullable notes",
    schema: updateParlayInputSchema,
    payload: {
      legs: [
        { id: 1, result: "win", notes: null },
        { id: 2, result: "loss", notes: "bad beat" },
      ],
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { legs: { result: string | null }[] };
      expect(parsed.legs[0]!.result).toBe("win");
      expect(parsed.legs[0]!.notes).toBeNull();
    },
  },
  {
    id: "updateParlay.clear-leg-result",
    description: "Accepts explicit null result to clear settlement",
    schema: updateParlayInputSchema,
    payload: { legs: [{ id: 5, result: null }] },
    expect: "pass",
    assertParsed: (p) =>
      expect((p as { legs: { result: null }[] }).legs[0]!.result).toBeNull(),
  },
  {
    id: "updateParlay.unknown-field",
    description: "Rejects unknown top-level fields (strict)",
    schema: updateParlayInputSchema,
    payload: { status: "win", hacker: true },
    expect: "fail",
  },
  {
    id: "updateParlay.invalid-status",
    description: "Rejects invalid status enum",
    schema: updateParlayInputSchema,
    payload: { status: "maybe" },
    expect: "fail",
  },

  // ─── PATCH /api/parlay-legs/:legId ─────────────────────────────────────
  {
    id: "updateParlayLeg.partial",
    description: "Accepts partial leg patch",
    schema: updateParlayLegInputSchema,
    payload: { line: "-3.5", odds: "-110" },
    expect: "pass",
  },
  {
    id: "updateParlayLeg.nullable-fields",
    description: "Accepts explicit null on nullable string fields",
    schema: updateParlayLegInputSchema,
    payload: {
      line: null,
      odds: null,
      result: null,
      playerName: null,
      notes: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { line: null; result: null };
      expect(parsed.line).toBeNull();
      expect(parsed.result).toBeNull();
    },
  },
  {
    id: "updateParlayLeg.invalid-result",
    description: "Rejects invalid result enum",
    schema: updateParlayLegInputSchema,
    payload: { result: "pending" },
    expect: "fail",
  },
  {
    id: "updateParlayLeg.unknown-field",
    description: "Rejects unknown fields (strict)",
    schema: updateParlayLegInputSchema,
    payload: { gameId: 99 },
    expect: "fail",
  },

  // ─── PATCH /api/users/me/settings ───────────────────────────────────────
  {
    id: "userSettings.displayName",
    description: "Accepts displayName update",
    schema: updateUserSettingsSchema,
    payload: { displayName: "Tim" },
    expect: "pass",
  },
  {
    id: "userSettings.theme-region",
    description: "Accepts theme and region enums",
    schema: updateUserSettingsSchema,
    payload: { theme: "dark", region: "US" },
    expect: "pass",
  },
  {
    id: "userSettings.invalid-theme",
    description: "Rejects invalid theme",
    schema: updateUserSettingsSchema,
    payload: { theme: "neon" },
    expect: "fail",
  },
  {
    id: "userSettings.invalid-region",
    description: "Rejects invalid region",
    schema: updateUserSettingsSchema,
    payload: { region: "Mars" },
    expect: "fail",
  },
  {
    id: "userSettings.unknown-nested-json",
    description: "Rejects arbitrary nested keys (use notification-preferences route)",
    schema: updateUserSettingsSchema,
    payload: { notificationPreferences: { email: false } },
    expect: "fail",
  },

  // ─── PATCH /api/leagues/:id/settings ───────────────────────────────────
  {
    id: "leagueSettings.name-only",
    description: "Accepts league name update",
    schema: updateLeagueSettingsSchema,
    payload: { name: "New League Name" },
    expect: "pass",
  },
  {
    id: "leagueSettings.nullable-description",
    description: "Accepts null description to clear field",
    schema: updateLeagueSettingsSchema,
    payload: { description: null },
    expect: "pass",
    assertParsed: (p) => expect((p as { description: null }).description).toBeNull(),
  },
  {
    id: "leagueSettings.leg-limits",
    description: "Accepts min/max leg limits when min <= max",
    schema: updateLeagueSettingsSchema,
    payload: { minLegsPerParlay: 2, maxLegsPerParlay: 6 },
    expect: "pass",
  },
  {
    id: "leagueSettings.min-exceeds-max",
    description: "Rejects minLegsPerParlay greater than maxLegsPerParlay",
    schema: updateLeagueSettingsSchema,
    payload: { minLegsPerParlay: 6, maxLegsPerParlay: 3 },
    expect: "fail",
  },
  {
    id: "leagueSettings.unknown-field",
    description: "Rejects unknown fields (strict)",
    schema: updateLeagueSettingsSchema,
    payload: { name: "X", inviteCode: "HACK" },
    expect: "fail",
  },

  // ─── PATCH /api/leagues/:id/notification-settings ──────────────────────
  {
    id: "leagueNotification.valid",
    description: "Accepts full notification settings payload",
    schema: updateLeagueNotificationSettingsSchema,
    payload: {
      scheduledReminders: true,
      reminderDaysBeforeDeadline: 3,
      reminderMessage: "Submit picks!",
    },
    expect: "pass",
  },
  {
    id: "leagueNotification.invalid-days",
    description: "Rejects reminderDaysBeforeDeadline outside 1-7",
    schema: updateLeagueNotificationSettingsSchema,
    payload: {
      scheduledReminders: true,
      reminderDaysBeforeDeadline: 14,
      reminderMessage: "Too early",
    },
    expect: "fail",
  },
  {
    id: "leagueNotification.missing-message",
    description: "Rejects missing reminderMessage",
    schema: updateLeagueNotificationSettingsSchema,
    payload: { scheduledReminders: false, reminderDaysBeforeDeadline: 2 },
    expect: "fail",
  },

  // ─── POST /api/parlays/:id/legs (demo editor) ───────────────────────────
  {
    id: "addParlayLeg.valid",
    description: "Accepts required betType and pick with optional nullables",
    schema: addParlayLegInputSchema,
    payload: {
      betType: "spread",
      pick: "home",
      line: "-3",
      odds: "-110",
    },
    expect: "pass",
  },
  {
    id: "addParlayLeg.player-prop-nullables",
    description: "Accepts player prop with explicit null game-adjacent fields",
    schema: addParlayLegInputSchema,
    payload: {
      betType: "player_prop",
      pick: "over",
      line: "64.5",
      playerName: "Player",
      propType: "rec_yards",
      notes: null,
    },
    expect: "pass",
  },
  {
    id: "addParlayLeg.missing-pick",
    description: "Rejects missing pick",
    schema: addParlayLegInputSchema,
    payload: { betType: "spread" },
    expect: "fail",
  },
  {
    id: "addParlayLeg.unknown-field",
    description: "Rejects unknown fields (strict)",
    schema: addParlayLegInputSchema,
    payload: { betType: "spread", pick: "home", gameId: 1 },
    expect: "fail",
  },
];
