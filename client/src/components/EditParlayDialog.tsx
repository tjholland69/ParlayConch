import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ParlayWithLegs } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parlay: ParlayWithLegs | null;
  leagueId: number;
  weekId: number;
}

export function EditParlayDialog({ open, onOpenChange, parlay, leagueId, weekId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [legResults, setLegResults] = useState<Record<number, string>>({});
  const [legNotes, setLegNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    if (parlay) {
      setStatus(parlay.status || "pending");
      const results: Record<number, string> = {};
      const notes: Record<number, string> = {};
      parlay.legs.forEach(leg => {
        results[leg.id] = leg.result || "";
        notes[leg.id] = leg.notes || "";
      });
      setLegResults(results);
      setLegNotes(notes);
    }
  }, [parlay]);

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: string; legs?: { id: number; result?: string | null; notes?: string | null }[] }) => {
      const res = await apiRequest("PATCH", `/api/parlays/${parlay?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Parlay Updated", description: "Changes saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays", weekId] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const legs = Object.entries(legResults).map(([id, result]) => ({
      id: parseInt(id),
      result: result || null,
      notes: legNotes[parseInt(id)] || null,
    }));
    updateMutation.mutate({ status, legs });
  };

  if (!parlay) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Parlay</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Parlay Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-parlay-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="void">Void (Missed Week)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Leg Results &amp; Notes</Label>
            {parlay.legs.map((leg) => (
              <div key={leg.id} className="p-3 bg-muted/30 rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-sm">
                    <p className="font-medium">
                      {leg.betType === 'player_prop'
                        ? (leg.playerName || 'Player Prop')
                        : `${leg.game?.awayTeam ?? '?'} @ ${leg.game?.homeTeam ?? '?'}`}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {leg.betType === 'player_prop'
                        ? `${leg.pick.charAt(0).toUpperCase()}${leg.pick.slice(1)}${leg.line ? ` ${leg.line}` : ''} — ${leg.propType?.replace(/_/g, ' ') ?? 'prop'}`
                        : `${leg.pick === 'home' ? leg.game?.homeTeam : leg.game?.awayTeam} (${leg.betType})`}
                    </p>
                  </div>
                  <Select 
                    value={legResults[leg.id] || "none"} 
                    onValueChange={(v) => setLegResults(prev => ({ ...prev, [leg.id]: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger className="w-24" data-testid={`select-leg-result-${leg.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      <SelectItem value="win">Win</SelectItem>
                      <SelectItem value="loss">Loss</SelectItem>
                      <SelectItem value="push">Push</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Add a note to this leg… (optional)"
                  value={legNotes[leg.id] || ""}
                  onChange={(e) => setLegNotes(prev => ({ ...prev, [leg.id]: e.target.value }))}
                  className="text-xs resize-none h-14 bg-background/50"
                  data-testid={`textarea-leg-notes-${leg.id}`}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="button-save-parlay"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
