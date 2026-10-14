import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseActualOdds } from "@shared/parlayOdds";

/**
 * Records the odds a parlay actually got at the sportsbook. The app can only
 * estimate a parlay's price from its legs, and books reprice the ticket as a
 * whole, so whoever placed it types in the real number here. Saving it blank
 * goes back to the estimate.
 */
export function ParlayOddsDialog({
  open,
  onOpenChange,
  actualOdds,
  estimate,
  onConfirm,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What's recorded now, if anything ("+650"). */
  actualOdds?: string | null;
  /** The app's own estimate, shown for reference ("+612"). */
  estimate?: string | null;
  /** Null clears the recorded odds. */
  onConfirm: (actualOdds: string | null) => void;
  isSaving?: boolean;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText(actualOdds ?? "");
  }, [open, actualOdds]);

  const blank = text.trim() === "";
  const parsed = parseActualOdds(text);
  const invalid = !blank && !parsed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-parlay-odds">
        <DialogHeader>
          <DialogTitle>Parlay odds</DialogTitle>
          <DialogDescription>
            Enter the odds your sportsbook gave the whole parlay when you placed it.
            {estimate ? ` Our estimate from the legs is ${estimate}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="parlay-actual-odds">Odds at placement</Label>
          <Input
            id="parlay-actual-odds"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="+650"
            inputMode="text"
            autoComplete="off"
            aria-invalid={invalid}
            data-testid="input-parlay-actual-odds"
          />
          <p className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {invalid ? "Use American odds, like +650 or -120." : "Leave it blank to go back to the estimate."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => onConfirm(blank ? null : parsed)} disabled={invalid || isSaving} data-testid="button-parlay-odds-confirm">
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {blank && actualOdds ? "Use the estimate" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
