import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    if (parlay) {
      setStatus(parlay.status || "pending");
      const results: Record<number, string> = {};
      parlay.legs.forEach(leg => {
        results[leg.id] = leg.result || "";
      });
      setLegResults(results);
    }
  }, [parlay]);

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: string; legs?: { id: number; result?: string }[] }) => {
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
    }));
    updateMutation.mutate({ status, legs: legs as any });
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
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Leg Results</Label>
            {parlay.legs.map((leg) => (
              <div key={leg.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex-1 text-sm">
                  <p className="font-medium">{leg.game.awayTeam} @ {leg.game.homeTeam}</p>
                  <p className="text-muted-foreground text-xs">
                    {leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam} ({leg.betType})
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
