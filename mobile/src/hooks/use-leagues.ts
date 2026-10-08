import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { LeagueWithMembers, LeagueMemberWithUser, ParlayLegWithParlayContext } from "@shared/schema";

export function useLeagues() {
  return useQuery<LeagueWithMembers[]>({
    queryKey: ["/api/leagues"],
  });
}

/** All-time parlay_leg win rate + total parlays won per league, keyed by leagueId — same data web shows on its Leagues list. */
export function useLeaguesOverviewStats() {
  return useQuery<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number; parlaysWon: number }>>({
    queryKey: ["/api/leagues/overview-stats"],
  });
}

export interface LeagueRecordEntry {
  key: string;
  label: string;
  title?: string | null;
  value: string;
  holderUserId: string | null;
  detail?: string | null;
  winLoss?: { wins: number; losses: number } | null;
  week?: { season: number; weekNumber: number; label: string } | null;
  dateRange?: { start: string; end: string } | null;
  /** parlay_leg ids behind this record — fetch via useParlayLegsByIds to show
   * the "lookthrough" popup. Empty when a record has no leg-level lookthrough. */
  legIds: number[];
  /** "participation" fetches via useMissedWeeks instead — see the matching
   * doc comment in server/services/leagueRecords.ts. */
  lookthroughKind?: "participation";
  /** The signed-in member's own figure for this category; null when they
   * have nothing in it yet. */
  viewerValue?: string | null;
  /** Caption beside viewerValue when it isn't the viewer's own figure (e.g. "2nd Place"). */
  viewerLabel?: string | null;
  /** True when the signed-in member holds this record. */
  viewerIsHolder?: boolean;
}

export type MissedWeek = { weekId: number; season: number; weekNumber: number; label: string };

/** League Records — same "superlatives" tiles as the web app's League
 * Records tab, mirrored here for mobile's Stats tab (see server/services/leagueRecords.ts). */
export function useLeagueRecords(leagueId: number) {
  return useQuery<LeagueRecordEntry[]>({
    queryKey: ["/api/leagues", leagueId, "records"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/records`),
    enabled: !!leagueId,
  });
}

/** "Lookthrough" for a league-record tile — the specific parlay legs behind
 * one superlative. Mirrors the web hook of the same name (client/src/hooks/use-bets.ts). */
export function useParlayLegsByIds(leagueId: number, legIds: number[]) {
  return useQuery<ParlayLegWithParlayContext[]>({
    queryKey: ["/api/leagues", leagueId, "parlay-legs", legIds.join(",")],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/parlay-legs?ids=${legIds.join(",")}`),
    enabled: !!leagueId && legIds.length > 0,
  });
}

/** "Lookthrough" for a participation-rate record (e.g. Weak Link) — the
 * specific weeks the member was eligible for but didn't submit a parlay in.
 * Mirrors the web hook of the same name (client/src/hooks/use-bets.ts). */
export function useMissedWeeks(leagueId: number, userId: string | null) {
  return useQuery<{ weeks: MissedWeek[] }>({
    queryKey: ["/api/leagues", leagueId, "members", userId, "missed-weeks"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/members/${userId}/missed-weeks`),
    enabled: !!leagueId && !!userId,
  });
}

export function useLeagueStats(leagueId: number) {
  return useQuery<import("@shared/schema").UserStat[]>({
    queryKey: ["/api/leagues", leagueId, "stats"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/stats`),
    enabled: !!leagueId,
  });
}

/** League totals plus the standings two ways: this season and all time. */
export function useLeagueDataStats(leagueId: number) {
  return useQuery<import("@shared/schema").LeagueDataStats>({
    queryKey: ["/api/leagues", leagueId, "data-stats"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/data-stats`),
    enabled: !!leagueId,
  });
}

export function useLeagueMembersWithUsers(leagueId: number) {
  return useQuery<LeagueMemberWithUser[]>({
    queryKey: ["/api/leagues", leagueId, "members"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/members`),
    enabled: !!leagueId,
  });
}

export function useWeekLockStatus(leagueId: number, weekId: number) {
  return useQuery<import("@shared/schema").WeekLockStatus>({
    queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/weeks/${weekId}/lock`),
    enabled: !!leagueId && !!weekId,
  });
}

export function useCreateLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiRequest("POST", "/api/leagues", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
  });
}

export function useJoinLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      apiRequest("POST", "/api/leagues/join", { inviteCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
    },
  });
}

export function useLockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hadMissingBets: boolean) =>
      apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/lock`, { hadMissingBets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"] });
    },
  });
}

export function useUnlockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/leagues/${leagueId}/weeks/${weekId}/lock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"] });
    },
  });
}

export type InviteByEmailResult = {
  results: {
    email: string;
    status: "invited" | "added" | "already_member";
    username?: string;
  }[];
};

export function useInviteByEmail(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emails: string[]) =>
      apiRequest<InviteByEmailResult>("POST", `/api/leagues/${leagueId}/invite-by-email`, { emails }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "members"] });
    },
  });
}

function invalidateWeekLock(queryClient: ReturnType<typeof useQueryClient>, leagueId: number, weekId: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "lock"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "parlays"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "weeks", weekId, "my-parlay"] });
}

/** Asks whoever can unlock the week (the Parlay Maestro, or a permitted lieutenant) to do so. */
export function useRequestUnlock(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/unlock-requests`, { reason }),
    onSuccess: () => invalidateWeekLock(queryClient, leagueId, weekId),
  });
}

/** Grants (which unlocks the week) or dismisses an unlock request. */
export function useResolveUnlockRequest(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, action }: { requestId: number; action: "grant" | "dismiss" }) =>
      apiRequest("POST", `/api/leagues/${leagueId}/weeks/${weekId}/unlock-requests/${requestId}`, { action }),
    onSuccess: () => invalidateWeekLock(queryClient, leagueId, weekId),
  });
}

/** Who the caller can pick for in this league ("On Behalf Of"), and who can pick for them. */
export function useOnBehalfInfo(leagueId: number) {
  return useQuery<import("@shared/schema").OnBehalfInfo>({
    queryKey: ["/api/leagues", leagueId, "on-behalf"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/on-behalf`),
    enabled: !!leagueId,
    staleTime: 60_000,
  });
}

/** Approves or rejects a pick that was made on a member's behalf. */
export function useResolveLegApproval(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ legId, action }: { legId: number; action: "approve" | "reject" }) =>
      apiRequest("POST", `/api/parlay-legs/${legId}/approval`, { action }),
    onSuccess: () => invalidateWeekLock(queryClient, leagueId, weekId),
  });
}

/** The reports a league offers (shared/reports.ts). */
export function useLeagueReports(leagueId: number, enabled = true) {
  return useQuery<import("@shared/reports").ReportCatalogEntry[]>({
    queryKey: ["/api/leagues", leagueId, "reports"],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/reports`),
    enabled: !!leagueId && enabled,
    staleTime: 5 * 60_000,
  });
}

/** One report, loaded when it's opened. */
export function useLeagueReport(leagueId: number, reportId: import("@shared/reports").ReportId | null) {
  return useQuery<import("@shared/reports").Report>({
    queryKey: ["/api/leagues", leagueId, "reports", reportId],
    queryFn: async () => apiRequest("GET", `/api/leagues/${leagueId}/reports/${reportId}`),
    enabled: !!leagueId && !!reportId,
  });
}
