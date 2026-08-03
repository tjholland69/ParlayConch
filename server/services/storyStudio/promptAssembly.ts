import type { AnalyticsReport, StoryCandidate, StorySectionKind } from "@shared/schema";

// Builds the LLM prompt for one section at a time (RFC-001 §8, §11). Every
// fact quoted here comes from AnalyticsReport/StoryCandidate — this is the
// only place a prompt is assembled, and it never touches the database.

export const PROMPT_VERSION = "story-studio-v1";

export type ToneOption = "hype" | "analytical" | "snarky" | "straightforward";

export interface SectionPromptContext {
  report: AnalyticsReport;
  candidate: StoryCandidate;
  thesis: string;
  tone: ToneOption;
}

const TONE_INSTRUCTIONS: Record<ToneOption, string> = {
  hype: "Write with high energy, like a hype-man announcer. Short punchy sentences are welcome.",
  analytical: "Write like a measured sports analyst. Favor precision and restraint over flourish.",
  snarky: "Write with a dry, needling wit aimed affectionately at the league's members.",
  straightforward: "Write plainly and clearly, like a factual weekly recap. No embellishment.",
};

function dataBlock(ctx: SectionPromptContext): string {
  const { report, candidate } = ctx;
  const standingsLines = report.standings
    .filter((s) => s.winRate !== null)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))
    .map((s) => `  ${s.displayName}: ${s.wins}W-${s.losses}L (${s.winRate?.toFixed(0)}%)${s.currentStreak ? ` — ${s.currentStreak.length}-week ${s.currentStreak.kind} streak` : ""}`)
    .join("\n");

  return `LEAGUE: ${report.leagueName}, ${report.weekLabel}
League win rate: ${report.leagueWinRate?.toFixed(0) ?? "N/A"}% (${report.totalLegsDecided} decided legs)
Favorite pick rate: ${report.favoritePickRate?.toFixed(0) ?? "N/A"}% (trailing avg ${report.trailingFavoritePickRate?.toFixed(0) ?? "N/A"}%)

Standings:
${standingsLines || "  No decided legs yet"}

SELECTED STORY: ${candidate.title}
${candidate.summary}
Evidence:
${candidate.supportingEvidence.map((e) => `  - ${e}`).join("\n")}`;
}

const SECTION_INSTRUCTIONS: Record<StorySectionKind, string> = {
  headline: "Write ONE punchy headline (under 12 words) for this story. No quotes, no period at the end.",
  opening: "Write a 2-3 sentence opening paragraph that hooks the reader and previews the story's angle.",
  winnerSummary: "Write a 2-4 sentence paragraph highlighting the week's best performer and why they stood out, grounded only in the standings data given.",
  closing: "Write a 1-2 sentence closing line that wraps up the story and teases next week.",
};

export function buildSectionPrompt(kind: StorySectionKind, ctx: SectionPromptContext): string {
  return `You are a sharp sports editorial writer helping a user draft one section of a weekly fantasy-betting-league recap called "${ctx.thesis}".

Tone: ${TONE_INSTRUCTIONS[ctx.tone]}

${SECTION_INSTRUCTIONS[kind]}

Only use the facts given below — never invent statistics, names, or events not present in this data.

${dataBlock(ctx)}

Write ONLY the section text. No headers, no markdown, no explanation of what you're doing.`;
}
