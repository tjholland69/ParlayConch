/**
 * The two-slide "story" both parlay reports are shown as: a lead slide naming
 * one member, then a list of members and their bets. The Shame Report (a
 * lost parlay) and The Locks Report (a won one) each map onto this, so web
 * and mobile draw both with one component apiece.
 */
import { buildShameReport, shameEmoji, shamePendingLine, shameReportText, type ShameReport } from "./shameReport";
import { buildLocksReport, locksPushLine, locksReportText, type LocksReport } from "./locksReport";
import { heroLabelText, loserLabelText } from "./leagueLabels";

export type ParlayStory = {
  kind: "shame" | "locks";
  weekLabel: string;
  /** "Shame Report" / "The Locks Report". */
  title: string;
  emoji: string;
  /** Slide 1: the league's label, the member, and what they did it with. */
  leadLabel: string;
  leadName: string;
  leadCaption: string;
  leadPick: string;
  /** Slide 2. */
  listTitle: string;
  rows: { legId: number; name: string; pick: string; highlight: boolean }[];
  footnote: string | null;
  /** The group-chat version. */
  text: string;
};

export function shameStory(report: ShameReport): ParlayStory {
  return {
    kind: "shame",
    weekLabel: report.weekLabel,
    title: "Shame Report",
    emoji: shameEmoji(report),
    leadLabel: report.loserLabel,
    leadName: report.loserName,
    leadCaption: "ruined it with",
    leadPick: report.loserPick,
    listTitle: "The Losing Bets",
    rows: report.losers.map((l) => ({ legId: l.legId, name: l.name, pick: l.pick, highlight: l.isParlayLoser })),
    footnote: shamePendingLine(report.pendingCount),
    text: shameReportText(report),
  };
}

export function locksStory(report: LocksReport): ParlayStory {
  return {
    kind: "locks",
    weekLabel: report.weekLabel,
    title: "The Locks Report",
    emoji: "🔒",
    leadLabel: report.heroLabel,
    leadName: report.heroName,
    leadCaption: "brought it home with",
    leadPick: report.heroPick,
    listTitle: "The Locks",
    rows: report.locks.map((l) => ({ legId: l.legId, name: l.name, pick: l.pick, highlight: l.isHero })),
    footnote: locksPushLine(report.pushCount),
    text: locksReportText(report),
  };
}

type StoryLeg = Parameters<typeof buildShameReport>[0]["legs"][number];

/**
 * The story for a settled parlay: the Shame Report when `bustedLegId` is
 * given (it lost), The Locks Report when `heroLegId` is (it won). Null for a
 * parlay that has neither. `loserLabel`/`heroLabel` are the league's keys.
 */
export function buildParlayStory<L extends StoryLeg>(input: {
  legs: L[];
  weekLabel: string;
  nameOf: (leg: L) => string;
  bustedLegId?: number | null;
  heroLegId?: number | null;
  loserLabel?: string | null;
  heroLabel?: string | null;
  shameEmoji?: string | null;
}): ParlayStory | null {
  if (input.bustedLegId != null) {
    const report = buildShameReport({
      legs: input.legs,
      bustedLegId: input.bustedLegId,
      nameOf: input.nameOf,
      weekLabel: input.weekLabel,
      loserLabel: loserLabelText(input.loserLabel),
      emoji: input.shameEmoji,
    });
    return report && shameStory(report);
  }
  if (input.heroLegId != null) {
    const report = buildLocksReport({
      legs: input.legs,
      heroLegId: input.heroLegId,
      nameOf: input.nameOf,
      weekLabel: input.weekLabel,
      heroLabel: heroLabelText(input.heroLabel),
    });
    return report && locksStory(report);
  }
  return null;
}
