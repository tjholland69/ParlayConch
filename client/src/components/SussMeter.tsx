import { ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { sussLabel, sussLevel, type SussTally } from "@shared/suss";

/**
 * "The Suss Meter": a three-part thermometer beside a pick in an open
 * parlay. Hidden until more than half the league has down-voted the pick,
 * then it fills a third at a time and pulses once everyone but the pick's
 * owner doubts it (shared/suss.ts).
 */
export function SussMeter({ tally, className }: { tally: SussTally | null | undefined; className?: string }) {
  const level = sussLevel(tally);
  if (level === 0) return null;
  const fill = ["", "bg-red-500", "bg-red-500", "bg-red-600"][level];
  return (
    <span
      role="img"
      aria-label={sussLabel(tally)}
      title={sussLabel(tally)}
      className={cn("inline-flex items-center shrink-0", level === 3 && "animate-pulse", className)}
      data-testid="suss-meter"
    >
      {/* The tube: three segments, filled from the bulb end. */}
      <span className="flex items-center h-2.5 rounded-r-full border border-red-500/60 overflow-hidden order-2 -ml-px">
        {[1, 2, 3].map((part) => (
          <span key={part} className={cn("w-2 h-full border-r border-red-500/30 last:border-r-0", part <= level ? fill : "bg-transparent")} />
        ))}
      </span>
      <span className={cn("w-3.5 h-3.5 rounded-full border border-red-500/60 order-1", fill)} />
    </span>
  );
}

/** The anonymous down vote. Never shown on your own pick. */
export function SussVoteButton({
  tally,
  onVote,
  disabled,
  legId,
}: {
  tally: SussTally | null | undefined;
  onVote: (vote: boolean) => void;
  disabled?: boolean;
  legId: number;
}) {
  const mine = !!tally?.mine;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onVote(!mine); }}
      disabled={disabled}
      aria-pressed={mine}
      aria-label={mine ? "Take back your down vote" : "Down-vote this pick (anonymous)"}
      title={mine ? "Take back your down vote" : "Down-vote this pick. Votes are anonymous."}
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0",
        mine ? "text-red-400 bg-red-500/15" : "text-muted-foreground hover:text-red-300 hover:bg-white/10",
      )}
      data-testid={`button-suss-vote-${legId}`}
    >
      <ThumbsDown className="w-3.5 h-3.5" />
    </button>
  );
}
