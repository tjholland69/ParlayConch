import { Fragment, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, ChevronDown, Layers, Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddMultiBetParlay, useGames, usePlayerSearch, useSyncWeekPlayers, type MultiBetSaveError } from "@/hooks/use-bets";
import { BET_TYPE_OPTIONS, RESULTS } from "@/lib/bettingConstants";
import { getDisplayName, shortId } from "@/lib/displayName";
import { withPlusSign } from "@/lib/formatPick";
import { awaySpread } from "@/lib/gameOdds";
import { BoostFields } from "@/components/BoostDialog";
import { parseBoostPct } from "@shared/parlayBoost";
import { primaryPropType, propTypesForPosition } from "@/lib/propPosition";
import { upToCurrentWeek } from "@/lib/weekFilters";
import { cn } from "@/lib/utils";
import { YES_NO_PROP_TYPES, betMarket, validateMultiBetLegs, type MultiBetLegInput } from "@shared/multiBetValidation";
import type { Game, LeagueMemberWithUser, ParlayWithLegs, Player, Week } from "@shared/schema";

type Row = {
  key: number;
  userId: string;
  betType: string;
  gameId: number | null;
  pick: string;
  line: string;
  odds: string;
  result: string;
  playerName: string;
  playerPosition: string | null;
  propType: string;
};

const blankRow = (key: number): Row => ({
  key, userId: "", betType: "spread", gameId: null, pick: "", line: "", odds: "",
  result: "", playerName: "", playerPosition: null, propType: "",
});

const isTotal = (betType: string) => betType === "over" || betType === "under";

const SPREAD_NUDGE_CLASS =
  "flex h-4 w-full items-center justify-center rounded-t-md border border-b-0 border-white/10 bg-white/5 " +
  "text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const canNudgeSpread = (line: string) => Number.isFinite(parseFloat(line));

/** Moves a spread a whole point: "-4.5" to "-3.5", "-0.5" to "0.5". */
function nudgeSpread(line: string, delta: number): string {
  const next = parseFloat(line) + delta;
  return Number.isFinite(next) ? String(next) : line;
}

const toLeg = (row: Row): MultiBetLegInput => ({
  userId: row.userId,
  gameId: row.gameId,
  betType: row.betType,
  pick: row.pick,
  line: row.line.trim() || null,
  odds: row.odds.trim() || null,
  result: row.result || null,
  playerName: row.playerName.trim() || null,
  propType: row.propType || null,
});

/** Line and odds a game already carries for one market, to prefill the row. */
function gameMarket(game: Game, betType: string, pick: string): { line: string; odds: string } {
  if (betType === "spread") {
    return { line: pick === "away" ? awaySpread(game.spread) : game.spread ?? "", odds: game.spreadOdds ?? "" };
  }
  if (betType === "moneyline") {
    return { line: "", odds: (pick === "away" ? game.moneylineAway : game.moneylineHome) ?? "" };
  }
  if (betType === "over") return { line: game.overUnder ?? "", odds: game.overOdds ?? "" };
  if (betType === "under") return { line: game.overUnder ?? "", odds: game.underOdds ?? "" };
  return { line: "", odds: "" };
}

/** Why another row rules out this bet, or null if it's free to take. */
function conflictWith(candidate: MultiBetLegInput, others: { row: number; leg: MultiBetLegInput }[]): string | null {
  const mine = betMarket(candidate);
  if (!mine) return null;
  for (const { row, leg } of others) {
    const theirs = betMarket(leg);
    if (!theirs || theirs.market !== mine.market) continue;
    return theirs.side === mine.side ? `Row ${row} has this` : `Opposes row ${row}`;
  }
  return null;
}

type GamePickerProps = {
  row: Row;
  games: Game[] | undefined;
  disabled: boolean;
  /** Bets already entered on the other rows, with their 1-based row numbers. */
  others: { row: number; leg: MultiBetLegInput }[];
  onPick: (game: Game, pick: string) => void;
  testId: string;
};

/** Every game that week. Spread and moneyline rows show both teams and you
 * click the side you took; totals rows pick the game. */
function GamePicker({ row, games, disabled, others, onPick, testId }: GamePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = games?.find(g => g.id === row.gameId);
  const candidate = (game: Game, pick: string): MultiBetLegInput => ({ ...toLeg(row), gameId: game.id, pick });

  const sideButton = (game: Game, pick: "away" | "home") => {
    const team = pick === "away" ? game.awayTeam : game.homeTeam;
    const price = row.betType === "spread"
      ? withPlusSign(pick === "away" ? awaySpread(game.spread) : game.spread)
      : withPlusSign(pick === "away" ? game.moneylineAway : game.moneylineHome);
    const conflict = conflictWith(candidate(game, pick), others);
    const isSelected = row.gameId === game.id && row.pick === pick;
    return (
      <button
        type="button"
        disabled={!!conflict}
        title={conflict ?? undefined}
        onClick={() => { onPick(game, pick); setOpen(false); }}
        className={cn(
          "flex-1 min-w-0 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
          isSelected ? "border-primary bg-primary/15 text-foreground" : "border-white/10 hover:border-primary/50 hover:bg-primary/5",
          conflict && "opacity-40 cursor-not-allowed hover:border-white/10 hover:bg-transparent",
        )}
        data-testid={`${testId}-${game.id}-${pick}`}
      >
        <span className="block truncate font-medium">{team}</span>
        <span className="block text-[10px] text-muted-foreground">{conflict ?? price ?? "No line"}</span>
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-8 w-full justify-between bg-background border-white/10 px-2 text-xs font-normal"
          data-testid={testId}
        >
          <span className="truncate">
            {selected ? `${selected.awayTeam} @ ${selected.homeTeam}` : disabled ? "Choose a week first" : "Select game"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        {!games ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading games…</p>
        ) : games.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No games found for this week.</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            <p className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {isTotal(row.betType) ? "Pick the game" : "Click the team you took"}
            </p>
            {games.map(game => {
              const kickoff = game.gameTime ? format(new Date(game.gameTime), "EEE MMM d") : "TBD";
              if (isTotal(row.betType)) {
                const conflict = conflictWith(candidate(game, row.betType), others);
                return (
                  <button
                    key={game.id}
                    type="button"
                    disabled={!!conflict}
                    onClick={() => { onPick(game, row.betType); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                      row.gameId === game.id ? "border-primary bg-primary/15" : "border-white/10 hover:border-primary/50 hover:bg-primary/5",
                      conflict && "opacity-40 cursor-not-allowed hover:border-white/10 hover:bg-transparent",
                    )}
                    data-testid={`${testId}-${game.id}`}
                  >
                    <span className="truncate font-medium">{game.awayTeam} @ {game.homeTeam}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {conflict ?? `${row.betType === "over" ? "O" : "U"} ${game.overUnder ?? "—"} · ${kickoff}`}
                    </span>
                  </button>
                );
              }
              return (
                <div key={game.id} className="flex items-center gap-1.5">
                  {sideButton(game, "away")}
                  <span className="text-[10px] text-muted-foreground">@</span>
                  {sideButton(game, "home")}
                  <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground">{kickoff}</span>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type PlayerPickerProps = {
  value: string;
  onSelect: (name: string, player: Player | null) => void;
  /** Runs the nflverse import for the selected week; undefined until a week is chosen. */
  onLookupNew?: () => void;
  isLookingUp: boolean;
  testId: string;
};

/** Search box over the players table. A name that isn't there can be typed in
 * as-is, or imported with "Look up new players". */
function PlayerPicker({ value, onSelect, onLookupNew, isLookingUp, testId }: PlayerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: players, isLoading } = usePlayerSearch(search);
  const typed = search.trim();
  const exactMatch = (players ?? []).some(p => (p.displayName || p.name).toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-8 w-full justify-between bg-background border-white/10 px-2 text-xs font-normal"
          data-testid={testId}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Search className="w-3 h-3 opacity-50 shrink-0" />
            <span className="truncate">{value || "Search players"}</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search players…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No players found.</CommandEmpty>
                <CommandGroup>
                  {(players ?? []).map(p => {
                    const name = p.displayName || p.name;
                    return (
                      <CommandItem key={p.id} value={`${p.id}`} onSelect={() => { onSelect(name, p); setOpen(false); }}>
                        <Check className={cn("w-4 h-4", value === name ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{name}</span>
                        {p.position && (
                          <span className="ml-auto text-xs text-muted-foreground">{p.position}{p.team ? ` · ${p.team}` : ""}</span>
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
        <div className="border-t border-white/10 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground"
            disabled={!onLookupNew || isLookingUp}
            onClick={onLookupNew}
            data-testid={`${testId}-lookup-new`}
          >
            {isLookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {onLookupNew ? "Not listed? Look up new players" : "Choose a week to look up new players"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type AddMultiBetParlayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: number;
  /** League's minimum legs per parlay: the form starts with this many rows. */
  minLegs: number;
  weeks: Week[];
  members: LeagueMemberWithUser[];
  /** Existing parlays, to catch an owner who already has one that week. */
  parlays: ParlayWithLegs[];
  /** The signed-in (or acted-for) user: the default parlay owner. */
  currentUserId: string | undefined;
  /** Week to preselect, e.g. the page's own week filter. */
  defaultWeekId?: number | null;
};

/**
 * Enters a whole parlay in one form: one bet per league member. Mount it only
 * while open so each visit starts from a fresh form.
 */
export function AddMultiBetParlayDialog({
  open, onOpenChange, leagueId, minLegs, weeks, members, parlays, currentUserId, defaultWeekId,
}: AddMultiBetParlayDialogProps) {
  const addParlay = useAddMultiBetParlay(leagueId);
  const syncPlayers = useSyncWeekPlayers(leagueId);

  // Historical entry only backfills a past or current week (see upToCurrentWeek).
  const pickableWeeks = useMemo(
    () => [...upToCurrentWeek(weeks)].sort((a, b) => (b.season - a.season) || (b.weekNumber - a.weekNumber)),
    [weeks],
  );
  const initialWeek = pickableWeeks.find(w => w.id === defaultWeekId) ?? pickableWeeks[0];
  const [yearStr, setYearStr] = useState(initialWeek ? String(initialWeek.season) : "");
  const [weekId, setWeekId] = useState(initialWeek ? String(initialWeek.id) : "");
  const [ownerId, setOwnerId] = useState(
    currentUserId && members.some(m => m.userId === currentUserId) ? currentUserId : "",
  );

  const nextKey = useRef(0);
  const startingRows = Math.max(1, Math.min(minLegs, members.length || minLegs));
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: startingRows }, () => blankRow(nextKey.current++)));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<MultiBetSaveError | null>(null);
  const [hasBoost, setHasBoost] = useState(false);
  const [boostPctText, setBoostPctText] = useState("");
  const boostPct = hasBoost ? parseBoostPct(boostPctText) : null;

  const { data: games } = useGames(weekId ? Number(weekId) : 0);
  const seasons = [...new Set(pickableWeeks.map(w => w.season))];
  const visibleWeeks = pickableWeeks.filter(w => String(w.season) === yearStr).sort((a, b) => a.weekNumber - b.weekNumber);
  const selectedWeek = pickableWeeks.find(w => String(w.id) === weekId);

  const legs = rows.map(toLeg);
  const validation = validateMultiBetLegs(legs, { minLegs });

  const formErrors = [...validation.formErrors];
  if (!weekId) formErrors.unshift("Choose a year and week");
  if (!ownerId) formErrors.unshift("Choose the parlay owner");
  if (hasBoost && boostPct == null) formErrors.push("Enter the boost as a percent, like 25");
  const ownerName = getDisplayName(members.find(m => m.userId === ownerId)?.user, "This owner");
  if (ownerId && weekId && parlays.some(p => p.userId === ownerId && p.weekId === Number(weekId))) {
    formErrors.push(`${ownerName} already has a parlay for ${selectedWeek?.label ?? "that week"}. Edit that parlay, or choose a different owner.`);
  }
  const isValid = formErrors.length === 0 && Object.keys(validation.rowErrors).length === 0;
  const shownFormErrors = submitted ? [...formErrors, ...(serverErrors?.formErrors ?? [])] : [];
  const rowErrorsFor = (i: number) =>
    submitted ? [...(validation.rowErrors[i] ?? []), ...(serverErrors?.rowErrors?.[i] ?? [])] : [];

  const updateRow = (key: number, patch: Partial<Row>) => {
    setServerErrors(null);
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  };

  const changeBetType = (row: Row, betType: string) => {
    if (betType === "player_prop") {
      updateRow(row.key, { betType, gameId: null, pick: "over", line: "", odds: "", propType: "" });
      return;
    }
    const game = row.betType === "player_prop" ? undefined : games?.find(g => g.id === row.gameId);
    const pick = isTotal(betType) ? betType : row.pick === "home" || row.pick === "away" ? row.pick : "";
    const market = game && pick ? gameMarket(game, betType, pick) : { line: "", odds: "" };
    updateRow(row.key, {
      betType, pick, ...market,
      gameId: game?.id ?? null,
      playerName: "", playerPosition: null, propType: "",
    });
  };

  const changePropType = (row: Row, propType: string) => {
    const yesNo = YES_NO_PROP_TYPES.has(propType);
    const wasYesNo = YES_NO_PROP_TYPES.has(row.propType);
    updateRow(row.key, {
      propType,
      pick: yesNo === wasYesNo ? row.pick : yesNo ? "yes" : "over",
      line: yesNo ? "" : row.line,
    });
  };

  const changeWeek = (nextWeekId: string) => {
    setWeekId(nextWeekId);
    setServerErrors(null);
    // Game picks belong to the old week's slate, so they can't carry over.
    setRows(prev => prev.map(r => (r.gameId == null ? r : {
      ...r, gameId: null, line: "", odds: "", pick: isTotal(r.betType) ? r.betType : "",
    })));
  };

  const canAddRow = members.length === 0 || rows.length < members.length;
  const addRow = () => {
    setServerErrors(null);
    setRows(prev => [...prev, blankRow(nextKey.current++)]);
  };
  const removeRow = (key: number) => {
    setServerErrors(null);
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const handleSave = () => {
    setSubmitted(true);
    if (!isValid) return;
    addParlay.mutate(
      { userId: ownerId, weekId: Number(weekId), legs, boostPct },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err: MultiBetSaveError) => setServerErrors(err),
      },
    );
  };

  const memberName = (m: LeagueMemberWithUser) => getDisplayName(m.user, shortId(m.userId, 8));

  return (
    <Dialog open={open} onOpenChange={v => { if (!addParlay.isPending) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col gap-4" data-testid="dialog-add-multi-bet">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Add Parlay (Multi-Bet)
          </DialogTitle>
          <DialogDescription>
            Enter the whole parlay at once: one bet per member. Results are pulled and graded when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Year</Label>
            <Select value={yearStr} onValueChange={v => { setYearStr(v); changeWeek(""); }}>
              <SelectTrigger className="h-9" data-testid="select-multi-bet-year"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                {seasons.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Week</Label>
            <Select value={weekId} onValueChange={changeWeek} disabled={!yearStr}>
              <SelectTrigger className="h-9" data-testid="select-multi-bet-week"><SelectValue placeholder="Week" /></SelectTrigger>
              <SelectContent>
                {visibleWeeks.map(w => <SelectItem key={w.id} value={String(w.id)}>Week {w.weekNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Owner (started the parlay)</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-9" data-testid="select-multi-bet-owner"><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {members.map(m => <SelectItem key={m.userId} value={m.userId}>{memberName(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <BoostFields hasBoost={hasBoost} pct={boostPctText} onHasBoostChange={setHasBoost} onPctChange={setBoostPctText} />

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2 text-left font-medium">#</th>
                <th className="w-40 px-2 py-2 text-left font-medium">Bet Owner</th>
                <th className="w-32 px-2 py-2 text-left font-medium">Type</th>
                <th className="w-52 px-2 py-2 text-left font-medium">Matchup / Prop</th>
                <th className="px-2 py-2 text-left font-medium">Pick</th>
                <th className="w-20 px-2 py-2 text-left font-medium">Line</th>
                <th className="w-20 px-2 py-2 text-left font-medium">Odds</th>
                <th className="w-28 px-2 py-2 text-left font-medium">Kickoff (ET)</th>
                <th className="w-24 px-2 py-2 text-left font-medium">Result</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const errors = rowErrorsFor(i);
                const game = games?.find(g => g.id === row.gameId);
                const isProp = row.betType === "player_prop";
                const yesNo = isProp && YES_NO_PROP_TYPES.has(row.propType);
                const others = rows
                  .map((r, j) => ({ row: j + 1, leg: toLeg(r) }))
                  .filter((_, j) => j !== i);
                const takenOwners = new Set(rows.filter(r => r.key !== row.key && r.userId).map(r => r.userId));
                const propOptions = propTypesForPosition(row.playerPosition);
                const pickLabel = !game ? "—"
                  : isTotal(row.betType) ? (row.betType === "over" ? "Over" : "Under")
                  : row.pick === "home" ? game.homeTeam
                  : row.pick === "away" ? game.awayTeam
                  : "—";

                return (
                  <Fragment key={row.key}>
                    <tr className={cn("border-t border-white/5 align-top", errors.length > 0 && "bg-destructive/5")} data-testid={`row-multi-bet-${i}`}>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2">
                        <Select value={row.userId} onValueChange={v => updateRow(row.key, { userId: v })}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-multi-bet-owner-${i}`}><SelectValue placeholder="Member" /></SelectTrigger>
                          <SelectContent>
                            {/* A member who already has a bet on another row can't take a second. */}
                            {members.filter(m => !takenOwners.has(m.userId)).map(m => (
                              <SelectItem key={m.userId} value={m.userId}>{memberName(m)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select value={row.betType} onValueChange={v => changeBetType(row, v)}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-multi-bet-type-${i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BET_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        {isProp ? (
                          <PlayerPicker
                            value={row.playerName}
                            onSelect={(name, player) => {
                              const propType = player?.position ? primaryPropType(player.position) : row.propType;
                              const yesNoNow = YES_NO_PROP_TYPES.has(propType);
                              updateRow(row.key, {
                                playerName: name,
                                playerPosition: player?.position ?? null,
                                propType,
                                pick: yesNoNow ? (row.pick === "no" ? "no" : "yes") : row.pick === "under" ? "under" : "over",
                              });
                            }}
                            onLookupNew={weekId ? () => syncPlayers.mutate(Number(weekId)) : undefined}
                            isLookingUp={syncPlayers.isPending}
                            testId={`button-multi-bet-player-${i}`}
                          />
                        ) : (
                          <GamePicker
                            row={row}
                            games={games}
                            disabled={!weekId}
                            others={others}
                            onPick={(g, pick) => updateRow(row.key, { gameId: g.id, pick, ...gameMarket(g, row.betType, pick) })}
                            testId={`button-multi-bet-game-${i}`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isProp ? (
                          <div className="flex gap-1.5">
                            <Select value={row.pick} onValueChange={v => updateRow(row.key, { pick: v })}>
                              <SelectTrigger className="h-8 w-24 text-xs" data-testid={`select-multi-bet-direction-${i}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(yesNo ? ["yes", "no"] : ["over", "under"]).map(p => (
                                  <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={row.propType} onValueChange={v => changePropType(row, v)}>
                              <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" data-testid={`select-multi-bet-stat-${i}`}><SelectValue placeholder="Stat" /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {propOptions.other.length > 0 && <SelectLabel className="text-[10px] uppercase text-muted-foreground">{row.playerPosition} props</SelectLabel>}
                                  {propOptions.primary.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                                </SelectGroup>
                                {propOptions.other.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="text-[10px] uppercase text-muted-foreground">Other</SelectLabel>
                                    {propOptions.other.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                                  </SelectGroup>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <span className={cn("flex h-8 items-center text-xs", pickLabel === "—" && "text-muted-foreground")}>{pickLabel}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {/* Spreads sit on the half point, so the quick-change
                            buttons move a whole point (4.5 to 5.5), not half. */}
                        {row.betType === "spread" && (
                          <button
                            type="button"
                            className={SPREAD_NUDGE_CLASS}
                            onClick={() => updateRow(row.key, { line: nudgeSpread(row.line, 1) })}
                            disabled={!canNudgeSpread(row.line)}
                            aria-label="Raise spread by 1 point"
                            data-testid={`button-multi-bet-spread-up-${i}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                        <Input
                          className={cn("h-8 px-2 text-xs", row.betType === "spread" && "rounded-none text-center")}
                          value={row.line}
                          disabled={row.betType === "moneyline" || yesNo}
                          onChange={e => updateRow(row.key, { line: e.target.value })}
                          placeholder={row.betType === "moneyline" || yesNo ? "—" : isProp ? "74.5" : "-3.5"}
                          data-testid={`input-multi-bet-line-${i}`}
                        />
                        {row.betType === "spread" && (
                          <button
                            type="button"
                            className={cn(SPREAD_NUDGE_CLASS, "rounded-b-md rounded-t-none border-t-0 border-b")}
                            onClick={() => updateRow(row.key, { line: nudgeSpread(row.line, -1) })}
                            disabled={!canNudgeSpread(row.line)}
                            aria-label="Lower spread by 1 point"
                            data-testid={`button-multi-bet-spread-down-${i}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-8 px-2 text-xs"
                          value={row.odds}
                          onChange={e => updateRow(row.key, { odds: e.target.value })}
                          placeholder="-110"
                          data-testid={`input-multi-bet-odds-${i}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <span className="flex h-8 items-center whitespace-nowrap text-xs text-muted-foreground">
                          {game?.gameTime
                            ? new Date(game.gameTime).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })
                            : isProp ? "Set on save" : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <Select value={row.result || "__auto"} onValueChange={v => updateRow(row.key, { result: v === "__auto" ? "" : v })}>
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-multi-bet-result-${i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__auto">Auto</SelectItem>
                            {RESULTS.filter(Boolean).map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove row ${i + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {errors.length > 0 && (
                      <tr className="bg-destructive/5">
                        <td />
                        <td colSpan={9} className="px-2 pb-2 text-xs text-destructive" data-testid={`text-multi-bet-row-errors-${i}`}>
                          {errors.join(" · ")}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-dashed text-xs"
            onClick={addRow}
            disabled={!canAddRow}
            data-testid="button-multi-bet-add-row"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Row
          </Button>
          <span className="text-xs text-muted-foreground">
            {rows.length} bet{rows.length !== 1 ? "s" : ""} · minimum {minLegs}
            {!canAddRow && " · every member has a row"}
          </span>
        </div>

        {shownFormErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" data-testid="text-multi-bet-form-errors">
            {shownFormErrors.map((e, i) => (
              <p key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />{e}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addParlay.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={addParlay.isPending || (submitted && !isValid)} data-testid="button-multi-bet-save">
            {addParlay.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Layers className="w-4 h-4 mr-2" />}
            {addParlay.isPending ? "Saving and refreshing results…" : `Save Parlay (${rows.length} bet${rows.length !== 1 ? "s" : ""})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
