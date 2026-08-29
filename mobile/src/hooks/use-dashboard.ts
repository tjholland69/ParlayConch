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

export interface DashboardDateRange {
  startDate?: string;
  endDate?: string;
  /** NFL season year (e.g. 2025 for the season that runs Sept 2025–Feb 2026).
   * Used for the "Current Year"/"Prior Year" chips instead of a calendar-year
   * date range, since NFL seasons straddle two calendar years. Takes priority
   * over startDate/endDate when set. */
  season?: number;
}

export function useDashboardPerformance(leagueId?: number, dateRange?: DashboardDateRange) {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", String(leagueId));
  if (dateRange?.season != null) {
    params.set("season", String(dateRange.season));
  } else {
    if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
    if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  }
  const query = params.toString();

  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.performance.path, leagueId ?? "all", dateRange?.season ?? null, dateRange?.startDate ?? null, dateRange?.endDate ?? null],
    queryFn: () =>
      apiRequest<{ points: WinRateTimeSeriesPoint[] }>(
        "GET",
        query ? `${api.dashboard.performance.path}?${query}` : api.dashboard.performance.path
      ),
  });
}