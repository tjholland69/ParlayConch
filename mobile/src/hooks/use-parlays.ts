import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ParlayWithLegs } from "@shared/schema";

export function useMyParlay(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs | null>({
    queryKey: ["/api/leagues", leagueId, "parlays", weekId, "mine"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/parlays/${weekId}/mine`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useLeagueParlays(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: ["/api/leagues", leagueId, "parlays", weekId],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/parlays/${weekId}`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useCreateParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { weekId: number; legs: { gameId: number; betType: string; pick: string; line?: string }[] }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/parlays`, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays", vars.weekId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays", vars.weekId, "mine"] });
    },
  });
}

export function useApproveParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) =>
      apiRequest("POST", `/api/leagues/${leagueId}/parlays/${parlayId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    },
  });
}

export function useRejectParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) =>
      apiRequest("POST", `/api/leagues/${leagueId}/parlays/${parlayId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    },
  });
}
