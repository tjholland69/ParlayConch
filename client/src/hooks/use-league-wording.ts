import { useCallback } from "react";
import { subcommitteeWording } from "@shared/subcommittee";
import { useLeagues } from "@/hooks/use-bets";

/**
 * Rewords league text for a subcommittee ("Parlay Maestro" becomes
 * "Frondeur"), for components that only know the league's id. Returns the
 * text unchanged in an ordinary league.
 */
export function useLeagueWording(leagueId: number | undefined) {
  const { data: leagues } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);
  return useCallback((text: string) => subcommitteeWording(text, league), [league?.parentLeagueId]);
}
