import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Parlay } from "@shared/schema";
import type { SussTally } from "@shared/suss";
import type { PickSuggestion } from "@shared/pickSuggestions";
import type { PickTrend } from "@shared/pickTrends";

export type StoredPickSuggestion = PickSuggestion & { id: number };

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

/** Records what the sportsbook actually paid on the whole parlay ("+650"),
 * or clears it (null) so the app's estimate shows again. */
export function useSetParlayActualOdds(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parlayId, actualOdds }: { parlayId: number; actualOdds: string | null }): Promise<Parlay> =>
      apiRequest("PUT", `/api/parlays/${parlayId}/actual-odds`, { actualOdds }),
    onSuccess: () => refreshLeague(queryClient, leagueId),
  });
}

/** The signed-in member's mobile number (E.164), or null. */
export function useMyPhone() {
  return useQuery<{ phoneNumber: string | null }>({ queryKey: ["/api/users/me/phone"] });
}

export function useSetMyPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phoneNumber: string | null): Promise<{ phoneNumber: string | null }> =>
      apiRequest("PUT", "/api/users/me/phone", { phoneNumber }),
    onSuccess: (data) => queryClient.setQueryData(["/api/users/me/phone"], data),
  });
}

/**
 * Open bets with a winning record behind them, for the signed-in member in
 * this week's parlay. `parlayId` is the open parlay, when there is one, so
 * bets other members already have are left out.
 */
export function usePickSuggestions(leagueId: number, weekId: number, parlayId?: number, enabled = true) {
  return useQuery<StoredPickSuggestion[]>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "suggestions", parlayId ?? "none"],
    queryFn: () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/suggestions${parlayId ? `?parlayId=${parlayId}` : ""}`),
    enabled: !!leagueId && !!weekId && enabled,
    staleTime: 60_000,
  });
}

/** The member's and the league's records by kind of bet (shared/pickTrends.ts). */
export function usePickTrends(leagueId: number, enabled = true) {
  return useQuery<{ you: PickTrend[]; league: PickTrend[] }>({
    queryKey: ["/api/leagues", leagueId, "pick-trends"],
    queryFn: () => apiRequest("GET", `/api/leagues/${leagueId}/pick-trends`),
    enabled: !!leagueId && enabled,
    staleTime: 5 * 60_000,
  });
}
