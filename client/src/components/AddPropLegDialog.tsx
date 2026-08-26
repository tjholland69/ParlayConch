import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PLAYER_PROP_TYPES, type Game } from "@shared/schema";
import { useAddDraftLeg } from "@/hooks/use-bets";

const PICK_OPTIONS = ["over", "under", "yes", "no"] as const;

/**
 * There's no live player-prop odds feed in this app — every prop leg is
 * manually entered (same fields used in ParlayRollupCard's leg editor and
 * DemoDataEditor). This dialog is that same manual entry, just pre-scoped to
 * one game (reached via the "View player props" link on its picks-grid
 * tile) so the user isn't re-selecting the game.
 */
export function AddPropLegDialog({
  game,
  leagueId,
  weekId,
  open,
  onOpenChange,
}: {
  game: Game;
  leagueId: number;
  weekId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [playerName, setPlayerName] = useState("");
  const [propType, setPropType] = useState<string>(PLAYER_PROP_TYPES[0].value);
  const [pick, setPick] = useState<string>("over");
  const [line, setLine] = useState("");
  const addDraftLeg = useAddDraftLeg();

  const canSave = playerName.trim().length > 0;

  const handleSave = () => {
    addDraftLeg.mutate(
      {
        leagueId,
        weekId,
        leg: {
          gameId: game.id,
          betType: "player_prop",
          pick,
          line: line.trim() || undefined,
          playerName: playerName.trim(),
          propType,
        },
      },
      {
        onSuccess: () => {
          setPlayerName("");
          setLine("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Player Prop</DialogTitle>
          <p className="text-sm text-muted-foreground">{game.awayTeam} @ {game.homeTeam}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Player Name</Label>
            <Input
              className="h-9"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Travis Kelce"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prop Type</Label>
            <Select value={propType} onValueChange={setPropType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYER_PROP_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Pick</Label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PICK_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Line</Label>
              <Input className="h-9" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. 4.5" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={handleSave} disabled={!canSave || addDraftLeg.isPending}>
            {addDraftLeg.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Pick
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
