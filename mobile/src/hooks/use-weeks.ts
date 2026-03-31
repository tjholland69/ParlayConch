import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Week, GameWithBet } from "@shared/schema";

export function useWeeks() {
  return useQuery<Week[]>({
    queryKey: ["/api/weeks"],
  });
}

export function useGames(weekId: number) {
  return useQuery<GameWithBet[]>({
    queryKey: ["/api/games", weekId],
    queryFn: async () => apiRequest("GET", `/api/games?weekId=${weekId}`),
    enabled: !!weekId,
  });
}

export function useActiveWeek() {
  const { data: weeks } = useWeeks();
  return weeks?.find((w) => w.isActive) ?? weeks?.[0] ?? null;
}
