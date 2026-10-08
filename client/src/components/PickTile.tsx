import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PickTile({
  label,
  subLabel,
  hasOdds,
  isPast,
  isSelected,
  takenBy,
  voided = false,
  voidedByMe = false,
  capReached,
  onClick,
  testId,
}: {
  label: string;
  subLabel?: string | null;
  hasOdds: boolean;
  isPast: boolean;
  isSelected: boolean;
  /** The member who has this market in the parlay, when it isn't the viewer. */
  takenBy?: { web: string; mobile: string } | null;
  /** That member picked the other side of this market, so this side is out:
   * "Voided by" rather than "Taken by". */
  voided?: boolean;
  /** The viewer picked the other side of this market. The tile stays
   * tappable (tapping it switches sides), it's just marked as the side
   * their pick rules out. */
  voidedByMe?: boolean;
  capReached: boolean;
  onClick: () => void;
  testId: string;
}) {
  const isTaken = !!takenBy;
  const caption = voided ? "Voided by" : "Taken by";
  // A pick on a game that has since started stays clickable, so it can be removed.
  const disabled = isSelected ? false : isPast || !hasOdds || isTaken || capReached;
  return (
    <Button
      size="sm"
      variant={isSelected ? "default" : "outline"}
      className={cn(
        "relative h-14 min-h-14 py-1.5 flex flex-col items-center justify-center gap-0.5 text-xs leading-tight",
        isTaken && !isSelected && "opacity-40"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {/* A check on the side that was picked, an x on the side that pick ruled out. */}
      {(isSelected || isTaken || voidedByMe) && (
        <span className="absolute right-1 top-1" aria-hidden="true">
          {isSelected || (isTaken && !voided) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
      )}
      <span>{label}</span>
      {isTaken && !isSelected ? (
        // Web (sm+ viewports) shows "F.Lastname"; narrower/mobile widths show
        // just the first name — same data, two pre-formatted strings from
        // the server (see shared/pickOwnerLabel.ts) so a full last name
        // never has to round-trip to the client unabbreviated.
        <span className="text-[10px] text-muted-foreground truncate max-w-full">
          <span className="hidden sm:inline">{caption} {takenBy.web}</span>
          <span className="sm:hidden">{caption} {takenBy.mobile}</span>
        </span>
      ) : voidedByMe && !isSelected && !isPast ? (
        <span className="text-[10px] text-muted-foreground truncate max-w-full">Voided by you</span>
      ) : (
        subLabel && <span className="text-muted-foreground">{subLabel}</span>
      )}
    </Button>
  );
}
