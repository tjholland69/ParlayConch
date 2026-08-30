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
