import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ActiveWeekStatus, MemberWeekParlay, ParlayWithLegs, ParlayLegDispute, ParlayLegWithParlayContext } from "@shared/schema";

/** In On Behalf Of mode the parlay is cached as `onBehalfOf` sees it, under
 * its own key, so switching who you're picking for never mixes the two. */
export const myParlayKey = (leagueId: number, weekId: number, onBehalfOf?: string) => [
  "/api/leagues", leagueId, "weeks", weekId, "my-parlay", ...(onBehalfOf ? [onBehalfOf] : []),
];
const onBehalfQuery = (onBehalfOf?: string) => (onBehalfOf ? `?onBehalfOf=${encodeURIComponent(onBehalfOf)}` : "");

/** Everything that shows who's in this week's parlay; refreshed after any pick changes. */
function invalidateWeekPickQueries(queryClient: ReturnType<typeof useQueryClient>, leagueId: number, weekId: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues/active-week-status"] });
  queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
}

/** Where each of the caller's leagues stands for the active week: whether a
 * parlay is open, how many legs are in, and whether they still owe a pick. */
export function useActiveWeekStatus() {
  return useQuery<Record<number, ActiveWeekStatus>>({
    queryKey: ["/api/leagues/active-week-status"],
    queryFn: async () => apiRequest("GET", "/api/leagues/active-week-status"),
    staleTime: 15_000,
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

/** Cross-league "my own legs" lookthrough — for Dashboard stat tiles that
 * aggregate across every league (mirrors the web app's useMyParlayLegsByIds). */
export function useMyParlayLegsByIds(legIds: number[]) {
  return useQuery<ParlayLegWithParlayContext[]>({
    queryKey: ["/api/parlay-legs/my/by-ids", legIds.join(",")],
    queryFn: async () => apiRequest("GET", `/api/parlay-legs/my/by-ids?ids=${legIds.join(",")}`),
    enabled: legIds.length > 0,
  });
}

/**
 * The league's parlay for the week as the caller sees it: one shared parlay
 * holding every member's pick, plus the picks others have taken in it (see
 * shared/weekParlays.ts). `live` keeps it fresh while it's on screen, so
 * another member's pick shows up without leaving the page. It re-checks
 * every 8 seconds for now; the aim is to push changes as they happen, the
 * way web does over its WebSocket (client/src/hooks/use-realtime-sync.ts).
 */
export function useMyParlay(leagueId: number, weekId: number, opts: { live?: boolean; onBehalfOf?: string } = {}) {
  return useQuery<MemberWeekParlay | null>({
    queryKey: myParlayKey(leagueId, weekId, opts.onBehalfOf),
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/my-parlay${onBehalfQuery(opts.onBehalfOf)}`),
    enabled: !!leagueId && !!weekId,
    ...(opts.live ? { staleTime: 0, refetchOnMount: "always" as const, refetchInterval: 8_000 } : {}),
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

export type PickInput = {
  gameId: number;
  betType: string;
  pick: string;
  line?: string;
  playerName?: string;
  propType?: string;
  /** Start another parlay instead of joining the open one. */
  startNew?: boolean;
};

/**
 * Saves the caller's ONE pick in the league's open parlay for the week. A
 * new pick replaces their earlier one in a single request, so there's no
 * remove-then-add for a second tap to land between. The response is the
 * whole parlay as it now stands, which replaces the cached copy.
 */
export function useSetPick(leagueId: number, weekId: number, onBehalfOf?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pick: PickInput) =>
      apiRequest<MemberWeekParlay>(
        "POST",
        `/api/leagues/${leagueId}/weeks/${weekId}/draft-parlay/legs`,
        onBehalfOf ? { ...pick, onBehalfOfUserId: onBehalfOf } : pick,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(myParlayKey(leagueId, weekId, onBehalfOf), data);
      invalidateWeekPickQueries(queryClient, leagueId, weekId);
    },
    // A refused pick usually means another member got there first: reload
    // the parlay so the screen shows why.
    onError: () => queryClient.invalidateQueries({ queryKey: myParlayKey(leagueId, weekId) }),
  });
}

/** Removes a pick from an open parlay: the caller's own, or one they made
 * on a member's behalf (the server refuses anyone else's). */
export function useRemovePick(leagueId: number, weekId: number, onBehalfOf?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parlayId, legId }: { parlayId: number; legId: number }) =>
      apiRequest<{ parlay: MemberWeekParlay | null }>("DELETE", `/api/parlays/${parlayId}/legs/${legId}${onBehalfQuery(onBehalfOf)}`),
    onSuccess: (data) => {
      queryClient.setQueryData(myParlayKey(leagueId, weekId, onBehalfOf), data.parlay ?? null);
      invalidateWeekPickQueries(queryClient, leagueId, weekId);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: myParlayKey(leagueId, weekId) }),
  });
}

/** Discards a whole open or pending parlay. Only whoever started it (while
 * no one else has a pick in it) or the Parlay Maestro can. */
export function useCancelParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parlayId: number) => apiRequest<{ success: boolean }>("DELETE", `/api/parlays/${parlayId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myParlayKey(leagueId, weekId) });
      invalidateWeekPickQueries(queryClient, leagueId, weekId);
    },
  });
}

/** Sets or clears (null) a parlay's sportsbook promo boost. Works at any
 * status, so a boost can be recorded after the bet is live. */
export function useSetParlayBoost(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parlayId, boostPct }: { parlayId: number; boostPct: number | null }) =>
      apiRequest("PUT", `/api/parlays/${parlayId}/boost`, { boostPct }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parlays/my"] });
    },
  });
}

/** Submits the open parlay once the league's minimum number of picks are
 * in, flipping it to 'pending'. `boostPct` is the answer to the boost prompt
 * (null = none). */
export function useSubmitDraftParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parlayId, boostPct }: { parlayId: number; boostPct?: number | null }) =>
      apiRequest<ParlayWithLegs>("POST", `/api/parlays/${parlayId}/submit`, boostPct !== undefined ? { boostPct } : undefined),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: myParlayKey(leagueId, weekId) });
      invalidateWeekPickQueries(queryClient, leagueId, weekId);
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
/** `enabled` keeps a list of legs from each asking for its disputes: only
 * the leg whose dispute sheet is open does. */
export function useLegDisputes(legId: number, enabled = true) {
  return useQuery<ParlayLegDispute[]>({
    queryKey: ["/api/parlay-legs", legId, "disputes"],
    queryFn: async () => apiRequest("GET", `/api/parlay-legs/${legId}/disputes`),
    enabled: !!legId && enabled,
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
