import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Minus, Plus } from "lucide-react";
import { PLAYER_PROP_TYPES, type Game } from "@shared/schema";
import { useAddDraftLeg } from "@/hooks/use-bets";

/** Scoring props are a yes/no call with no number; everything else is an
 * over/under on a half-point line. */
const YES_NO_PROPS = new Set(["anytime_td", "first_td", "last_td"]);

/** Slider range and starting point for each stat prop's line. Lines sit on
 * the .5 ticks (0.5, 1.5, 2.5, …) so a pick can never push; the slider moves
 * one whole unit at a time. */
const LINE_RANGES: Record<string, { max: number; start: number }> = {
  pass_yards:        { max: 449.5, start: 224.5 },
  rush_yards:        { max: 199.5, start: 49.5 },
  rec_yards:         { max: 199.5, start: 49.5 },
  all_purpose_yards: { max: 249.5, start: 74.5 },
  pass_tds:          { max: 5.5,   start: 1.5 },
  rush_tds:          { max: 4.5,   start: 0.5 },
  rec_tds:           { max: 4.5,   start: 0.5 },
  rush_attempts:     { max: 39.5,  start: 14.5 },
  receptions:        { max: 14.5,  start: 4.5 },
  pass_attempts:     { max: 59.5,  start: 32.5 },
  pass_completions:  { max: 44.5,  start: 21.5 },
  interceptions:     { max: 3.5,   start: 0.5 },
  kicking_pts:       { max: 19.5,  start: 7.5 },
  fg_made:           { max: 5.5,   start: 1.5 },
  sacks:             { max: 4.5,   start: 0.5 },
  tackles:           { max: 14.5,  start: 5.5 },
};
const DEFAULT_LINE_RANGE = { max: 99.5, start: 9.5 };
const MIN_LINE = 0.5;

function lineRangeFor(propType: string) {
  return LINE_RANGES[propType] ?? DEFAULT_LINE_RANGE;
}

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
  const [line, setLine] = useState<number>(lineRangeFor(PLAYER_PROP_TYPES[0].value).start);
  const addDraftLeg = useAddDraftLeg();

  const isYesNo = YES_NO_PROPS.has(propType);
  const range = lineRangeFor(propType);
  const pickOptions = isYesNo ? (["yes", "no"] as const) : (["over", "under"] as const);
  const canSave = playerName.trim().length > 0;

  const changePropType = (next: string) => {
    setPropType(next);
    setLine(lineRangeFor(next).start);
    const nextIsYesNo = YES_NO_PROPS.has(next);
    if (nextIsYesNo !== isYesNo) setPick(nextIsYesNo ? "yes" : "over");
  };
  const nudgeLine = (delta: number) =>
    setLine((l) => Math.min(range.max, Math.max(MIN_LINE, l + delta)));

  const handleSave = () => {
    addDraftLeg.mutate(
      {
        leagueId,
        weekId,
        leg: {
          gameId: game.id,
          betType: "player_prop",
          pick,
          line: isYesNo ? undefined : String(line),
          playerName: playerName.trim(),
          propType,
        },
      },
      {
        onSuccess: () => {
          setPlayerName("");
          setLine(range.start);
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
            <Select value={propType} onValueChange={changePropType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYER_PROP_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pick</Label>
            <ToggleGroup
              type="single"
              value={pick}
              onValueChange={(v) => v && setPick(v)}
              className="grid grid-cols-2 gap-2"
            >
              {pickOptions.map((p) => (
                <ToggleGroupItem key={p} value={p} variant="outline" className="h-9" data-testid={`toggle-prop-pick-${p}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {!isYesNo && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Line</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => nudgeLine(-1)}
                    disabled={line <= MIN_LINE}
                    aria-label="Lower line by 1"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <span className="font-mono font-bold text-base w-16 text-center" data-testid="text-prop-line">
                    {line.toFixed(1)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => nudgeLine(1)}
                    disabled={line >= range.max}
                    aria-label="Raise line by 1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {/* The slider runs on whole numbers and adds the half point
                  itself: Radix rounds snapped values to the step's decimals,
                  so min=0.5/step=1 would land on integers. */}
              <Slider
                min={0}
                max={range.max - MIN_LINE}
                step={1}
                value={[line - MIN_LINE]}
                onValueChange={([v]) => setLine(v + MIN_LINE)}
                aria-label="Prop line"
                data-testid="slider-prop-line"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{MIN_LINE}</span>
                <span>{range.max}</span>
              </div>
            </div>
          )}
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
