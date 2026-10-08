import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnBehalfInfo } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { invalidateDraftParlayQueries } from "@/hooks/use-bets";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Something went wrong");
  }
  return res.json();
}

/** Who the caller can pick for in this league, and who can pick for them. */
export function useOnBehalfInfo(leagueId: number) {
  return useQuery<OnBehalfInfo>({
    queryKey: ["/api/leagues", leagueId, "on-behalf"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/on-behalf`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load On Behalf Of settings");
      return res.json();
    },
    enabled: !!leagueId,
    staleTime: 60_000,
  });
}

/** Lets a member pick for the caller (`allow: true`), or takes that back. */
export function useSetPickDelegate(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ delegateUserId, allow }: { delegateUserId: string; allow: boolean }) =>
      send(`/api/leagues/${leagueId}/pick-delegates/${encodeURIComponent(delegateUserId)}`, allow ? "PUT" : "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "on-behalf"] }),
    onError: (error: Error) => toast({ title: "Couldn't save", description: error.message, variant: "destructive" }),
  });
}

/** Approves or rejects a pick that was made on a member's behalf. */
export function useResolveLegApproval(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ legId, action }: { legId: number; action: "approve" | "reject" }) =>
      send(`/api/parlay-legs/${legId}/approval`, "POST", { action }),
    onSuccess: (_data, { action }) => {
      invalidateDraftParlayQueries(queryClient, leagueId, weekId);
      toast({ title: action === "approve" ? "Pick approved" : "Pick rejected" });
    },
    onError: (error: Error) => toast({ title: "Couldn't save", description: error.message, variant: "destructive" }),
  });
}

/** Asks whoever can unlock the week to do so. */
export function useRequestUnlock(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (reason?: string) => send(`/api/leagues/${leagueId}/weeks/${weekId}/unlock-requests`, "POST", { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      toast({ title: "Unlock requested", description: "The Parlay Maestro has been asked to unlock this week." });
    },
    onError: (error: Error) => toast({ title: "Couldn't send the request", description: error.message, variant: "destructive" }),
  });
}

/** Grants (which unlocks the week) or dismisses an unlock request. */
export function useResolveUnlockRequest(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ requestId, action }: { requestId: number; action: "grant" | "dismiss" }) =>
      send(`/api/leagues/${leagueId}/weeks/${weekId}/unlock-requests/${requestId}`, "POST", { action }),
    onSuccess: (_data, { action }) => {
      invalidateDraftParlayQueries(queryClient, leagueId, weekId);
      toast({ title: action === "grant" ? "Parlay Unlocked" : "Request dismissed" });
    },
    onError: (error: Error) => toast({ title: "Couldn't save", description: error.message, variant: "destructive" }),
  });
}
