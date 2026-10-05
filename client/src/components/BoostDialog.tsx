import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, Rocket } from "lucide-react";
import { parseBoostPct } from "@shared/parlayBoost";

/** The boost question on its own: a yes/no, and the percent when it's yes.
 * `pct` is the raw text so a half-typed number isn't lost. */
export function BoostFields({
  hasBoost,
  pct,
  onHasBoostChange,
  onPctChange,
}: {
  hasBoost: boolean;
  pct: string;
  onHasBoostChange: (v: boolean) => void;
  onPctChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Boost on this parlay?</Label>
        <ToggleGroup
          type="single"
          value={hasBoost ? "yes" : "no"}
          onValueChange={(v) => v && onHasBoostChange(v === "yes")}
          className="justify-start gap-2"
        >
          <ToggleGroupItem value="no" variant="outline" className="h-9 px-4" data-testid="toggle-boost-no">No</ToggleGroupItem>
          <ToggleGroupItem value="yes" variant="outline" className="h-9 px-4" data-testid="toggle-boost-yes">Yes</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {hasBoost && (
        <div className="space-y-1">
          <Label htmlFor="boost-pct" className="text-xs text-muted-foreground">Boost %</Label>
          <div className="relative w-28">
            <Input
              id="boost-pct"
              inputMode="decimal"
              autoFocus
              placeholder="25"
              value={pct}
              onChange={(e) => onPctChange(e.target.value)}
              className="h-9 pr-7"
              data-testid="input-boost-pct"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Asks whether a sportsbook promo boost applies to a parlay and, if so, how
 * big. Used both as the prompt on submit and to add or change a boost later
 * (a boost claimed at the book is often recorded after the bet is live).
 */
export function BoostDialog({
  open,
  onOpenChange,
  initialPct,
  onConfirm,
  isSaving,
  title = "Parlay boost",
  confirmLabel = "Save",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPct?: number | null;
  /** Null when there's no boost. */
  onConfirm: (boostPct: number | null) => void;
  isSaving?: boolean;
  title?: string;
  confirmLabel?: string;
}) {
  const [hasBoost, setHasBoost] = useState(false);
  const [pct, setPct] = useState("");
  useEffect(() => {
    if (!open) return;
    setHasBoost(!!initialPct);
    setPct(initialPct ? String(initialPct) : "");
  }, [open, initialPct]);

  const parsed = parseBoostPct(pct);
  const invalid = hasBoost && parsed == null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-parlay-boost">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Sportsbooks sometimes boost a parlay's odds as a promo, usually by 15 to 30%.
          </DialogDescription>
        </DialogHeader>
        <BoostFields hasBoost={hasBoost} pct={pct} onHasBoostChange={setHasBoost} onPctChange={setPct} />
        {hasBoost && pct.trim() !== "" && invalid && (
          <p className="text-xs text-destructive">Enter the boost as a percent, like 25.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={() => onConfirm(hasBoost ? parsed : null)}
            disabled={invalid || isSaving}
            data-testid="button-boost-confirm"
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
