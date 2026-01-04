import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertBet } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useWeeks() {
  return useQuery({
    queryKey: [api.weeks.list.path],
    queryFn: async () => {
      const res = await fetch(api.weeks.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch weeks");
      return api.weeks.list.responses[200].parse(await res.json());
    },
  });
}

export function useWeek(id: number) {
  return useQuery({
    queryKey: [api.weeks.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.weeks.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch week");
      return api.weeks.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useGames(weekId: number) {
  return useQuery({
    queryKey: [api.games.listByWeek.path, weekId],
    queryFn: async () => {
      const url = buildUrl(api.games.listByWeek.path, { id: weekId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch games");
      return api.games.listByWeek.responses[200].parse(await res.json());
    },
    enabled: !!weekId,
  });
}

export function useCreateBet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertBet) => {
      // Validate with schema first
      const validated = api.bets.create.input.parse(data);
      
      const res = await fetch(api.bets.create.path, {
        method: api.bets.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error("Please login to place bets");
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Invalid bet");
        }
        throw new Error("Failed to place bet");
      }
      
      return api.bets.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate the games list for this week to refresh the UI state
      // We need to find queries that match the games list pattern
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === api.games.listByWeek.path
      });
      
      toast({
        title: "Bet Placed!",
        description: `You picked ${variables.pick === 'home' ? 'Home' : 'Away'} Team. Good luck!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useBetHistory() {
  return useQuery({
    queryKey: [api.bets.history.path],
    queryFn: async () => {
      const res = await fetch(api.bets.history.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return api.bets.history.responses[200].parse(await res.json());
    },
  });
}

export function useStats() {
  return useQuery({
    queryKey: [api.stats.list.path],
    queryFn: async () => {
      const res = await fetch(api.stats.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return api.stats.list.responses[200].parse(await res.json());
    },
  });
}
