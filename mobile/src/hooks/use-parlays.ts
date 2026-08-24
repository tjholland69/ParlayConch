import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ParlayWithLegs } from "@shared/schema";

/**
 * Paginated league-wide parlays (`GET /api/leagues/:id/parlays?limit=&offset=`).
 * Mobile has no All Parlays UI yet; when that ships, pass `{ limit, offset }` (or
 * follow `hasMore`) instead of fetching uncapped. Prefer `all=1` only for admin tools.
 */
export type LeagueParlaysPageParams = {
  limit?: number;
  offset?: number;
  all?: boolean;
};

export function buildLeagueParlaysQuery(params?: LeagueParlaysPageParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.all) qs.set("all", "1");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** All of the current user's parlays across every league/week, newest week first. */
export function useMyParlayHistory() {
  return useQuery<ParlayWithLegs[]>({
    queryKey: ["/api/parlays/my"],
  });
}

export function useMyParlay(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs | null>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/my-parlay`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useLeagueParlays(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/parlays`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useCreateParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { weekId: number; legs: { gameId: number; betType: string; pick: string; line?: string }[] }) =>
      apiRequest("POST", `/api/parlays`, { leagueId, weekId: data.weekId, legs: data.legs }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", vars.weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", vars.weekId, "my-parlay"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", vars.weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/active-week-status"] });
    },
  });
}

/**
 * Adds ONE leg to (or starts) the caller's in-progress draft parlay for a
 * league/week — the "queue" flow: tap a pick, it's added and persisted
 * immediately, rather than batch-selecting several legs before one submit.
 * Unlike `useCreateParlay`, a draft may sit below the league's
 * `minLegsPerParlay` until `useSubmitDraftParlay` is called.
 */
export function useAddDraftLeg(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leg: { gameId: number; betType: string; pick: string; line?: string }) =>
      apiRequest<ParlayWithLegs>("POST", `/api/leagues/${leagueId}/weeks/${weekId}/draft-parlay/legs`, leg),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "weeks", weekId, "my-parlay"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
    },
  });
}

/** Removes one leg from the caller's own draft parlay (draft-only — see server route). */
export function useRemoveDraftLeg(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parlayId, legId }: { parlayId: number; legId: number }) =>
      apiRequest<{ parlay: ParlayWithLegs | null }>("DELETE", `/api/parlays/${parlayId}/legs/${legId}`),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "weeks", weekId, "my-parlay"], data.parlay ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
    },
  });
}

/** Finalizes a draft parlay — enforces minLegsPerParlay and flips it to 'pending'. */
export function useSubmitDraftParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) => apiRequest<ParlayWithLegs>("POST", `/api/parlays/${parlayId}/submit`),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/leagues", leagueId, "weeks", weekId, "my-parlay"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/active-week-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
    },
  });
}

export function useApproveParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) =>
      apiRequest("POST", `/api/parlays/${parlayId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
    },
  });
}

export function useRejectParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) =>
      apiRequest("POST", `/api/parlays/${parlayId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
    },
  });
}
