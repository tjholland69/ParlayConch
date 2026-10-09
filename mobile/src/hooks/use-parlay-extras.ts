import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Parlay } from "@shared/schema";
import type { SussTally } from "@shared/suss";

function refreshLeague(queryClient: ReturnType<typeof useQueryClient>, leagueId: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
  queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues/active-week-status"] });
}

/** Any member: "this locked parlay is in at my sportsbook". */
export function useConfirmParlayPlaced(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number): Promise<Parlay> => apiRequest("POST", `/api/parlays/${parlayId}/confirm-placed`),
    onSuccess: () => refreshLeague(queryClient, leagueId),
  });
}

/** Parlay Maestro: bust a locked or placed parlay back to open. */
export function useReopenParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number): Promise<Parlay> => apiRequest("POST", `/api/parlays/${parlayId}/reopen`),
    onSuccess: () => refreshLeague(queryClient, leagueId),
  });
}

/** Down-vote counts for the picks in the league's open parlay, by leg id. */
export function useSuss(leagueId: number | undefined, weekId?: number, enabled = true) {
  return useQuery<Record<number, SussTally>>({
    queryKey: ["/api/leagues", leagueId, "suss", weekId ?? "all"],
    queryFn: () => apiRequest("GET", `/api/leagues/${leagueId}/suss${weekId ? `?weekId=${weekId}` : ""}`),
    enabled: !!leagueId && enabled,
    refetchInterval: 20_000,
  });
}

export function useSussVote(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ legId, vote }: { legId: number; vote: boolean }) => apiRequest("PUT", `/api/parlay-legs/${legId}/suss`, { vote }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "suss"] }),
  });
}

/** Nudges everyone without a pick, and hands back the text for the group chat. */
export function useSendReminder(leagueId: number, weekId: number | undefined) {
  return useMutation({
    mutationFn: (): Promise<{ text: string; missingCount: number }> =>
      apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/reminder`),
  });
}
