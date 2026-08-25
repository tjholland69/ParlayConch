import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/api";

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

/** `leagueId` scopes every stat to one league; omitted/undefined = combined
 * across all the user's leagues (the default view). */
export function useDashboardSummary(leagueId?: number) {
  return useQuery<UserSummary>({
    queryKey: [api.dashboard.summary.path, leagueId ?? "all"],
    queryFn: () =>
      apiRequest<UserSummary>(
        "GET",
        leagueId ? `${api.dashboard.summary.path}?leagueId=${leagueId}` : api.dashboard.summary.path
      ),
  });
}

export function useDashboardPatterns(leagueId?: number) {
  return useQuery<UserPatterns>({
    queryKey: [api.dashboard.patterns.path, leagueId ?? "all"],
    queryFn: () =>
      apiRequest<UserPatterns>(
        "GET",
        leagueId ? `${api.dashboard.patterns.path}?leagueId=${leagueId}` : api.dashboard.patterns.path
      ),
  });
}

export function useDashboardPerformance(leagueId?: number) {
  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.performance.path, leagueId ?? "all"],
    queryFn: () =>
      apiRequest<{ points: WinRateTimeSeriesPoint[] }>(
        "GET",
        leagueId ? `${api.dashboard.performance.path}?leagueId=${leagueId}` : api.dashboard.performance.path
      ),
  });
}