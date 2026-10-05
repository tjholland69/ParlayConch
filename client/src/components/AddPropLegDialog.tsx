import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronDown, Loader2, Minus, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PLAYER_PROP_TYPES, type Game, type Player } from "@shared/schema";
import { useAddDraftLeg, useGamePlayerSearch } from "@/hooks/use-bets";
import { primaryPropType, propTypesForPosition } from "@/lib/propPosition";
import { LINE_STEP, MIN_LINE, lineRangeFor } from "@shared/propLines";
import { cn } from "@/lib/utils";

/** Scoring props are a yes/no call with no number; everything else is an
 * over/under on a line. */
const YES_NO_PROPS = new Set(["anytime_td", "first_td", "last_td"]);

/**
 * Type-ahead over the rosters of the two teams in `gameId`. A name that
 * isn't in the players table yet (a call-up the sync hasn't seen) can still
 * be used as typed, so a missing roster row never blocks a pick.
 */
function GamePlayerPicker({
  gameId,
  value,
  onSelect,
}: {
  gameId: number;
  value: string;
  onSelect: (name: string, player: Player | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: players, isLoading } = useGamePlayerSearch(gameId, search);
  const typed = search.trim();
  const exactMatch = (players ?? []).some(p => (p.displayName || p.name).toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-between bg-background border-white/10 px-3 font-normal"
          data-testid="button-prop-player"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Search players in this game"}</span>
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type a player's name…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No players on either team match.</CommandEmpty>
                <CommandGroup>
                  {(players ?? []).map(p => {
                    const name = p.displayName || p.name;
                    return (
                      <CommandItem key={p.id} value={`${p.id}`} onSelect={() => { onSelect(name, p); setOpen(false); }}>
                        <Check className={cn("w-4 h-4", value === name ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{name}</span>
                        {(p.position || p.team) && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {[p.position, p.team].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                  {typed && !exactMatch && (
                    <CommandItem value="__typed__" onSelect={() => { onSelect(typed, null); setOpen(false); }}>
                      <Plus className="w-4 h-4" />
                      <span className="truncate">Use "{typed}"</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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
  // Drives which prop types are offered: a receiver can't be given a sack
  // or interception prop. Null (a typed-in name) offers everything.
  const [playerPosition, setPlayerPosition] = useState<string | null>(null);
  const [propType, setPropType] = useState<string>(PLAYER_PROP_TYPES[0].value);
  const [pick, setPick] = useState<string>("over");
  const [line, setLine] = useState<number>(lineRangeFor(PLAYER_PROP_TYPES[0].value).start);
  const addDraftLeg = useAddDraftLeg();

  const isYesNo = YES_NO_PROPS.has(propType);
  const range = lineRangeFor(propType);
  const pickOptions = isYesNo ? (["yes", "no"] as const) : (["over", "under"] as const);
  const canSave = playerName.trim().length > 0;
  const propOptions = playerPosition ? propTypesForPosition(playerPosition).primary : PLAYER_PROP_TYPES;

  const changePropType = (next: string) => {
    setPropType(next);
    setLine(lineRangeFor(next).start);
    const nextIsYesNo = YES_NO_PROPS.has(next);
    if (nextIsYesNo !== isYesNo) setPick(nextIsYesNo ? "yes" : "over");
  };
  const selectPlayer = (name: string, player: Player | null) => {
    setPlayerName(name);
    setPlayerPosition(player?.position ?? null);
    // Start on the stat this position is usually bet on; this also moves
    // off a prop type the new player's position can't have.
    if (player?.position) changePropType(primaryPropType(player.position));
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
          setPlayerPosition(null);
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
            <Label className="text-xs text-muted-foreground">Player</Label>
            <GamePlayerPicker gameId={game.id} value={playerName} onSelect={selectPlayer} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prop Type</Label>
            <Select value={propType} onValueChange={changePropType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {propOptions.map((p) => (
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
                    onClick={() => nudgeLine(-LINE_STEP)}
                    disabled={line <= MIN_LINE}
                    aria-label="Lower line by half a point"
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
                    onClick={() => nudgeLine(LINE_STEP)}
                    disabled={line >= range.max}
                    aria-label="Raise line by half a point"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <Slider
                min={MIN_LINE}
                max={range.max}
                step={LINE_STEP}
                value={[line]}
                onValueChange={([v]) => setLine(v)}
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
