import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export interface UserSummary {
  leagueCount: number;
  parlaysPlaced: number;
  legsPlaced: number;
  legWins: number;
  legLosses: number;
  legWinRate: number;
}

export interface UserPatterns {
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  topBetType: { type: string; count: number } | null;
  favoritePlayer: { name: string; count: number } | null;
  favoriteDay: { day: string; count: number } | null;
  favoriteTimeOfDay: { label: string; count: number } | null;
}

export interface WinRateTimeSeriesPoint {
  weekLabel: string;
  myWinRate: number | null;
  indexWinRate: number | null;
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

export function useDashboardPerformance(leagueId?: number) {
  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.dashboard.performance.path, leagueId ?? "all"],
    queryFn: async () => {
      const url = leagueId ? `${api.dashboard.performance.path}?leagueId=${leagueId}` : api.dashboard.performance.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard performance");
      return res.json();
    },
  });
}
