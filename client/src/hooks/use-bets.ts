import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { Week, Game, GameWithBet, UserStat, LeagueWithMembers, ParlayWithLegs, ParlayLegWithParlayContext, League, WeekLockStatus, ActiveWeekStatus, LeagueDataStats, PopularPick } from "@shared/schema";

export function useWeeks() {
  return useQuery<Week[]>({
    queryKey: [api.weeks.list.path],
    queryFn: async () => {
      const res = await fetch(api.weeks.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch weeks");
      return res.json();
    },
  });
}

export function useGames(weekId: number) {
  return useQuery<GameWithBet[]>({
    queryKey: [api.games.listByWeek.path, weekId],
    queryFn: async () => {
      const url = buildUrl(api.games.listByWeek.path, { id: weekId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch games");
      return res.json();
    },
    enabled: !!weekId,
  });
}

export function useStats() {
  return useQuery<UserStat[]>({
    queryKey: [api.stats.list.path],
    queryFn: async () => {
      const res = await fetch(api.stats.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });
}

// Leagues
export function useLeagues() {
  return useQuery<LeagueWithMembers[]>({
    queryKey: [api.leagues.list.path],
    queryFn: async () => {
      const res = await fetch(api.leagues.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return res.json();
    },
  });
}

export function useLeaguesOverviewStats() {
  return useQuery<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number }>>({
    queryKey: ['/api/leagues/overview-stats'],
    queryFn: async () => {
      const res = await fetch('/api/leagues/overview-stats', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overview stats");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useLeaguesActiveStatus() {
  return useQuery<Record<number, ActiveWeekStatus>>({
    queryKey: ['/api/leagues/active-week-status'],
    queryFn: async () => {
      const res = await fetch('/api/leagues/active-week-status', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active week status");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useLeagueDataStats(leagueId: number) {
  return useQuery<LeagueDataStats>({
    queryKey: ['/api/leagues', leagueId, 'data-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/data-stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch league data stats");
      return res.json();
    },
    enabled: !!leagueId,
  });
}

export function usePopularPicks(leagueId: number, weekId: number) {
  return useQuery<PopularPick[]>({
    queryKey: ['/api/leagues', leagueId, 'weeks', weekId, 'popular-picks'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${weekId}/popular-picks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch popular picks");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useLeagueStats(leagueId: number) {
  return useQuery<UserStat[]>({
    queryKey: [api.leagues.stats.path, leagueId],
    queryFn: async () => {
      const url = buildUrl(api.leagues.stats.path, { id: leagueId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch league stats");
      return res.json();
    },
    enabled: !!leagueId,
  });
}

export function useCreateLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch(api.leagues.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create league");
      return res.json() as Promise<League>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "League Created!", description: "Share the invite code with friends." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useJoinLeague() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      const res = await fetch(api.leagues.join.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to join league");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "Joined League!", description: "Welcome to the league!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Parlays
export function useMyParlay(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs | null>({
    queryKey: [api.parlays.myForWeek.path, leagueId, weekId],
    queryFn: async () => {
      const url = buildUrl(api.parlays.myForWeek.path, { leagueId, weekId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parlay");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useLeagueParlays(leagueId: number, weekId: number) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: [api.parlays.forWeek.path, leagueId, weekId],
    queryFn: async () => {
      const url = buildUrl(api.parlays.forWeek.path, { leagueId, weekId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch league parlays");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useMyParlayHistory(leagueId?: number) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: [api.parlays.myHistory.path, leagueId],
    queryFn: async () => {
      let url = api.parlays.myHistory.path;
      if (leagueId) url += `?leagueId=${leagueId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parlay history");
      return res.json();
    },
  });
}

export function useMyLegHistory(leagueId?: number) {
  return useQuery<ParlayLegWithParlayContext[]>({
    queryKey: [api.parlayLegs.myHistory.path, leagueId],
    queryFn: async () => {
      let url = api.parlayLegs.myHistory.path;
      if (leagueId) url += `?leagueId=${leagueId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leg history");
      return res.json();
    },
  });
}

type ParlayLegInput = { gameId: number; betType: string; pick: string; line?: string };

export function useCreateParlay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { leagueId: number; weekId: number; legs: ParlayLegInput[] }) => {
      const res = await fetch(api.parlays.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create parlay");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.parlays.myForWeek.path, variables.leagueId, variables.weekId] });
      queryClient.invalidateQueries({ queryKey: [api.parlays.forWeek.path, variables.leagueId, variables.weekId] });
      toast({ title: "Parlay Submitted!", description: "Good luck this week!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useApproveParlay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (parlayId: number) => {
      const url = buildUrl(api.parlays.approve.path, { id: parlayId });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to approve parlay");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("parlays") });
      toast({ title: "Approved!", description: "Parlay has been approved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useRejectParlay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (parlayId: number) => {
      const url = buildUrl(api.parlays.reject.path, { id: parlayId });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to reject parlay");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("parlays") });
      toast({ title: "Rejected", description: "Parlay has been rejected." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useSetUserDemo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (isDemo: boolean) => {
      const res = await fetch("/api/users/me/demo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update demo status");
      return res.json();
    },
    onSuccess: (_, isDemo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: isDemo ? "Account marked as Demo" : "Demo flag removed",
        description: isDemo
          ? "Your account is now flagged as a demo/QA account."
          : "Your account is now flagged as a live account.",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useLeagueMembersWithUsers(leagueId: number) {
  return useQuery({
    queryKey: ['/api/leagues', leagueId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json() as Promise<import('@shared/schema').LeagueMemberWithUser[]>;
    },
    enabled: !!leagueId,
  });
}

export function useUpdateLeagueSettings(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch(`/api/leagues/${leagueId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "League settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useSetMemberRole(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/leagues/${leagueId}/members/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "Role updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useInviteByEmail(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (emails: string[]) => {
      const res = await fetch(`/api/leagues/${leagueId}/invite-by-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json() as Promise<{ results: { email: string; status: "added" | "not_found" | "already_member"; username?: string }[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useLeaveLeague(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/members/me`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      toast({ title: "You've left the league" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useTransferAndLeave(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (newAdminUserId: string) => {
      const res = await fetch(`/api/leagues/${leagueId}/transfer-and-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAdminUserId }),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      toast({ title: "Admin rights transferred. You've left the league." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateLieutenantPermissions(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (permissions: import('@shared/schema').LieutenantPermissions) => {
      const res = await fetch(`/api/leagues/${leagueId}/lieutenant-permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permissions),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "Parlay Lieutenant permissions saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      const res = await fetch("/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useNotifications() {
  return useQuery<import('@shared/schema').Notification[]>({
    queryKey: ['/api/notifications'],
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
  });
}

export function useSendLeagueAnnouncement(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { title: string; message?: string }) => {
      const res = await fetch(`/api/leagues/${leagueId}/notifications/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ title: "Announcement sent to all league members" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateLeagueNotificationSettings(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (settings: import('@shared/schema').LeagueNotificationSettings) => {
      const res = await fetch(`/api/leagues/${leagueId}/notification-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({ title: "Notification settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (prefs: import('@shared/schema').UserNotificationPreferences) => {
      const res = await fetch("/api/users/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Notification preferences saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useSetLeagueDemo(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (isDemo: boolean) => {
      const res = await fetch(`/api/leagues/${leagueId}/demo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update league demo status");
      return res.json();
    },
    onSuccess: (_, isDemo) => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({
        title: isDemo ? "League marked as Demo" : "League demo flag removed",
        description: isDemo
          ? "This league is now flagged as demo/QA data."
          : "This league is now flagged as live data.",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useSetLeagueDemoWeekData(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (useDemoWeekData: boolean) => {
      const res = await fetch(`/api/leagues/${leagueId}/demo-week-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDemoWeekData }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update setting" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_, useDemoWeekData) => {
      queryClient.invalidateQueries({ queryKey: [api.leagues.list.path] });
      toast({
        title: useDemoWeekData ? "Dummy week data enabled" : "Dummy week data disabled",
        description: useDemoWeekData
          ? "Picks screens will use Week 14 (2024) sample data."
          : "Picks screens will use live data.",
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// Parlay week locking
export function useWeekLockStatus(leagueId: number, weekId: number) {
  return useQuery<WeekLockStatus>({
    queryKey: ['/api/leagues', leagueId, 'weeks', weekId, 'lock'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${weekId}/lock`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lock status");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useLockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (hadMissingBets: boolean) => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${weekId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hadMissingBets }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to lock parlay");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'weeks', weekId, 'lock'] });
      toast({ title: "Parlay Locked", description: "No further submissions or edits are allowed for this week." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUnlockWeekParlay(leagueId: number, weekId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${weekId}/lock`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to unlock parlay");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'weeks', weekId, 'lock'] });
      toast({ title: "Parlay Unlocked", description: "Submissions are now open again for this week." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

// ===== DEMO DATA EDITOR HOOKS =====

export function useAllLeagueParlays(leagueId: number, enabled = true) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: ['/api/leagues', leagueId, 'parlays', 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/parlays/all`, { credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    enabled: !!leagueId && enabled,
  });
}

// Member-facing read-only view of all parlays (no demo/admin gating), used by the
// League Detail "All Parlays" tab. Distinct query key from useAllLeagueParlays so
// admin-editor mutations don't invalidate/collide with this cache.
export function useAllLeagueParlaysReadOnly(leagueId: number, enabled = true) {
  return useQuery<ParlayWithLegs[]>({
    queryKey: ['/api/leagues', leagueId, 'parlays'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/parlays`, { credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    enabled: !!leagueId && enabled,
  });
}

export function useDeleteParlay(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (parlayId: number) => {
      const res = await fetch(`/api/parlays/${parlayId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Parlay Deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteParlayLeg(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (legId: number) => {
      const res = await fetch(`/api/parlay-legs/${legId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Leg Removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateParlayLeg(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ legId, updates }: { legId: number; updates: Record<string, any> }) => {
      const res = await fetch(`/api/parlay-legs/${legId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Leg Updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useBulkUpdateParlayLegs(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ legIds, field, value }: { legIds: number[]; field: string; value: string | null }) => {
      const res = await fetch(`/api/leagues/${leagueId}/parlay-legs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legIds, field, value }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Legs Updated", description: `${variables.legIds.length} leg(s) updated.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export type EnrichLog = { at: string; changes: string[]; warnings: string[]; errors: string[] };

export function useEnrichParlayLeg(leagueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (legId: number): Promise<EnrichLog> => {
      const res = await fetch(`/api/parlay-legs/${legId}/enrich`, { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? "Enrichment failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
    },
  });
}

export function useUpdateParlayStatus(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ parlayId, status }: { parlayId: number; status: string }) => {
      const res = await fetch(`/api/parlays/${parlayId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Status Updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useAddHistoricalParlay(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ userId, weekId, legs }: { userId: string; weekId: number; legs: Record<string, any>[] }) => {
      const res = await fetch(`/api/leagues/${leagueId}/parlays/historical`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, weekId, legs }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Parlay Added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useSplitParlayLegs(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ parlayId, legIds }: { parlayId: number; legIds: number[] }) => {
      const res = await fetch(`/api/leagues/${leagueId}/parlays/${parlayId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legIds }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json() as Promise<{ message: string; newParlayId: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Legs Split", description: data.message });
    },
    onError: (e: Error) => toast({ title: "Split failed", description: e.message, variant: "destructive" }),
  });
}

export function useAddParlayLeg(leagueId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ parlayId, leg }: { parlayId: number; leg: Record<string, any> }) => {
      const res = await fetch(`/api/parlays/${parlayId}/legs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leg),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] });
      toast({ title: "Leg Added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}
