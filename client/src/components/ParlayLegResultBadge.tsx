import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { resolveResultDetail } from "@shared/legJustification";
import type { Game, ParlayLeg } from "@shared/schema";
import { resultColor } from "@/lib/parlayStatusStyles";
import { cn } from "@/lib/utils";

interface ParlayLegResultBadgeProps {
  leg: Pick<ParlayLeg, "result" | "resultDetail" | "betType" | "pick" | "line">;
  game?: Game | null;
  className?: string;
}

/** Renders a leg's Win/Loss/Push result, hoverable to reveal why it won/lost. */
export function ParlayLegResultBadge({ leg, game, className }: ParlayLegResultBadgeProps) {
  if (!leg.result) {
    return <span className={cn(className, resultColor(leg.result))}>—</span>;
  }

  const detail = resolveResultDetail(leg, game ?? null);
  const label = leg.result.charAt(0).toUpperCase() + leg.result.slice(1);

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            className,
            resultColor(leg.result),
            "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
          )}
        >
          {label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto max-w-xs text-xs">{detail}</HoverCardContent>
    </HoverCard>
  );
}
