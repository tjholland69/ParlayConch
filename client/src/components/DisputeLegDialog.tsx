import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLegDisputes, useFileDispute } from "@/hooks/use-bets";

const REASON_LABELS: Record<string, string> = {
  result_wrong: "The result is wrong",
  entered_incorrectly: "This bet was entered incorrectly",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Pending review", className: "border-amber-500/40 text-amber-400" },
  resolved: { label: "Resolved", className: "border-emerald-500/40 text-emerald-400" },
  dismissed: { label: "Dismissed", className: "border-muted-foreground/40 text-muted-foreground" },
};

/** "Dispute this bet" affordance for a league member on their own leg. */
export function DisputeLegDialog({ legId }: { legId: number }) {
  const [open, setOpen] = useState(false);
  const [reasonType, setReasonType] = useState("result_wrong");
  const [justification, setJustification] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const { data: disputes } = useLegDisputes(legId);
  const fileDispute = useFileDispute(legId);

  const openDispute = disputes?.find(d => d.status === "open");
  const screenshotRequired = reasonType === "entered_incorrectly";

  const handleSubmit = () => {
    if (!justification.trim()) return;
    if (screenshotRequired && !screenshot) return;
    fileDispute.mutate(
      { reasonType, justification, screenshot },
      { onSuccess: () => { setOpen(false); setJustification(""); setScreenshot(null); setReasonType("result_wrong"); } },
    );
  };

  if (openDispute) {
    const status = STATUS_LABELS[openDispute.status] ?? STATUS_LABELS.open;
    return (
      <Badge variant="outline" className={`text-xs px-1.5 py-0 font-normal ${status.className}`} title={openDispute.justification}>
        <Flag className="w-3 h-3 mr-1" />
        Disputed — {status.label}
      </Badge>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Dispute this bet"
          className="text-muted-foreground hover:text-destructive"
          onClick={e => e.stopPropagation()}
        >
          <Flag className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-base">Dispute this bet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">What's wrong?</Label>
            <RadioGroup value={reasonType} onValueChange={setReasonType}>
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`dispute-reason-${value}`} />
                  <Label htmlFor={`dispute-reason-${value}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Justification</Label>
            <Textarea
              className="min-h-[72px] text-sm"
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Explain what you think is wrong…"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Screenshot {screenshotRequired ? "(required)" : "(optional)"}
            </Label>
            <Input
              type="file"
              accept="image/*"
              onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={fileDispute.isPending || !justification.trim() || (screenshotRequired && !screenshot)}
            onClick={handleSubmit}
          >
            {fileDispute.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}