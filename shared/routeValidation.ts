import { z } from "zod";
import { HERO_LABELS, LOSER_LABELS } from "./leagueLabels";

/** A sportsbook promo boost on a parlay's odds, in percent (25 = 25%).
 * Null means no boost. */
export const boostPctSchema = z.number().positive().max(500).nullable();

// Body for PUT /api/parlays/:id/boost, and (optionally) POST /api/parlays/:id/submit.
export const parlayBoostInputSchema = z.object({ boostPct: boostPctSchema }).strict();

export const createParlayInputSchema = z.object({
  leagueId: z.number(),
  weekId: z.number(),
  legs: z.array(
    z.object({
      gameId: z.number(),
      betType: z.string().min(1),
      pick: z.string().min(1),
      line: z.string().optional(),
    }),
  ),
});

// Body for POST /api/leagues/:leagueId/weeks/:weekId/draft-parlay/legs — the
// caller's one pick in the league's open parlay for that week (see
// shared/weekParlays.ts).
export const draftParlayLegInputSchema = z.object({
  gameId: z.number(),
  betType: z.string().min(1),
  pick: z.string().min(1),
  line: z.string().optional(),
  // Player-prop legs (betType === "player_prop") carry these instead of
  // relying on the game's own spread/moneyline/total odds.
  playerName: z.string().optional(),
  propType: z.string().optional(),
  // Which open parlay the pick goes into, or start another one: only needed
  // in a league that runs more than one parlay a week.
  parlayId: z.number().int().optional(),
  startNew: z.boolean().optional(),
  // "On Behalf Of": the member this pick is for, when it isn't the caller.
  onBehalfOfUserId: z.string().min(1).optional(),
});

export type DraftParlayLegInput = z.infer<typeof draftParlayLegInputSchema>;

export const updateParlayInputSchema = z
  .object({
    // Every status the Data Editor's dropdown offers.
    status: z.enum(["draft", "pending", "approved", "sent", "placed", "rejected", "win", "loss", "push", "void"]).optional(),
    legs: z
      .array(
        z.object({
          id: z.number(),
          result: z.enum(["win", "loss", "push"]).nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      )
      .optional(),
  })
  .strict();

export const updateParlayLegInputSchema = z
  .object({
    gameId: z.number().nullable().optional(),
    betType: z.string().min(1).optional(),
    pick: z.string().min(1).optional(),
    line: z.string().nullable().optional(),
    odds: z.string().nullable().optional(),
    oddsSource: z.string().nullable().optional(),
    result: z.enum(["win", "loss", "push"]).nullable().optional(),
    resultDetail: z.string().nullable().optional(),
    playerName: z.string().nullable().optional(),
    propType: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    gameSegment: z.string().nullable().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateUserSettingsSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    skipImportInstructions: z.boolean().optional(),
    primaryColor: z.string().max(32).optional(),
    // UserRegion (shared/schema.ts): a continent tile plus the state or
    // country picked under it. null clears a saved region.
    region: z
      .object({ continent: z.string().min(1).max(64), place: z.string().min(1).max(100) })
      .strict()
      .nullable()
      .optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
    preferredSportsbook: z.enum(["fanduel", "draftkings", "other"]).nullable().optional(),
    preferredSportsbookOther: z.string().max(60).nullable().optional(),
    avatarTeam: z.string().max(8).nullable().optional(),
  })
  .strict();

export const updateLeagueSettingsSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    maxParlaysPerWeek: z.number().int().positive().optional(),
    minLegsPerParlay: z.number().int().min(1).optional(),
    maxLegsPerParlay: z.number().int().min(1).optional(),
    maxBetsPerGame: z.number().int().min(1).optional(),
    insightsEnabled: z.boolean().optional(),
    loserLabel: z.enum(LOSER_LABELS).optional(),
    heroLabel: z.enum(HERO_LABELS).optional(),
    // The league's own emoji for its shame report; null goes back to the
    // defaults. Long enough for a multi-part emoji, too short for a sentence.
    shameEmoji: z.string().trim().min(1).max(16).nullable().optional(),
    // When the league started (ISO timestamp). Set automatically when the
    // league is made here; the Parlay Maestro can move it back for a league
    // that existed before, so backloaded history reads right.
    createdAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "League created date isn't a valid date" })
      .refine((v) => Date.parse(v) <= Date.now(), { message: "League created date can't be in the future" })
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minLegsPerParlay == null || data.maxLegsPerParlay == null) return true;
      return data.minLegsPerParlay <= data.maxLegsPerParlay;
    },
    { message: "minLegsPerParlay cannot exceed maxLegsPerParlay" },
  );

export const updateLeagueNotificationSettingsSchema = z
  .object({
    scheduledReminders: z.boolean(),
    reminderDaysBeforeDeadline: z.number().int().min(1).max(7),
    reminderMessage: z.string().max(500),
  })
  .strict();

export const lieutenantPermissionsSchema = z.object({
  approveRejectParlays: z.boolean(),
  editParlays: z.boolean(),
  lockParlay: z.boolean(),
  unlockParlay: z.boolean(),
  unselectUserPick: z.boolean(),
  // Newer than the rest: a page loaded before it existed won't send it.
  pickOnBehalf: z.boolean().default(false),
  approveMemberInvites: z.boolean(),
  importHistory: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  push: z.boolean(),
  phone: z.string().optional(),
  // Per-alert switches, keyed by NOTIFICATION_EVENTS key.
  events: z.record(z.string().max(40), z.boolean()).optional(),
});

export const addParlayLegInputSchema = z
  .object({
    gameId: z.number().nullable().optional(),
    betType: z.string().min(1),
    pick: z.string().min(1),
    line: z.string().nullable().optional(),
    odds: z.string().nullable().optional(),
    oddsSource: z.string().nullable().optional(),
    playerName: z.string().nullable().optional(),
    propType: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    gameSegment: z.string().nullable().optional(),
  })
  .strict();

const multiBetLegInputSchema = z
  .object({
    userId: z.string().min(1),
    gameId: z.number().int().nullable().optional(),
    betType: z.string().min(1),
    pick: z.string().min(1),
    line: z.string().nullable().optional(),
    odds: z.string().nullable().optional(),
    result: z.enum(["win", "loss", "push"]).nullable().optional(),
    playerName: z.string().nullable().optional(),
    propType: z.string().nullable().optional(),
  })
  .strict();

export const createMultiBetParlayInputSchema = z
  .object({
    userId: z.string().min(1),
    weekId: z.number().int().positive(),
    legs: z.array(multiBetLegInputSchema).min(1).max(50),
    boostPct: boostPctSchema.optional(),
  })
  .strict();

export type CreateParlayInput = z.infer<typeof createParlayInputSchema>;
export type UpdateParlayInput = z.infer<typeof updateParlayInputSchema>;
export type UpdateParlayLegInput = z.infer<typeof updateParlayLegInputSchema>;
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;
export type UpdateLeagueSettingsInput = z.infer<typeof updateLeagueSettingsSchema>;
export type UpdateLeagueNotificationSettingsInput = z.infer<
  typeof updateLeagueNotificationSettingsSchema
>;
export type AddParlayLegInput = z.infer<typeof addParlayLegInputSchema>;
export type CreateMultiBetParlayInput = z.infer<typeof createMultiBetParlayInputSchema>;
