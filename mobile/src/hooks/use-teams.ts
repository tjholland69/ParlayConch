import { useQuery } from "@tanstack/react-query";

export interface Team {
  id: number;
  abbreviation: string;
  fullName: string;
  city: string;
  nickname: string;
  conference?: string | null;
  division?: string | null;
  stadiumName?: string | null;
  stadiumType?: string | null;
  isTurf?: boolean | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
}

/** The full NFL team reference table (server/services/../teams) — real
 * ESPN-hosted logo URLs plus stadium/city metadata, seeded once and rarely
 * changing, so a long staleTime avoids re-fetching every screen visit. */
export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ["/api/teams"],
    staleTime: 1000 * 60 * 60,
  });
}
