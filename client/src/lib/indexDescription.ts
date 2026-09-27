import { BET_TYPE_OPTIONS } from "./bettingConstants";
import { PLAYER_PROP_TYPES, type CustomIndexFilters, type League } from "@shared/schema";

/**
 * Plain-English version of an index's scope for the dashboard chart's
 * disclaimer, e.g. "Player props only, against George, in Sunday Crew".
 * `memberName` resolves a user id to a display name (falls back to a count
 * when a member can't be resolved).
 */
export function describeCustomIndexInWords(
  filters: CustomIndexFilters | undefined,
  leagues: League[],
  memberName: (userId: string) => string | undefined,
): string {
  const betLabels = (filters?.betTypes ?? []).map(
    (t) => BET_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
  );
  const propLabels = (filters?.propTypes ?? []).map(
    (t) => PLAYER_PROP_TYPES.find((p) => p.value === t)?.label ?? t,
  );
  let betPart = betLabels.length > 0 ? `${betLabels.join(" & ")} bets only` : "All bet types";
  if (betLabels.length === 1 && filters?.betTypes[0] === "player_prop") betPart = "Player props only";
  if (propLabels.length > 0) betPart += ` (${propLabels.join(", ")})`;

  const memberIds = filters?.memberUserIds ?? [];
  const names = memberIds.map(memberName).filter((n): n is string => !!n);
  const memberPart = memberIds.length === 0
    ? "against everyone else"
    : names.length === memberIds.length
      ? `against ${names.join(", ")}`
      : `against ${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`;

  const leagueNames = (filters?.leagueIds ?? [])
    .map((id) => leagues.find((l) => l.id === id)?.name)
    .filter(Boolean);
  const leaguePart = leagueNames.length > 0 ? `in ${leagueNames.join(", ")}` : "across all your leagues";

  return [
    betPart,
    ...(filters?.playerName ? [`on ${filters.playerName}`] : []),
    ...(filters?.teamName ? [`involving ${filters.teamName}`] : []),
    memberPart,
    leaguePart,
  ].join(", ");
}
