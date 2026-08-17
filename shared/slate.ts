export const SLATE_NAMES = ["Morning", "Early Slate", "Afternoon Slate", "Primetime"] as const;

export type SlateName = (typeof SLATE_NAMES)[number];

/**
 * NFL broadcast-slate bucket for a kickoff time, evaluated in US Eastern time
 * (the timezone the slates are defined against, regardless of server/client TZ).
 */
export function getSlate(date: Date | string): SlateName {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  const minutesSinceMidnight = hour * 60 + minute;

  if (minutesSinceMidnight < 12 * 60) return "Morning";
  if (minutesSinceMidnight < 16 * 60) return "Early Slate";
  if (minutesSinceMidnight < 18 * 60 + 30) return "Afternoon Slate";
  return "Primetime";
}
