import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export interface UserSummary {
  leagueCount: number;
  parlaysPlaced: number;
  legsPlaced: number;
  legWins: number;
  legLosses: number;
  legWinRate: number;
  powerScore: number;
  participationRate: number;
  bar: number;
}

export interface UserPatterns {
  totalLegs: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  topBetType: { type: string; count: number } | null;
  favoritePlayer: { name: string; count: number } | null;
  favoriteDay: { day: string; count: number } | null;
  favoriteTimeOfDay: { label: string; count: number } | null;
  favoriteTeam: { team: string; count: number } | null;
  overUnderPreference: { pick: "over" | "under"; overCount: number; underCount: number } | null;
  slateBreakdown: { slate: string; count: number }[];
}

export interface WinRateTimeSeriesPoint {
  weekLabel: string;
  myWinRate: number | null;
  indexWinRate: number | null;
  myWeekWinRate: number | null;
  indexWeekWinRate: number | null;
  allWeekWinRate: number | null;
}

/** Mobile keeps the dashboard simple — no league/compare/date filters, just the default scope. */
export function useDashboardSummary() {
  return useQuery<UserSummary>({
    queryKey: [api.dashboard.summary.path],
  });
}

export function useDashboardPatterns() {
  return useQuery<UserPatterns>({
    queryKey: [api.dashboard.patterns.path],
  });
}

export function useDashboardPerformance() {
  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.performance.path],
  });
}