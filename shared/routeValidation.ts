import { z } from "zod";

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

export const updateParlayInputSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "win", "loss", "push"]).optional(),
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
    betType: z.string().min(1).optional(),
    pick: z.string().min(1).optional(),
    line: z.string().nullable().optional(),
    odds: z.string().nullable().optional(),
    result: z.enum(["win", "loss", "push"]).nullable().optional(),
    playerName: z.string().nullable().optional(),
    propType: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    gameSegment: z.string().nullable().optional(),
  })
  .strict();

export const updateUserSettingsSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    skipImportInstructions: z.boolean().optional(),
    primaryColor: z.string().max(32).optional(),
    region: z.enum(["US", "EMEA", "APAC"]).optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
  })
  .strict();

export const updateLeagueSettingsSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    maxParlaysPerWeek: z.number().int().positive().optional(),
    minLegsPerParlay: z.number().int().min(1).optional(),
    maxLegsPerParlay: z.number().int().min(1).optional(),
    insightsEnabled: z.boolean().optional(),
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

export const addParlayLegInputSchema = z
  .object({
    betType: z.string().min(1),
    pick: z.string().min(1),
    line: z.string().nullable().optional(),
    odds: z.string().nullable().optional(),
    playerName: z.string().nullable().optional(),
    propType: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    gameSegment: z.string().nullable().optional(),
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
