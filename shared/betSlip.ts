/**
 * A locked parlay as plain text, for copying into a sportsbook by hand:
 *
 *   🎟️ The Boys · Week 5 parlay (3 legs)
 *   1. 49ers +6.5 (-110) · Rams @ 49ers
 *   2. Lamar Jackson - Rush Yds O 25 · Ravens @ Bills
 */
import { legLookthroughLabel, withPlusSign } from "./formatPick";

type SlipLeg = Parameters<typeof legLookthroughLabel>[0] & {
  odds?: string | null;
  game?: (NonNullable<Parameters<typeof legLookthroughLabel>[1]> & { awayTeam?: string | null; homeTeam?: string | null }) | null;
};

export function parlaySlipText(input: { leagueName?: string | null; weekLabel?: string | null; legs: SlipLeg[] }): string {
  const count = `${input.legs.length} leg${input.legs.length === 1 ? "" : "s"}`;
  const title = [input.leagueName, `${input.weekLabel ?? "This week's"} parlay (${count})`].filter(Boolean).join(" · ");
  return [
    `🎟️ ${title}`,
    ...input.legs.map((leg, i) => {
      // A game leg's price rides in its line, "-3.5 (-110)"; a prop's is in odds.
      const price = withPlusSign(leg.odds) ?? leg.line?.match(/\(([+-]?\d+)\)/)?.[1] ?? (leg.betType === "moneyline" ? withPlusSign(leg.line) : null);
      const matchup = leg.game?.awayTeam && leg.game?.homeTeam ? ` · ${leg.game.awayTeam} @ ${leg.game.homeTeam}` : "";
      return `${i + 1}. ${legLookthroughLabel(leg, leg.game)}${price ? ` (${price})` : ""}${matchup}`;
    }),
  ].join("\n");
}
