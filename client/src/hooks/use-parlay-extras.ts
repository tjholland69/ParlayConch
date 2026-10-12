import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SussTally } from "@shared/suss";
import type { PickSuggestion } from "@shared/pickSuggestions";
import type { PickTrend } from "@shared/pickTrends";

export type StoredPickSuggestion = PickSuggestion & { id: number };

const refreshParlays = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({
    predicate: (q) => q.queryKey.some((k) => typeof k === "string" && (k.includes("parlay") || k.includes("lock") || k.includes("/api/leagues"))),
  });

/** Any member: "this locked parlay is in at my sportsbook". */
export function useConfirmParlayPlaced() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (parlayId: number) => (await apiRequest("POST", `/api/parlays/${parlayId}/confirm-placed`)).json(),
    onSuccess: () => {
      refreshParlays(queryClient);
      toast({ title: "Marked as placed", description: "The parlay is in. It stays this way until the games settle it." });
    },
    onError: (err: Error) => toast({ title: "Couldn't mark it placed", description: err.message, variant: "destructive" }),
  });
}

/** Parlay Maestro: bust a locked or placed parlay back to open. */
export function useReopenParlay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (parlayId: number) => (await apiRequest("POST", `/api/parlays/${parlayId}/reopen`)).json(),
    onSuccess: () => {
      refreshParlays(queryClient);
      toast({ title: "Parlay reopened", description: "Picks can change again, except on games that have already started." });
    },
    onError: (err: Error) => toast({ title: "Couldn't reopen it", description: err.message, variant: "destructive" }),
  });
}

const sussKey = (leagueId: number, weekId?: number) => ["/api/leagues", leagueId, "suss", weekId ?? "all"];

/** Down-vote counts for the picks in the league's open parlay, by leg id. */
export function useSuss(leagueId: number | undefined, weekId?: number, enabled = true) {
  return useQuery<Record<number, SussTally>>({
    queryKey: sussKey(leagueId ?? 0, weekId),
    queryFn: async () => (await apiRequest("GET", `/api/leagues/${leagueId}/suss${weekId ? `?weekId=${weekId}` : ""}`)).json(),
    enabled: !!leagueId && enabled,
    refetchInterval: 20_000,
  });
}

export function useSussVote(leagueId: number, weekId?: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ legId, vote }: { legId: number; vote: boolean }) =>
      (await apiRequest("PUT", `/api/parlay-legs/${legId}/suss`, { vote })).json(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "suss"] }),
    onError: (err: Error) => toast({ title: "Couldn't save your vote", description: err.message, variant: "destructive" }),
  });
}

/** Nudges everyone without a pick, and hands back the text for the group chat. */
export function useSendReminder(leagueId: number, weekId: number | undefined) {
  return useMutation({
    mutationFn: async (): Promise<{ text: string; missingCount: number }> =>
      (await apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/reminder`)).json(),
  });
}

/** Super user: set a new password on a member's account. */
export function useAdminResetPassword() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }): Promise<{ message: string }> =>
      (await apiRequest("POST", "/api/admin/users/reset-password", input)).json(),
  });
}

/** Records what the sportsbook actually paid on the whole parlay ("+650"),
 * or clears it (null) so the app's estimate shows again. */
export function useSetParlayActualOdds() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ parlayId, actualOdds }: { parlayId: number; actualOdds: string | null }) =>
      (await apiRequest("PUT", `/api/parlays/${parlayId}/actual-odds`, { actualOdds })).json(),
    onSuccess: (_, { actualOdds }) => {
      refreshParlays(queryClient);
      toast({ title: actualOdds ? "Odds saved" : "Back to the estimated odds" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save the odds", description: err.message, variant: "destructive" }),
  });
}

/** The signed-in member's mobile number (E.164), or null. */
export function useMyPhone() {
  return useQuery<{ phoneNumber: string | null }>({ queryKey: ["/api/users/me/phone"] });
}

export function useSetMyPhone() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (phoneNumber: string | null): Promise<{ phoneNumber: string | null }> =>
      (await apiRequest("PUT", "/api/users/me/phone", { phoneNumber })).json(),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/users/me/phone"], data);
      toast({ title: data.phoneNumber ? "Mobile number saved" : "Mobile number removed" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save your mobile number", description: err.message, variant: "destructive" }),
  });
}

/**
 * Open bets with a winning record behind them, for the signed-in member in
 * this week's parlay. `parlayId` is the open parlay, when there is one, so
 * bets other members already have are left out.
 */
export function usePickSuggestions(leagueId: number | undefined, weekId: number | undefined, parlayId?: number, enabled = true) {
  // A negative id is a parlay still being created (see useAddDraftLeg).
  const openParlayId = parlayId != null && parlayId > 0 ? parlayId : undefined;
  return useQuery<StoredPickSuggestion[]>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "suggestions", openParlayId ?? "none"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/suggestions${openParlayId ? `?parlayId=${openParlayId}` : ""}`)).json(),
    enabled: !!leagueId && !!weekId && enabled,
    staleTime: 60_000,
  });
}

const refreshMembership = (queryClient: ReturnType<typeof useQueryClient>, leagueId: number) =>
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/leagues" && (q.queryKey[1] === leagueId || q.queryKey.length === 1) });

/** Parlay Maestro: corrects when a member was in the league ("2023-09-07"). */
export function useSetMemberDates(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ userId, startDate, endDate }: { userId: string; startDate: string; endDate?: string | null }) =>
      (await apiRequest("PATCH", `/api/leagues/${leagueId}/members/${userId}/dates`, endDate === undefined ? { startDate } : { startDate, endDate })).json(),
    onSuccess: () => {
      refreshMembership(queryClient, leagueId);
      toast({ title: "Dates saved", description: "Voids and participation now count from these dates." });
    },
    onError: (err: Error) => toast({ title: "Couldn't save the dates", description: err.message, variant: "destructive" }),
  });
}

/** Parlay Maestro: moves every member's start date back to their first pick. */
export function useBackdateMembers(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (): Promise<{ changed: { userId: string }[] }> =>
      (await apiRequest("POST", `/api/leagues/${leagueId}/members/backdate-to-first-pick`)).json(),
    onSuccess: ({ changed }) => {
      refreshMembership(queryClient, leagueId);
      toast({
        title: changed.length === 0 ? "Nothing to change" : `${changed.length} member${changed.length === 1 ? "" : "s"} backdated`,
        description: changed.length === 0 ? "Nobody has a pick from before their start date." : "Their start date is now the day of their first pick.",
      });
    },
    onError: (err: Error) => toast({ title: "Couldn't backdate members", description: err.message, variant: "destructive" }),
  });
}

/** The member's and the league's records by kind of bet (shared/pickTrends.ts). */
export function usePickTrends(leagueId: number | undefined, enabled = true) {
  return useQuery<{ you: PickTrend[]; league: PickTrend[] }>({
    queryKey: ["/api/leagues", leagueId, "pick-trends"],
    queryFn: async () => (await apiRequest("GET", `/api/leagues/${leagueId}/pick-trends`)).json(),
    enabled: !!leagueId && enabled,
    staleTime: 5 * 60_000,
  });
}
