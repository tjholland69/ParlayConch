import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BetSlipPanel } from "@/components/BetSlipPanel";
import { useConfirmParlayPlaced, useReopenParlay } from "@/hooks/use-parlay-extras";
import { canConfirmPlaced, isParlayLocked } from "@shared/parlayProgress";
import type { ParlayWithLegs } from "@shared/schema";

/**
 * Under a locked parlay: copy it out to a sportsbook, say it's placed, and
 * (Parlay Maestro only) bust it back open. Nothing shows for an open or
 * settled parlay, since only a locked one can go to a sportsbook.
 */
export function ParlayPlacementBar({ parlay, leagueName, canManage }: { parlay: ParlayWithLegs; leagueName?: string; canManage: boolean }) {
  const confirmPlaced = useConfirmParlayPlaced();
  const reopen = useReopenParlay();
  const [confirmReopen, setConfirmReopen] = useState(false);
  if (!isParlayLocked(parlay)) return null;
  const placed = parlay.status === "placed";

  return (
    <div className="rounded-xl border border-white/10 bg-card/30 px-4 pb-4" data-testid={`placement-bar-${parlay.id}`}>
      <BetSlipPanel parlay={parlay} leagueName={leagueName} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {placed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Placed
          </span>
        ) : canConfirmPlaced(parlay) ? (
          <Button
            size="sm"
            onClick={() => confirmPlaced.mutate(parlay.id)}
            disabled={confirmPlaced.isPending}
            data-testid={`button-confirm-placed-${parlay.id}`}
          >
            {confirmPlaced.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            I placed this bet
          </Button>
        ) : null}
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReopen(true)}
            disabled={reopen.isPending}
            data-testid={`button-reopen-parlay-${parlay.id}`}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Bust &amp; reopen
          </Button>
        )}
        {!placed && (
          <span className="text-[11px] text-muted-foreground">
            Any member can confirm. Once a game kicks off it's taken as placed.
          </span>
        )}
      </div>
      <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bust and reopen this parlay?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes back to open and the week unlocks, so picks can change again. Picks on games that have already started stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reopen.mutate(parlay.id)}>Bust &amp; reopen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
