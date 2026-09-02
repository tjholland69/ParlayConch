import { expect } from "vitest";
import type { ZodSchema } from "zod";
import {
  insertBetSchema,
  insertGameSchema,
  insertImportBatchSchema,
  insertLeagueMemberSchema,
  insertLeagueSchema,
  insertLeagueWeekLockSchema,
  insertNotificationSchema,
  insertParlayLegSchema,
  insertParlaySchema,
  insertPlayerSchema,
  insertPlayerWeekStatSchema,
  insertWeekSchema,
} from "../../shared/db-schema";

export type SchemaValidationRule = {
  id: string;
  description: string;
  schema: ZodSchema;
  payload: unknown;
  expect: "pass" | "fail";
  assertParsed?: (parsed: unknown) => void;
};

const gameTime = new Date("2026-09-07T23:15:00.000Z");

export const SCHEMA_VALIDATION_RULES: SchemaValidationRule[] = [
  // ─── weeks ───────────────────────────────────────────────────────────────
  {
    id: "week.minimal",
    description: "Week requires season, weekNumber, label",
    schema: insertWeekSchema,
    payload: { season: 2025, weekNumber: 1, label: "Week 1" },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { season: number; weekNumber: number; label: string };
      expect(parsed.season).toBe(2025);
      expect(parsed.weekNumber).toBe(1);
    },
  },
  {
    id: "week.missing-label",
    description: "Week rejects missing label",
    schema: insertWeekSchema,
    payload: { season: 2025, weekNumber: 1 },
    expect: "fail",
  },
  {
    id: "week.optional-isActive",
    description: "Week accepts explicit isActive false",
    schema: insertWeekSchema,
    payload: { season: 2025, weekNumber: 2, label: "W2", isActive: false },
    expect: "pass",
    assertParsed: (p) => expect((p as { isActive: boolean }).isActive).toBe(false),
  },

  // ─── games ───────────────────────────────────────────────────────────────
  {
    id: "game.minimal",
    description: "Game requires weekId, teams, gameTime",
    schema: insertGameSchema,
    payload: { weekId: 1, homeTeam: "KC", awayTeam: "BAL", gameTime },
    expect: "pass",
  },
  {
    id: "game.nullable-scores",
    description: "Game accepts explicit null scores",
    schema: insertGameSchema,
    payload: {
      weekId: 1,
      homeTeam: "KC",
      awayTeam: "BAL",
      gameTime,
      homeScore: null,
      awayScore: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { homeScore: null; awayScore: null };
      expect(parsed.homeScore).toBeNull();
      expect(parsed.awayScore).toBeNull();
    },
  },
  {
    id: "game.nullable-odds",
    description: "Game accepts null spread and moneyline fields",
    schema: insertGameSchema,
    payload: {
      weekId: 1,
      homeTeam: "KC",
      awayTeam: "BAL",
      gameTime,
      spread: null,
      moneylineHome: null,
      venue: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { spread: null; venue: null };
      expect(parsed.spread).toBeNull();
      expect(parsed.venue).toBeNull();
    },
  },
  {
    id: "game.optional-gameTime",
    description: "Game accepts missing gameTime (nullable column in current schema)",
    schema: insertGameSchema,
    payload: { weekId: 1, homeTeam: "KC", awayTeam: "BAL" },
    expect: "pass",
  },
  {
    id: "game.missing-homeTeam",
    description: "Game rejects missing homeTeam",
    schema: insertGameSchema,
    payload: { weekId: 1, awayTeam: "BAL", gameTime },
    expect: "fail",
  },

  // ─── leagues ─────────────────────────────────────────────────────────────
  {
    id: "league.name-only",
    description: "League create accepts name only",
    schema: insertLeagueSchema,
    payload: { name: "Sunday crew" },
    expect: "pass",
  },
  {
    id: "league.nullable-description",
    description: "League accepts null description",
    schema: insertLeagueSchema,
    payload: { name: "Crew", description: null },
    expect: "pass",
    assertParsed: (p) => expect((p as { description: null }).description).toBeNull(),
  },
  {
    id: "league.missing-name",
    description: "League rejects missing name",
    schema: insertLeagueSchema,
    payload: {},
    expect: "fail",
  },

  // ─── league members ──────────────────────────────────────────────────────
  {
    id: "member.valid",
    description: "League member requires leagueId and userId",
    schema: insertLeagueMemberSchema,
    payload: { leagueId: 1, userId: "user-1" },
    expect: "pass",
  },
  {
    id: "member.missing-userId",
    description: "League member rejects missing userId",
    schema: insertLeagueMemberSchema,
    payload: { leagueId: 1 },
    expect: "fail",
  },

  // ─── parlays ─────────────────────────────────────────────────────────────
  {
    id: "parlay.valid",
    description: "Parlay requires leagueId and weekId",
    schema: insertParlaySchema,
    payload: { leagueId: 1, weekId: 2 },
    expect: "pass",
  },
  {
    id: "parlay.missing-weekId",
    description: "Parlay rejects missing weekId",
    schema: insertParlaySchema,
    payload: { leagueId: 1 },
    expect: "fail",
  },

  // ─── parlay legs ─────────────────────────────────────────────────────────
  {
    id: "leg.spread",
    description: "Spread leg with gameId",
    schema: insertParlayLegSchema,
    payload: {
      parlayId: 1,
      gameId: 10,
      betType: "spread",
      pick: "home",
      line: "-3",
    },
    expect: "pass",
  },
  {
    id: "leg.player-prop-null-gameId",
    description: "Player prop leg allows null gameId",
    schema: insertParlayLegSchema,
    payload: {
      parlayId: 99,
      gameId: null,
      betType: "player_prop",
      pick: "over",
      line: "64.5",
      playerName: "Player",
      propType: "rec_yards",
    },
    expect: "pass",
    assertParsed: (p) => expect((p as { gameId: null }).gameId).toBeNull(),
  },
  {
    id: "leg.nullable-line-odds-result",
    description: "Leg accepts null line, odds, and optional fields",
    schema: insertParlayLegSchema,
    payload: {
      parlayId: 1,
      gameId: 5,
      betType: "moneyline",
      pick: "away",
      line: null,
      odds: null,
      playerName: null,
      propType: null,
      notes: null,
      gameSegment: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { line: null; odds: null; notes: null };
      expect(parsed.line).toBeNull();
      expect(parsed.odds).toBeNull();
      expect(parsed.notes).toBeNull();
    },
  },
  {
    id: "leg.missing-required",
    description: "Leg rejects missing parlayId and betType",
    schema: insertParlayLegSchema,
    payload: { pick: "home" },
    expect: "fail",
  },

  // ─── import batches ──────────────────────────────────────────────────────
  {
    id: "import-batch.valid",
    description: "Import batch requires leagueId, uploadedBy, filename",
    schema: insertImportBatchSchema,
    payload: {
      leagueId: 1,
      uploadedBy: "admin-1",
      originalFilename: "history.csv",
    },
    expect: "pass",
  },
  {
    id: "import-batch.missing-filename",
    description: "Import batch rejects missing filename",
    schema: insertImportBatchSchema,
    payload: { leagueId: 1, uploadedBy: "admin-1" },
    expect: "fail",
  },

  // ─── notifications ───────────────────────────────────────────────────────
  {
    id: "notification.valid",
    description: "Notification requires userId, type, title",
    schema: insertNotificationSchema,
    payload: { userId: "u1", type: "system", title: "Hello" },
    expect: "pass",
  },
  {
    id: "notification.nullable-message-league",
    description: "Notification accepts null message and leagueId",
    schema: insertNotificationSchema,
    payload: {
      userId: "u1",
      type: "announcement",
      title: "Update",
      message: null,
      leagueId: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { message: null; leagueId: null };
      expect(parsed.message).toBeNull();
      expect(parsed.leagueId).toBeNull();
    },
  },

  // ─── week locks ────────────────────────────────────────────────────────────
  {
    id: "week-lock.valid",
    description: "Week lock requires leagueId, weekId, lockedBy",
    schema: insertLeagueWeekLockSchema,
    payload: { leagueId: 1, weekId: 3, lockedBy: "admin" },
    expect: "pass",
  },
  {
    id: "week-lock.hadMissingBets-default",
    description: "Week lock accepts hadMissingBets boolean",
    schema: insertLeagueWeekLockSchema,
    payload: { leagueId: 1, weekId: 3, lockedBy: "admin", hadMissingBets: true },
    expect: "pass",
    assertParsed: (p) =>
      expect((p as { hadMissingBets: boolean }).hadMissingBets).toBe(true),
  },

  // ─── legacy bets ───────────────────────────────────────────────────────────
  {
    id: "bet.valid",
    description: "Bet requires gameId and pick",
    schema: insertBetSchema,
    payload: { gameId: 1, pick: "home" },
    expect: "pass",
  },
  {
    id: "bet.missing-pick",
    description: "Bet rejects missing pick",
    schema: insertBetSchema,
    payload: { gameId: 1 },
    expect: "fail",
  },

  // ─── players / stats ─────────────────────────────────────────────────────
  {
    id: "player.minimal",
    description: "Player requires name",
    schema: insertPlayerSchema,
    payload: { name: "Patrick Mahomes" },
    expect: "pass",
  },
  {
    id: "player.nullable-metadata",
    description: "Player accepts null nflverseId, position, team",
    schema: insertPlayerSchema,
    payload: {
      name: "Unknown",
      nflverseId: null,
      displayName: null,
      position: null,
      team: null,
      headshot: null,
    },
    expect: "pass",
    assertParsed: (p) => {
      const parsed = p as { team: null; position: null };
      expect(parsed.team).toBeNull();
      expect(parsed.position).toBeNull();
    },
  },
  {
    id: "player-stat.nullable-counts",
    description: "Player week stat accepts null stat columns",
    schema: insertPlayerWeekStatSchema,
    payload: {
      playerId: 1,
      season: 2025,
      week: 1,
      passingYards: null,
      rushingYards: null,
      receptions: null,
    },
    expect: "pass",
    assertParsed: (p) =>
      expect((p as { passingYards: null }).passingYards).toBeNull(),
  },
];
