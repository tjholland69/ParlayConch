import type { AnalyticsReport, StoryCandidate } from "@shared/schema";

// Pure, deterministic heuristics over an AnalyticsReport — no AI involved.
// Each candidate's `confidence` is a documented formula, not a fabricated
// number: it's a normalized distance from a neutral baseline, bucketed to a
// percentage. Candidates below a minimum confidence are simply omitted.

const MIN_CONFIDENCE = 40;

/** Maps an absolute z-score-style deviation to a 0-100 confidence, capping at 99. */
function confidenceFromDeviation(deviation: number, scale: number): number {
  const pct = Math.min(99, Math.round((deviation / scale) * 100));
  return Math.max(0, pct);
}

function underdogSurgeCandidate(report: AnalyticsReport): StoryCandidate | null {
  if (report.underdogPickRate == null || report.trailingFavoritePickRate == null) return null;
  const trailingUnderdogRate = 100 - report.trailingFavoritePickRate;
  const deviation = report.underdogPickRate - trailingUnderdogRate;
  if (deviation <= 0) return null;

  const confidence = confidenceFromDeviation(deviation, 30);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    id: "underdog-surge",
    title: "Underdogs Dominate the Week",
    summary: `The league picked underdogs at ${report.underdogPickRate.toFixed(0)}% this week, up from a trailing average of ${trailingUnderdogRate.toFixed(0)}%.`,
    supportingEvidence: [
      `Underdog pick rate: ${report.underdogPickRate.toFixed(0)}% (trailing avg ${trailingUnderdogRate.toFixed(0)}%)`,
      `${report.totalLegsDecided} decided legs this week`,
    ],
    confidence,
  };
}

function chalkWeekCandidate(report: AnalyticsReport): StoryCandidate | null {
  if (report.favoritePickRate == null || report.trailingFavoritePickRate == null) return null;
  const deviation = report.favoritePickRate - report.trailingFavoritePickRate;
  if (deviation <= 0) return null;

  const confidence = confidenceFromDeviation(deviation, 30);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    id: "chalk-week",
    title: "The League Played It Safe",
    summary: `Favorites were the pick of choice at ${report.favoritePickRate.toFixed(0)}%, well above the usual ${report.trailingFavoritePickRate.toFixed(0)}%.`,
    supportingEvidence: [
      `Favorite pick rate: ${report.favoritePickRate.toFixed(0)}% (trailing avg ${report.trailingFavoritePickRate.toFixed(0)}%)`,
    ],
    confidence,
  };
}

function hotStreakCandidate(report: AnalyticsReport): StoryCandidate | null {
  const streaking = report.standings
    .filter((s) => s.currentStreak && s.currentStreak.kind === "win" && s.currentStreak.length >= 3)
    .sort((a, b) => (b.currentStreak?.length ?? 0) - (a.currentStreak?.length ?? 0));
  const leader = streaking[0];
  if (!leader || !leader.currentStreak) return null;

  const confidence = confidenceFromDeviation(leader.currentStreak.length, 6);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    id: "hot-streak",
    title: `${leader.displayName} Is On Fire`,
    summary: `${leader.displayName} is riding a ${leader.currentStreak.length}-week win streak.`,
    supportingEvidence: [`${leader.currentStreak.length} consecutive winning weeks`],
    confidence,
  };
}

function closeStandingsCandidate(report: AnalyticsReport): StoryCandidate | null {
  const { bestPerformer, worstPerformer } = report;
  if (!bestPerformer || !worstPerformer || bestPerformer.userId === worstPerformer.userId) return null;
  if (bestPerformer.winRate == null || worstPerformer.winRate == null) return null;

  const gap = bestPerformer.winRate - worstPerformer.winRate;
  if (gap > 40) return null; // wide gap isn't a "close race" story
  const confidence = confidenceFromDeviation(40 - gap, 40);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    id: "close-standings",
    title: "A Tight Race at the Top",
    summary: `Only ${gap.toFixed(0)} points separate ${bestPerformer.displayName} from ${worstPerformer.displayName} this week.`,
    supportingEvidence: [
      `${bestPerformer.displayName}: ${bestPerformer.winRate.toFixed(0)}% win rate`,
      `${worstPerformer.displayName}: ${worstPerformer.winRate.toFixed(0)}% win rate`,
    ],
    confidence,
  };
}

export function discoverStories(report: AnalyticsReport): StoryCandidate[] {
  const candidates = [
    underdogSurgeCandidate(report),
    chalkWeekCandidate(report),
    hotStreakCandidate(report),
    closeStandingsCandidate(report),
  ].filter((c): c is StoryCandidate => c !== null);

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
