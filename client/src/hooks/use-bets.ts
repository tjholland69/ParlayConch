import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { Week, Game, GameWithBet, UserStat, LeagueWithMembers, ParlayWithLegs, League } from "@shared/schema";

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
