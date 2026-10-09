import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SussTally } from "@shared/suss";

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
