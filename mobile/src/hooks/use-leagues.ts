import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { LeagueWithMembers, LeagueMemberWithUser } from "@shared/schema";

export function useLeagues() {
  return useQuery<LeagueWithMembers[]>({
    queryKey: ["/api/leagues"],
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
