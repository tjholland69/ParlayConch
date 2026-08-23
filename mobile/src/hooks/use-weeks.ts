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
    queryKey: ["/api/weeks", weekId, "games"],
    queryFn: async () => apiRequest("GET", `/api/weeks/${weekId}/games`),
    enabled: !!weekId,
  });
}

export function useActiveWeek() {
  const { data: weeks } = useWeeks();
  const flagged = weeks?.find((w) => w.isActive);
  if (flagged) return flagged;
  if (!weeks?.length) return null;
  // No week is flagged active — rather than trusting API array order
  // (weeks?.[0], which produced the "wrong current week" bug), fall back to
  // the chronologically latest season/week on record. That's the closer
  // approximation of "current" until an admin flips isActive.
  return [...weeks].sort((a, b) => b.season - a.season || b.weekNumber - a.weekNumber)[0];
}
