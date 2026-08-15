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
}

export interface WinRateTimeSeriesPoint {
  weekLabel: string;
  myWinRate: number | null;
  indexWinRate: number | null;
  myWeekWinRate: number | null;
  indexWeekWinRate: number | null;
  allWeekWinRate: number | null;
}

export function useDashboardSummary() {
  return useQuery<UserSummary>({
    queryKey: [api.dashboard.summary.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.summary.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },
  });
}

export function useDashboardPatterns() {
  return useQuery<UserPatterns>({
    queryKey: [api.dashboard.patterns.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.patterns.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard patterns");
      return res.json();
    },
  });
}

export interface AdvancedPerformanceFilters {
  leagueIds?: number[];
  memberUserIds?: string[];
  betTypes?: string[];
  propTypes?: string[];
  playerName?: string;
  teamName?: string;
}

/** Ephemeral, ad-hoc slice of the performance series — nothing is persisted. */
export function useDashboardAdvancedPerformance(filters: AdvancedPerformanceFilters) {
  const params = new URLSearchParams();
  if (filters.leagueIds?.length) params.set("leagueIds", filters.leagueIds.join(","));
  if (filters.memberUserIds?.length) params.set("memberUserIds", filters.memberUserIds.join(","));
  if (filters.betTypes?.length) params.set("betTypes", filters.betTypes.join(","));
  if (filters.propTypes?.length) params.set("propTypes", filters.propTypes.join(","));
  if (filters.playerName?.trim()) params.set("playerName", filters.playerName.trim());
  if (filters.teamName?.trim()) params.set("teamName", filters.teamName.trim());
  const qs = params.toString();

  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.advancedPerformance.path, qs],
    queryFn: async () => {
      const url = qs
        ? `${api.dashboard.advancedPerformance.path}?${qs}`
        : api.dashboard.advancedPerformance.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch advanced performance");
      return res.json();
    },
  });
}

export interface DashboardDateRange {
  startDate?: string; // ISO date (yyyy-mm-dd)
  endDate?: string;
}

export function useDashboardPerformance(leagueId?: number, dateRange?: DashboardDateRange) {
  const params = new URLSearchParams();
  if (leagueId) params.set("leagueId", String(leagueId));
  if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
  if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  const qs = params.toString();

  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.performance.path, leagueId ?? "all", dateRange?.startDate ?? "", dateRange?.endDate ?? ""],
    queryFn: async () => {
      const url = qs ? `${api.dashboard.performance.path}?${qs}` : api.dashboard.performance.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard performance");
      return res.json();
    },
  });
}
