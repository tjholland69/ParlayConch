import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface GameWeather {
  tempF: number | null;
  precipChancePct: number | null;
  windMph: number | null;
  conditions: string | null;
  icon: string | null;
}

/** Best-effort kickoff forecast (see server/services/weatherApi.ts) — null
 * for indoor venues, games outside the forecast window, or when XWeather
 * isn't configured. Only worth fetching for games that are still upcoming. */
export function useGameWeather(gameId: number, enabled: boolean) {
  return useQuery<GameWeather | null>({
    queryKey: ["/api/games", gameId, "weather"],
    queryFn: async () => apiRequest("GET", `/api/games/${gameId}/weather`),
    enabled,
    staleTime: 1000 * 60 * 30,
  });
}
