import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PickTile({
  label,
  subLabel,
  hasOdds,
  isPast,
  isSelected,
  takenBy,
  capReached,
  onClick,
  testId,
}: {
  label: string;
  subLabel?: string | null;
  hasOdds: boolean;
  isPast: boolean;
  isSelected: boolean;
  takenBy?: { web: string; mobile: string } | null;
  capReached: boolean;
  onClick: () => void;
  testId: string;
}) {
  const isTaken = !!takenBy;
  // A pick on a game that has since started stays clickable, so it can be removed.
  const disabled = isSelected ? false : isPast || !hasOdds || isTaken || capReached;
  return (
    <Button
      size="sm"
      variant={isSelected ? "default" : "outline"}
      className={cn(
        "h-14 min-h-14 py-1.5 flex flex-col items-center justify-center gap-0.5 text-xs leading-tight",
        isTaken && !isSelected && "opacity-40"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span>{label}</span>
      {isTaken && !isSelected ? (
        // Web (sm+ viewports) shows "F.Lastname"; narrower/mobile widths show
        // just the first name — same data, two pre-formatted strings from
        // the server (see shared/pickOwnerLabel.ts) so a full last name
        // never has to round-trip to the client unabbreviated.
        <span className="text-[10px] text-muted-foreground truncate max-w-full">
          <span className="hidden sm:inline">Taken by {takenBy.web}</span>
          <span className="sm:hidden">Taken by {takenBy.mobile}</span>
        </span>
      ) : (
        subLabel && <span className="text-muted-foreground">{subLabel}</span>
      )}
    </Button>
  );
}
