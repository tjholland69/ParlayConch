import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ParlayWithLegs } from "@shared/schema";

const SENT_PARLAYS_QUERY_KEY = ["/api/users/me/sent-parlays"];

export function useSentParlays(enabled: boolean) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: SENT_PARLAYS_QUERY_KEY,
    queryFn: async () => apiRequest("GET", "/api/users/me/sent-parlays"),
    enabled,
  });
}

export function useMarkParlaySent(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) => apiRequest("POST", `/api/parlays/${parlayId}/mark-sent`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
    },
  });
}

export function useMarkParlayPlaced() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) => apiRequest("POST", `/api/parlays/${parlayId}/mark-placed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SENT_PARLAYS_QUERY_KEY });
    },
  });
}

export function useRevertParlayToApproved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) => apiRequest("POST", `/api/parlays/${parlayId}/revert-to-approved`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SENT_PARLAYS_QUERY_KEY });
    },
  });
}
