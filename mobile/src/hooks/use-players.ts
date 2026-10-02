import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Player } from "@shared/schema";

/** Player type-ahead for entering a Player Prop, backed by GET /api/players.
 * The search only covers the two teams playing `gameId`, so with nothing
 * typed it still returns that game's players (quarterbacks, backs and
 * receivers first). Mirrors web's useGamePlayerSearch (client/src/hooks/use-bets.ts). */
export function useGamePlayerSearch(gameId: number, query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery<Player[]>({
    queryKey: ["/api/players", trimmed, { gameId }],
    queryFn: () => apiRequest<Player[]>("GET", `/api/players?q=${encodeURIComponent(trimmed)}&gameId=${gameId}`),
    enabled: enabled && !!gameId,
    // Keep the last results up while the next keystroke's load, so the list
    // doesn't blink to a spinner on every letter.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
