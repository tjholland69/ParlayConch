import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { LeagueWithMembers, LeagueMemberWithUser } from "@shared/schema";

export function useLeagues() {
  return useQuery<LeagueWithMembers[]>({
    queryKey: ["/api/leagues"],
  });
}

/** All-time parlay_leg win rate + total parlays won per league, keyed by leagueId — same data web shows on its Leagues list. */
export function useLeaguesOverviewStats() {
  return useQuery<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number; parlaysWon: number }>>({
    queryKey: ["/api/leagues/overview-stats"],
  });
}

export function useLeagueStats(leagueId: number) {
  return useQuery<import("@shared/schema").LeagueStats[]>({
    queryKey: ["/api/leagues", leagueId, "stats"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/stats`),
    enabled: !!leagueId,
  });
}

export function useLeagueMembersWithUsers(leagueId: number) {
  return useQuery<LeagueMemberWithUser[]>({
    queryKey: ["/api/leagues", leagueId, "members"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/members`),
    enabled: !!leagueId,
  });
}

export function useWeekLockStatus(leagueId: number, weekId: number) {
  return useQuery<import("@shared/schema").WeekLockStatus>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/lock`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useCreateLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiRequest("POST", "/api/leagues", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
  });
}

export function useJoinLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      apiRequest("POST", "/api/leagues/join", { inviteCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
  });
}

export function useLockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hadMissingBets: boolean) =>
      apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/lock`, { hadMissingBets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"] });
    },
  });
}

export function useUnlockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/leagues/${leagueId}/weeks/${weekId}/lock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"] });
    },
  });
}

export type InviteByEmailResult = {
  results: {
    email: string;
    status: "invited" | "added" | "already_member";
    username?: string;
  }[];
};

export function useInviteByEmail(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emails: string[]) =>
      apiRequest<InviteByEmailResult>("POST", `/api/leagues/${leagueId}/invite-by-email`, { emails }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "members"] });
    },
  });
}
