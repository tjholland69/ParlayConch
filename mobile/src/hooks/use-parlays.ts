import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ParlayWithLegs, ParlayLegDispute, TakenPick } from "@shared/schema";

/** Every pick a DIFFERENT league member has already locked in (submitted)
 * for this week — used to gray out taken markets and to detect a same-game
 * moneyline+spread combo before it's added. See server's getTakenPicksForWeek. */
export function useTakenPicks(leagueId: number, weekId: number) {
  return useQuery<TakenPick[]>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "taken-picks"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/taken-picks`),
    enabled: !!leagueId && !!weekId,
  });
}

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

/** The current user's parlays across every league, newest week first.
 * `weekIds` bounds the request to a specific set of weeks — pass the active
 * week plus however many completed weeks have been "revealed" so far rather
 * than fetching the user's entire season history at once. Omitting it fetches
 * everything (used by admin/demo tooling that genuinely needs full history). */
export function useMyParlayHistory(weekIds?: number[]) {
  const key = weekIds && weekIds.length > 0 ? [...weekIds].sort((a, b) => a - b).join(",") : undefined;
  return useQuery<ParlayWithLegs[]>({
    queryKey: ["/api/parlays/my", key ?? "all"],
    queryFn: async () => apiRequest("GET", key ? `/api/parlays/my?weekIds=${key}` : "/api/parlays/my"),
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

/** Every league member's parlays (open and closed) across a bounded set of
 * weeks — e.g. "this season + last season" — rather than one week at a time.
 * `weekIds` is required and expected to already be a reasonably small,
 * pre-computed scope: the server treats a weekIds-scoped request as
 * unbounded (no limit/offset truncation). */
export function useAllLeagueParlaysForWeeks(leagueId: number, weekIds: number[]) {
  const key = weekIds.length > 0 ? [...weekIds].sort((a, b) => a - b).join(",") : undefined;
  return useQuery<{ items: ParlayWithLegs[]; total: number }>({
    queryKey: ["/api/leagues", leagueId, "parlays", "weekIds", key ?? "none"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/parlays?weekIds=${key}`),
    enabled: !!leagueId && !!key,
  });
}

export function useCreateParlay(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { weekId: number; legs: { gameId: number; betType: string; pick: string; line?: string }[] }) =>
      apiRequest("POST", `/api/parlays`, { leagueId, weekId: data.weekId, legs: data.legs }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", vars.weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
    },
  });
}

/** Open/resolved/dismissed disputes filed against one leg — a member can only see their own. */
export function useLegDisputes(legId: number) {
  return useQuery<ParlayLegDispute[]>({
    queryKey: ["/api/parlay-legs", legId, "disputes"],
    queryFn: async () => apiRequest("GET", `/api/parlay-legs/${legId}/disputes`),
    enabled: !!legId,
  });
}

/**
 * Files a dispute on one of the caller's own legs. Mobile only supports the
 * "result is wrong" reason — "entered incorrectly" requires a screenshot
 * upload, which needs camera/photo-library access mobile doesn't have wired
 * up yet (see web's DisputeLegDialog for that flow).
 */
export function useFileDispute(legId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (justification: string) =>
      apiRequest<ParlayLegDispute>("POST", `/api/parlay-legs/${legId}/disputes`, {
        reasonType: "result_wrong",
        justification,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parlay-legs", legId, "disputes"] });
    },
  });
}
