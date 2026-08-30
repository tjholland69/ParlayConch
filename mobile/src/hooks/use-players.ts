import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Player } from "@shared/schema";

/** Player-name type-ahead for entering a Player Prop — mirrors web's
 * usePlayerSearch (client/src/hooks/use-bets.ts), backed by the same
 * GET /api/players?q= endpoint (ilike search over the global players table). */
export function usePlayerSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<Player[]>({
    queryKey: ["/api/players", trimmed],
    queryFn: () => apiRequest<Player[]>("GET", `/api/players?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
  });
}
