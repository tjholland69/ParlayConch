import React, { useState, memo } from "react";
import { useDeleteParlay, useDeleteParlayLeg, useUpdateParlayLeg, useUpdateParlayStatus, useAddParlayLeg, useEnrichParlayLeg, useRecalcParlay, useSplitParlayLegs, useCloneParlay, useSetParlayBoost, useWeeks, type EnrichLog } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Pencil, Plus, Loader2, Calendar, CheckSquare, Square, CloudDownload, CheckCircle2, AlertTriangle, XCircle, ChevronRight, ChevronDown, ChevronUp, Scissors, Info, Copy, Check, Clock, Megaphone, RefreshCw, LockKeyhole, UserCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { withPlusSign } from "@/lib/formatPick";
import { PLAYER_PROP_TYPES, type ParlayLeg, type ParlayWithLegs, type LeagueMemberWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getDisplayName, shortId } from "@/lib/displayName";
import { getOpenParlayVisualStyle, getParlayVisualStyle, getWinPctColor } from "@/lib/parlayVisuals";
import { getBustedLeg } from "@/lib/parlayLoser";
import { useEffectiveUserId } from "@/hooks/use-acting-as";
import { DisputeLegDialog } from "@/components/DisputeLegDialog";
import { getHeroLeg } from "@/lib/parlayHero";
import { sortParlayLegs } from "@shared/legOrder";
import { heroLabelText as heroLabelFor, loserLabelText as loserLabelFor } from "@shared/leagueLabels";
import { buildParlayStory } from "@shared/parlayStory";
import { ParlayMixBar } from "@/components/ParlayMixBar";
import { BET_TYPES, RESULTS } from "@/lib/bettingConstants";
import { legLabel } from "@/lib/legLabel";
import { resultColor, statusColor } from "@/lib/parlayStatusStyles";
import { ParlayLegResultBadge } from "@/components/ParlayLegResultBadge";
import { getSlate, groupLegsBySlate } from "@shared/slate";
import { legLookthroughLabel, legPickColumnLabel } from "@shared/formatPick";
import { kickoffTimeLabel } from "@shared/parlayReminder";
import { legContextLine } from "@shared/nflWeek";
import { boostLabel } from "@shared/parlayBoost";
import { BoostDialog } from "@/components/BoostDialog";
import { ShameReportDialog } from "@/components/ShameReportDialog";
import { canShameSeason } from "@shared/shameReport";
import { isParlayInProgress, isParlayLocked, legTally } from "@shared/parlayProgress";

export { BET_TYPES, RESULTS } from "@/lib/bettingConstants";

const PICK_OPTIONS: Record<string, string[]> = {
  spread: ["home", "away"],
  moneyline: ["home", "away"],
  over: ["over"],
  under: ["under"],
  player_prop: ["over", "under", "yes", "no"],
};
// Every status a parlay can hold, so the Data Editor's dropdown always shows
// the real one. It used to leave out the first and the two sportsbook states,
// and a parlay in any of them showed a blank dropdown.
const STATUSES = ["draft", "pending", "approved", "sent", "placed", "rejected", "win", "loss", "push", "void"] as const;
const STATUS_LABELS: Record<string, string> = { draft: "Open (draft)" };
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
// A parlay must be decided (not "Open"/pending, not rejected or void) before it
// can be cloned — cloning is meant to reuse a settled parlay's picks as a
// starting point, not fork one that's still in progress.
const CLONEABLE_STATUSES = ["approved", "win", "loss", "push"];

export type LegFormState = {
  gameId?: number | null;
  betType: string;
  pick: string;
  line: string;
  odds: string;
  oddsSource: string;
  result: string;
  playerName: string;
  propType: string;
  gameSegment: string;
  notes: string;
};

export const blankLeg = (): LegFormState => ({
  gameId: null, betType: "spread", pick: "home", line: "", odds: "", oddsSource: "",
  result: "", playerName: "", propType: "", gameSegment: "", notes: "",
});

export function legToForm(leg: ParlayLeg): LegFormState {
  return {
    gameId: leg.gameId ?? null,
    betType: leg.betType ?? "spread",
    pick: leg.pick ?? "home",
    line: leg.line?.toString() ?? "",
    odds: leg.odds?.toString() ?? "",
    oddsSource: leg.oddsSource ?? "",
    result: leg.result ?? "",
    playerName: leg.playerName ?? "",
    propType: leg.propType ?? "",
    gameSegment: leg.gameSegment ?? "",
    notes: leg.notes ?? "",
  };
}

const ODDS_SOURCES = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "Fanatics", "Other"];

type LegSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial: LegFormState;
  onSave: (form: LegFormState) => void;
  isSaving: boolean;
};

export function LegSheet({ open, onOpenChange, title, initial, onSave, isSaving }: LegSheetProps) {
  const [form, setForm] = useState<LegFormState>(initial);
  const set = (k: keyof LegFormState) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bet Type</Label>
            <Select value={form.betType} onValueChange={v => { set("betType")(v); set("pick")(PICK_OPTIONS[v]?.[0] ?? "home"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BET_TYPES.map(t => <SelectItem key={t} value={t}>{t === "player_prop" ? "Player Prop" : t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.betType === "player_prop" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Player Name</Label>
                <Input className="h-9" value={form.playerName} onChange={e => set("playerName")(e.target.value)} placeholder="e.g. Travis Kelce" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Prop Type</Label>
                <Select value={form.propType} onValueChange={set("propType")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select prop type" /></SelectTrigger>
                  <SelectContent>
                    {PLAYER_PROP_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pick</Label>
            <Select value={form.pick} onValueChange={set("pick")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(PICK_OPTIONS[form.betType] ?? ["home", "away", "over", "under", "yes", "no"]).map(p => (
                  <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Line</Label>
              <Input className="h-9" value={form.line} onChange={e => set("line")(e.target.value)} placeholder="e.g. 4.5" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Odds</Label>
              <Input className="h-9" value={form.odds} onChange={e => set("odds")(e.target.value)} placeholder="e.g. -110" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bookmaker</Label>
            <Input
              className="h-9"
              list="odds-source-options"
              value={form.oddsSource}
              onChange={e => set("oddsSource")(e.target.value)}
              placeholder="e.g. DraftKings"
            />
            <datalist id="odds-source-options">
              {ODDS_SOURCES.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Result</Label>
            <Select value={form.result || "__none"} onValueChange={v => set("result")(v === "__none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {RESULTS.filter(Boolean).map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Game Segment</Label>
            <Input className="h-9" value={form.gameSegment} onChange={e => set("gameSegment")(e.target.value)} placeholder="e.g. 1H, 2H" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea className="min-h-[64px] text-sm" value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="Optional notes…" />
          </div>
        </div>

        <SheetFooter>
          <Button className="w-full" onClick={() => onSave(form)} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export type ParlayCardProps = {
  parlay: ParlayWithLegs;
  leagueId: number;
  /** League members, used to populate the editable "Bet Owner" dropdown. */
  members?: LeagueMemberWithUser[];
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  /** Cross-parlay leg-level selection mode for bulk-editing legs (distinct from parlay-level selectMode). */
  legSelectMode?: boolean;
  selectedLegIds?: Set<number>;
  onToggleLegSelect?: (legId: number) => void;
  collapseSignal?: number;
  expandSignal?: number;
  versionNumber?: number;
  /** When true, hides all admin edit/delete/status/fetch controls — display-only rollup. */
  readOnly?: boolean;
  /** 0-1 share of the league that submitted a parlay for this parlay's week — drives color boldness. */
  participationRate?: number;
  /** League's chosen name for whoever busts a loss first: a key of LOSER_LABEL_TEXT (shared/leagueLabels.ts). */
  loserLabel?: string | null;
  /** League's chosen name for whoever's winning leg is decided last: a key of HERO_LABEL_TEXT. */
  heroLabel?: string | null;
  /** The league's own emoji for its shame report, if it set one. */
  shameEmoji?: string | null;
  /** When provided (readOnly views only), shows a "copy bet slip" button in the header. */
  onCopySlip?: (parlay: ParlayWithLegs) => void;
  /** Id of the parlay whose slip was most recently copied — swaps the copy icon to a checkmark. */
  copiedId?: number | null;
  /** Mount already expanded instead of the default collapsed state — e.g. a drill-down dialog. */
  defaultExpanded?: boolean;
  /** The viewer is the league's Parlay Maestro: on a read-only card they can
   * still set the promo boost on someone else's parlay (an owner always can
   * on their own). */
  canManage?: boolean;
};

/** The understated label over each slate's legs: "SUNDAY EARLY SLATE". */
function SlateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <span className="h-px flex-1 bg-white/5" />
    </div>
  );
}

function logStatus(log: EnrichLog) {
  if (log.errors.length > 0) return "error";
  if (log.warnings.length > 0) return "warn";
  return "ok";
}

function LegLogPanel({ log, onClose }: { log: EnrichLog; onClose: () => void }) {
  const status = logStatus(log);
  return (
    <div className={cn(
      "rounded-md border p-3 text-xs space-y-2 mt-1",
      status === "error" ? "border-destructive/40 bg-destructive/10" :
      status === "warn"  ? "border-yellow-500/40 bg-yellow-500/10" :
                           "border-green-500/40 bg-green-500/10"
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-muted-foreground">
          Data fetch — {new Date(log.at).toLocaleString("en-US")}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs underline shrink-0">
          Close
        </button>
      </div>
      {log.changes.length > 0 && (
        <ul className="space-y-0.5">
          {log.changes.map((c, i) => (
            <li key={i} className="text-foreground/80 flex gap-1.5 items-start">
              <span className="shrink-0 text-green-400 mt-0.5">›</span>{c}
            </li>
          ))}
        </ul>
      )}
      {log.warnings.length > 0 && (
        <ul className="space-y-0.5">
          {log.warnings.map((w, i) => (
            <li key={i} className="text-yellow-400 flex gap-1.5 items-start">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
            </li>
          ))}
        </ul>
      )}
      {log.errors.length > 0 && (
        <ul className="space-y-0.5">
          {log.errors.map((e, i) => (
            <li key={i} className="text-destructive flex gap-1.5 items-start">
              <XCircle className="w-3 h-3 shrink-0 mt-0.5" />{e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const ParlayRollupCard = memo(function ParlayRollupCard({
  parlay, leagueId, members,
  selectMode = false, isSelected = false, onToggleSelect = () => {},
  legSelectMode = false, selectedLegIds, onToggleLegSelect = () => {},
  collapseSignal = 0, expandSignal = 0, versionNumber, readOnly = false, canManage = false,
  participationRate = 1, loserLabel = "parlay_loser", heroLabel = "parlay_hero", shameEmoji,
  onCopySlip, copiedId = null, defaultExpanded = false,
}: ParlayCardProps) {
  const deleteParlay = useDeleteParlay(leagueId);
  const deleteLeg = useDeleteParlayLeg(leagueId);
  const updateLeg = useUpdateParlayLeg(leagueId);
  const updateStatus = useUpdateParlayStatus(leagueId);
  const addLeg = useAddParlayLeg(leagueId);
  const enrichLeg = useEnrichParlayLeg(leagueId);
  const recalcParlay = useRecalcParlay(leagueId);
  const cloneParlay = useCloneParlay(leagueId);
  const effectiveUserId = useEffectiveUserId();
  const { toast } = useToast();

  const handleLegOwnerChange = (leg: ParlayLeg & { game?: any }, newUserId: string) => {
    if (newUserId === leg.userId) return;
    const conflict = parlay.legs.some(l => l.id !== leg.id && l.userId === newUserId);
    if (conflict) {
      toast({ title: "Cannot reassign", description: "This member already has a leg in this parlay.", variant: "destructive" });
      return;
    }
    updateLeg.mutate({ legId: leg.id, updates: { userId: newUserId } });
  };

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLegId, setDeleteLegId] = useState<number | null>(null);
  const [editLeg, setEditLeg] = useState<(ParlayLeg & { game?: any }) | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [enrichResults, setEnrichResults] = useState<Record<number, EnrichLog>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [fetchAllState, setFetchAllState] = useState<{ running: boolean; done: number; total: number; errors: number } | null>(null);
  // Whichever of Collapse All / Expand All was pressed last (the signals
  // share one counter — see nextBulkSignal), or null if neither has been.
  // Read at mount too: a virtualized list mounts cards as they scroll into
  // view, long after the button was pressed.
  const bulkCollapsed = collapseSignal === expandSignal ? null : collapseSignal > expandSignal;
  const [collapsed, setCollapsed] = useState(bulkCollapsed ?? !defaultExpanded);
  React.useEffect(() => { if (bulkCollapsed != null) setCollapsed(bulkCollapsed); }, [collapseSignal, expandSignal]);
  const [boostOpen, setBoostOpen] = useState(false);
  const setBoost = useSetParlayBoost();
  const boostEditable = !selectMode && (canManage || !readOnly || parlay.userId === effectiveUserId);
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState<Set<number>>(new Set());
  const splitLegs = useSplitParlayLegs(leagueId);

  const toggleSplitLeg = (legId: number) =>
    setSplitSelected(prev => { const n = new Set(prev); n.has(legId) ? n.delete(legId) : n.add(legId); return n; });

  const exitSplitMode = () => { setSplitMode(false); setSplitSelected(new Set()); };

  const handleFetchAll = async () => {
    const legs = parlay.legs.filter(l => !l.result);
    if (legs.length === 0) return;
    setFetchAllState({ running: true, done: 0, total: legs.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < legs.length; i++) {
      try {
        const log = await enrichLeg.mutateAsync(legs[i].id);
        setEnrichResults(r => ({ ...r, [legs[i].id]: log }));
      } catch {
        errors++;
      }
      setFetchAllState({ running: i < legs.length - 1, done: i + 1, total: legs.length, errors });
    }
  };

  const memberName = getDisplayName(parlay.user, `User #${shortId(parlay.userId)}`);
  const bustedLeg = getBustedLeg(parlay);
  const loserLabelText = loserLabelFor(loserLabel);
  const heroLeg = getHeroLeg(parlay);
  const heroLabelText = heroLabelFor(heroLabel);
  const heroMemberName = heroLeg?.user
    ? getDisplayName(heroLeg.user, `User #${shortId(heroLeg.userId)}`)
    : memberName;
  // The loser is whoever placed the leg that lost first, not whoever started
  // the parlay (which used to name the same person on every loss).
  const loserMemberName = bustedLeg
    ? getDisplayName(bustedLeg.user, `User #${shortId(bustedLeg.userId)}`)
    : memberName;

  // A settled parlay from the season being played has a report: the Shame
  // Report if it lost, The Locks Report if it won. Built on demand, when
  // it's opened.
  const { data: allWeeks } = useWeeks();
  const thisSeason = canShameSeason(parlay.week?.season, allWeeks?.find(w => w.isActive)?.season);
  const canShame = !!bustedLeg && thisSeason;
  const canLocks = !!heroLeg && thisSeason;
  const [shameOpen, setShameOpen] = useState(false);
  const story = shameOpen
    ? buildParlayStory({
        legs: parlay.legs,
        bustedLegId: bustedLeg?.id,
        heroLegId: heroLeg?.id,
        nameOf: (l) => getDisplayName(l.user, `User #${shortId(l.userId)}`),
        weekLabel: parlay.week?.label ?? `Week ${parlay.weekId}`,
        loserLabel,
        heroLabel,
        shameEmoji,
      })
    : null;

  // Slate the parlay was decided in: the decisive leg's game — the leg that
  // killed the parlay (bustedLeg) for a loss, or the leg that clinched it
  // last (heroLeg) for a win. getSlate buckets by kickoff time, not finish
  // time, so this must use the leg's game.gameTime (same as the per-leg
  // Slate column below), not decidedAt/finishedAt.
  const decisiveLeg = bustedLeg ?? heroLeg;
  const decidedSlate = decisiveLeg?.game?.gameTime ? getSlate(new Date(decisiveLeg.game.gameTime)) : null;

  // Until a game kicks off, legs are listed in the order they were picked.
  // After that they follow the week: settled legs by when they were decided,
  // legs still to play by kickoff (shared/legOrder.ts).
  const sortedLegs = sortParlayLegs(parlay);
  // The legs under a quiet label per slate, earliest slate first. Inside a
  // slate they keep the order above.
  const slateGroups = groupLegsBySlate(sortedLegs);
  const orderedLegs = slateGroups.flatMap(g => g.legs);
  const slateStartingAt = new Map(slateGroups.map(g => [g.legs[0].id, g.label]));
  // Plain viewing (no editing or selecting): a phone-width screen gets two
  // lines per leg instead of a table it has to scroll sideways.
  const compactOnPhone = readOnly && !selectMode && !splitMode && !legSelectMode;

  return (
    <>
      {(() => {
        const _wins     = parlay.legs.filter(l => l.result === "win").length;
        const _losses   = parlay.legs.filter(l => l.result === "loss").length;
        const _pushes   = parlay.legs.filter(l => l.result === "push").length;
        const _resolved = _wins + _losses + _pushes;
        const _pct      = _resolved > 0 ? Math.round((_wins / _resolved) * 100) : 0;
        const _perfect  = _pct === 100 && _resolved > 0;
        // Until a leg is decided there's no win % to color by, so an open
        // parlay shows its status instead (pending vs. active).
        const _visual   = (_resolved === 0 ? getOpenParlayVisualStyle(parlay.status) : null)
          ?? getParlayVisualStyle(_resolved > 0 ? _pct : null, participationRate);

        return (
          <Card
            className={cn(
              "border transition-all duration-500",
              selectMode && isSelected ? "border-primary/60 bg-primary/5" : "bg-card/50",
              selectMode && "cursor-pointer"
            )}
            style={selectMode && isSelected ? undefined : {
              borderColor: _visual.borderColor,
              boxShadow: _visual.boxShadow,
              backgroundImage: _visual.tint ? `linear-gradient(${_visual.tint}, ${_visual.tint})` : undefined,
            }}
            onClick={selectMode ? () => onToggleSelect(parlay.id) : undefined}
          >
            <CardHeader className="relative overflow-hidden pb-3">
              {/* ── Progress bar background ────────────────────────── */}
              {_pct > 0 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-0 left-0 pointer-events-none transition-all duration-700 ease-out",
                    _perfect && "animate-pulse"
                  )}
                  style={{
                    width: `${_pct}%`,
                    background: _visual.barGradient,
                  }}
                />
              )}
          <div className="flex flex-wrap items-center gap-3 relative z-10">
            {/* Checkbox in select mode */}
            {selectMode && (
              <div className="text-primary" onClick={e => { e.stopPropagation(); onToggleSelect(parlay.id); }}>
                {isSelected
                  ? <CheckSquare className="w-5 h-5" />
                  : <Square className="w-5 h-5 text-muted-foreground" />}
              </div>
            )}

            <button
              className="mr-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
              title={collapsed ? "Expand" : "Collapse"}
            >
              <ChevronRight className={cn("w-4 h-4 transition-transform duration-150", !collapsed && "rotate-90")} />
            </button>

            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground text-sm shrink-0 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {parlay.week?.label ?? `Week ${parlay.weekId}`}
                </span>
                {versionNumber !== undefined && (
                  <span className="text-xs text-primary/70 shrink-0 font-medium">v{versionNumber}</span>
                )}
                {collapsed && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal text-muted-foreground border-white/15">
                    {parlay.legs.length} leg{parlay.legs.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {isParlayInProgress(parlay) && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal w-fit border-sky-400/40 text-sky-300" data-testid={`badge-in-progress-${parlay.id}`}>
                  In Progress
                </Badge>
              )}
              {bustedLeg || heroLeg ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {readOnly && parlay.status === "win" && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal shrink-0 border-green-500/40 text-green-400">
                      Win
                    </Badge>
                  )}
                  {bustedLeg && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal shrink-0 border-destructive/40 text-destructive">
                      {loserLabelText}: {loserMemberName}
                    </Badge>
                  )}
                  {heroLeg && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal shrink-0 border-emerald-500/40 text-emerald-400">
                      {heroLabelText}: {heroMemberName}
                    </Badge>
                  )}
                  {decidedSlate && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal shrink-0 border-white/15 text-muted-foreground gap-1">
                      <Clock className="w-3 h-3" />
                      {decidedSlate}
                    </Badge>
                  )}
                </div>
              ) : (
                readOnly && parlay.status === "win" && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal w-fit border-green-500/40 text-green-400">
                    Win
                  </Badge>
                )
              )}
            </div>

            {/* ── Parlay leg stats summary ─────────────────────── */}
            {(() => {
              const { pct, label } = legTally(parlay.legs);
              const fractionColor = pct === null ? undefined : (() => {
                const [r, g, b] = getWinPctColor(pct);
                return `rgb(${r}, ${g}, ${b})`;
              })();
              return (
                <div className="flex items-center gap-1.5 text-xs shrink-0" onClick={e => e.stopPropagation()}>
                  <span
                    className={cn("font-semibold tabular-nums", pct === null && "text-muted-foreground/50")}
                    style={fractionColor ? { color: fractionColor } : undefined}
                  >
                    {label}
                  </span>
                </div>
              );
            })()}

            {/* Promo boost: shown when set, and a way in for whoever can set it
                — at any status, since boosts are often recorded after the fact. */}
            {parlay.status !== "void" && (parlay.boostPct || boostEditable) && (
              <button
                type="button"
                disabled={!boostEditable}
                onClick={e => { e.stopPropagation(); setBoostOpen(true); }}
                title={parlay.boostPct
                  ? `Parlay Boost: ${boostLabel(parlay.boostPct)}${boostEditable ? " (click to change)" : ""}`
                  : "Add a Parlay Boost"}
                aria-label={parlay.boostPct ? `Parlay Boost: ${boostLabel(parlay.boostPct)}` : "Add a Parlay Boost"}
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors",
                  parlay.boostPct
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                    : "border-dashed border-white/15 text-muted-foreground/70",
                  boostEditable && "hover:border-amber-400/60 hover:text-amber-200",
                )}
                data-testid={`button-parlay-boost-${parlay.id}`}
              >
                🚀
              </button>
            )}

            <span className={cn(
              "text-xs italic shrink-0 hidden sm:inline-flex items-center gap-1 whitespace-nowrap",
              parlay.user ? "text-muted-foreground/50" : "text-amber-400"
            )}>
              {!parlay.user && (
                <span title="Owner record missing — this parlay may need cleanup (often left over from an import)">
                  <AlertTriangle className="w-3 h-3" aria-label="Owner record missing" />
                </span>
              )}
              (Started by {memberName})
            </span>

            {canShame && !selectMode && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShameOpen(true); }}
                title="Shame report"
                aria-label="Open the shame report"
                className="p-1.5 rounded-md text-muted-foreground hover:text-red-300 hover:bg-white/10 transition-colors shrink-0"
                data-testid={`button-shame-report-${parlay.id}`}
              >
                <Megaphone className="w-3.5 h-3.5" />
              </button>
            )}
            {canLocks && !selectMode && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShameOpen(true); }}
                title="The Locks Report"
                aria-label="Open The Locks Report"
                className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-300 hover:bg-white/10 transition-colors shrink-0"
                data-testid={`button-locks-report-${parlay.id}`}
              >
                <LockKeyhole className="w-3.5 h-3.5" />
              </button>
            )}

            {readOnly && onCopySlip && isParlayLocked(parlay) && (
              <button
                onClick={e => { e.stopPropagation(); onCopySlip(parlay); }}
                title="Copy bet slip (locked parlays only)"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
              >
                {copiedId === parlay.id
                  ? <Check className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}

            {!readOnly && !selectMode && (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <Select
                  value={parlay.status ?? "pending"}
                  onValueChange={v => updateStatus.mutate({ parlayId: parlay.id, status: v })}
                >
                  <SelectTrigger className={cn("h-7 text-xs border px-2 py-0 w-28", statusColor(parlay.status))}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Parlay-level fetch all button — only when legs without results exist */}
                {parlay.legs.some(l => !l.result) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Fetch results for all legs"
                    disabled={fetchAllState?.running}
                    className={cn(
                      "h-7 px-2 gap-1 text-xs",
                      fetchAllState && !fetchAllState.running
                        ? fetchAllState.errors > 0 && fetchAllState.errors === fetchAllState.total
                          ? "text-destructive"
                          : fetchAllState.errors > 0
                            ? "text-yellow-400"
                            : "text-green-400"
                        : "text-muted-foreground hover:text-primary"
                    )}
                    onClick={handleFetchAll}
                  >
                    {fetchAllState?.running ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudDownload className="w-3.5 h-3.5" />
                    )}
                    {fetchAllState
                      ? fetchAllState.running
                        ? `${fetchAllState.done}/${fetchAllState.total}`
                        : fetchAllState.errors > 0
                          ? `${fetchAllState.done - fetchAllState.errors}/${fetchAllState.total} ok`
                          : `${fetchAllState.total}/${fetchAllState.total}`
                      : "All"
                    }
                  </Button>
                )}

                {/* Regrades every leg, results already set included. Used rarely,
                    so the whole-parlay pull is fine. */}
                {parlay.legs.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Recalc parlay: pull fresh data and regrade every leg"
                    disabled={recalcParlay.isPending}
                    className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => recalcParlay.mutate(parlay.id, {
                      onSuccess: ({ logs }) => setEnrichResults(r => ({ ...r, ...logs })),
                    })}
                    data-testid={`button-recalc-parlay-${parlay.id}`}
                  >
                    {recalcParlay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Recalc
                  </Button>
                )}

                {/* Split mode toggle */}
                {parlay.legs.length >= 2 && !splitMode && !legSelectMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Split legs into a new parlay"
                    className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => setSplitMode(true)}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Split
                  </Button>
                )}
                {splitMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={exitSplitMode}
                  >
                    Cancel Split
                  </Button>
                )}

                {CLONEABLE_STATUSES.includes(parlay.status ?? "") && !splitMode && !legSelectMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Clone into this week's parlay"
                    className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-primary"
                    disabled={cloneParlay.isPending}
                    onClick={() => cloneParlay.mutate(parlay.id)}
                  >
                    {cloneParlay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    Clone
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* This card's own expand/collapse, next to the page-wide controls */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
              title={collapsed ? "Expand this card" : "Collapse this card"}
              aria-expanded={!collapsed}
              onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
              data-testid={`button-toggle-card-${parlay.id}`}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{collapsed ? "Expand" : "Collapse"}</span>
            </Button>
          </div>
          {/* Bet-type mix stays visible when collapsed — it's the at-a-glance summary. */}
          <div className="mt-3 relative z-10">
            <ParlayMixBar legs={parlay.legs} />
          </div>
        </CardHeader>

        {!collapsed && <CardContent className="pt-0" onClick={e => selectMode && e.stopPropagation()}>
          {parlay.legs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No legs yet.</p>
          ) : (
            <>
            {compactOnPhone && (
              <div className="sm:hidden rounded-lg border border-white/5" data-testid={`legs-compact-${parlay.id}`}>
                {slateGroups.map(group => (
                  <div key={group.key}>
                    <SlateDivider label={group.label} />
                    {group.legs.map(leg => (
                      <div key={leg.id} className="border-t border-white/5 px-3 py-2" data-testid={`row-leg-compact-${leg.id}`}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="max-w-[28%] shrink-0 truncate text-xs font-bold text-muted-foreground">
                            {leg.user ? getDisplayName(leg.user, "Member") : "Unknown"}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{legLookthroughLabel(leg, leg.game)}</span>
                          <span className="shrink-0 text-xs font-semibold">
                            <ParlayLegResultBadge leg={leg} game={leg.game} />
                          </span>
                          {leg.userId === effectiveUserId && <DisputeLegDialog legId={leg.id} />}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {legContextLine(parlay.week, leg.game, leg.game?.gameTime ? kickoffTimeLabel(leg.game.gameTime) : null) || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className={cn("rounded-lg border border-white/5 overflow-x-auto", compactOnPhone && "hidden sm:block")}>
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-xs">
                    {(splitMode || legSelectMode) && <th className="px-3 py-2 w-8" />}
                    <th className="text-left px-3 py-2 font-medium">Bet Owner</th>
                    <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Pick</th>
                    <th className="text-left px-3 py-2 font-medium">Line</th>
                    <th className="text-left px-3 py-2 font-medium">Odds</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Kickoff</th>
                    <th className="text-left px-3 py-2 font-medium">Result</th>
                    <th className="px-2 py-2 w-8" />
                    <th className="px-2 py-2 w-8" />
                    {!readOnly && !selectMode && !splitMode && !legSelectMode && <th className="px-2 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {orderedLegs.map((leg, i) => {
                    const liveLog = enrichResults[leg.id];
                    const storedLog: EnrichLog | null = (() => {
                      try { return leg.enrichmentLog ? JSON.parse(leg.enrichmentLog) : null; } catch { return null; }
                    })();
                    const activeLog = liveLog ?? storedLog;
                    const isExpanded = expandedLogs[leg.id] ?? false;
                    const isFetching = enrichLeg.isPending && enrichLeg.variables === leg.id;
                    const logIcon = activeLog
                      ? logStatus(activeLog) === "error" ? <XCircle className="w-3 h-3 text-destructive" />
                        : logStatus(activeLog) === "warn" ? <AlertTriangle className="w-3 h-3 text-yellow-400" />
                        : <CheckCircle2 className="w-3 h-3 text-green-400" />
                      : null;

                    return (
                      <React.Fragment key={leg.id}>
                        {slateStartingAt.has(leg.id) && (
                          <tr>
                            <td colSpan={20} className="p-0"><SlateDivider label={slateStartingAt.get(leg.id)!} /></td>
                          </tr>
                        )}
                        <tr
                          className={cn(
                            "border-t border-white/5",
                            i % 2 === 1 && "bg-muted/10",
                            splitMode && "cursor-pointer hover:bg-primary/5",
                            splitMode && splitSelected.has(leg.id) && "bg-primary/10",
                            legSelectMode && "cursor-pointer hover:bg-primary/5",
                            legSelectMode && selectedLegIds?.has(leg.id) && "bg-primary/10",
                            leg.game?.isFinished && !leg.result && "bg-amber-500/10",
                            parlay.status === "win" && "bg-green-500/10"
                          )}
                          onClick={splitMode ? () => toggleSplitLeg(leg.id) : legSelectMode ? () => onToggleLegSelect(leg.id) : undefined}
                        >
                          {splitMode && (
                            <td className="px-3 py-2 w-8">
                              <div className="text-primary">
                                {splitSelected.has(leg.id)
                                  ? <CheckSquare className="w-4 h-4" />
                                  : <Square className="w-4 h-4 text-muted-foreground" />}
                              </div>
                            </td>
                          )}
                          {legSelectMode && (
                            <td className="px-3 py-2 w-8">
                              <div className="text-primary">
                                {selectedLegIds?.has(leg.id)
                                  ? <CheckSquare className="w-4 h-4" />
                                  : <Square className="w-4 h-4 text-muted-foreground" />}
                              </div>
                            </td>
                          )}
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap" onClick={e => { if (!legSelectMode) e.stopPropagation(); }}>
                            <div className="flex items-center gap-1">
                              {!leg.user && (
                                <span
                                  className="shrink-0"
                                  title="Owner record missing — this leg may need cleanup (often left over from an import)"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-400" aria-label="Owner record missing" />
                                </span>
                              )}
                              {!readOnly && !selectMode && !splitMode && !legSelectMode && members ? (
                                <Select value={leg.userId ?? undefined} onValueChange={v => handleLegOwnerChange(leg, v)}>
                                  <SelectTrigger className={cn("h-6 text-xs w-auto max-w-[9rem] px-1.5 py-0 border-none bg-transparent hover:bg-white/5", !leg.user && "text-amber-400")}>
                                    <SelectValue placeholder="Unknown" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {members.map(m => {
                                      // A member who already owns a different leg in this parlay
                                      // can't take on a second one — hide instead of letting the
                                      // save fail server-side.
                                      const takenByAnother = m.userId !== leg.userId && parlay.legs.some(l => l.id !== leg.id && l.userId === m.userId);
                                      if (takenByAnother) return null;
                                      return (
                                        <SelectItem key={m.userId} value={m.userId}>
                                          {getDisplayName(m.user, shortId(m.userId, 8))}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className={cn(!leg.user && "text-amber-400")}>
                                  {leg.user ? getDisplayName(leg.user, `User #${shortId(leg.userId)}`) : "Unknown Owner"}
                                </span>
                              )}
                              {leg.placedByUserId && leg.placedByUserId !== leg.userId && (() => {
                                const maker = members?.find(m => m.userId === leg.placedByUserId);
                                const by = maker ? getDisplayName(maker.user, "another member") : "another member";
                                return (
                                  <span
                                    className="shrink-0"
                                    title={leg.approvalStatus === "pending" ? `Picked by ${by} on their behalf. Waiting on approval.` : `Picked by ${by} on their behalf. Approved.`}
                                    data-testid={`icon-on-behalf-${leg.id}`}
                                  >
                                    <UserCheck className={cn("w-3 h-3", leg.approvalStatus === "pending" ? "text-amber-400" : "text-emerald-400")} aria-label="Picked on their behalf" />
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-medium truncate max-w-[160px] sm:max-w-[220px] lg:max-w-none">{legLabel(leg)}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{legPickColumnLabel(leg, leg.game)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{leg.line || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {withPlusSign(leg.odds) ?? "—"}
                            {leg.oddsSource && <span className="block text-[10px] text-muted-foreground/60">{leg.oddsSource}</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {leg.game?.gameTime
                              ? new Date(leg.game.gameTime).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "2-digit", day: "2-digit" })
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {leg.game?.gameTime
                              ? kickoffTimeLabel(leg.game.gameTime)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            <ParlayLegResultBadge leg={leg} game={leg.game} />
                          </td>
                          <td className="px-2 py-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  title="Debug info"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-auto text-xs font-mono space-y-1 p-3">
                                <div><span className="text-muted-foreground">parlay_id:</span> {parlay.id}</div>
                                <div><span className="text-muted-foreground">parlay_leg_id:</span> {leg.id}</div>
                                <div><span className="text-muted-foreground">game_id:</span> {leg.gameId ?? "—"}</div>
                                <div><span className="text-muted-foreground">user_id:</span> {leg.userId ?? "—"}</div>
                                <div><span className="text-muted-foreground">odds_source:</span> {leg.oddsSource ?? "—"}</div>
                                <div>
                                  <span className="text-muted-foreground">decided_at:</span>{" "}
                                  {(() => {
                                    const decided = leg.decidedAt ?? leg.game?.finishedAt;
                                    return decided ? new Date(decided).toLocaleString() : "—";
                                  })()}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                          <td className="px-2 py-2">
                            {leg.userId === effectiveUserId && !selectMode && !splitMode && !legSelectMode && (
                              <DisputeLegDialog legId={leg.id} />
                            )}
                          </td>
                          {!readOnly && !selectMode && !splitMode && !legSelectMode && (
                            <td className="px-2 py-2">
                              <div className="flex gap-1 items-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => setEditLeg(leg)}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title={leg.result ? "Refetch data and regrade this leg" : "Fetch historical data"}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                  disabled={isFetching}
                                  onClick={() => enrichLeg.mutate(leg.id, {
                                    onSuccess: (log) => {
                                      setEnrichResults(r => ({ ...r, [leg.id]: log }));
                                    },
                                  })}
                                >
                                  {isFetching
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <CloudDownload className="w-3 h-3" />}
                                </Button>
                                {activeLog && (
                                  <button
                                    title="View fetch log"
                                    className={cn(
                                      "text-[11px] font-medium leading-none px-1 py-0.5 rounded transition-colors",
                                      isExpanded
                                        ? "text-foreground bg-white/10"
                                        : "text-muted-foreground hover:text-foreground",
                                      logStatus(activeLog) === "error" && isExpanded && "text-destructive bg-destructive/10",
                                      logStatus(activeLog) === "warn" && isExpanded && "text-yellow-400 bg-yellow-400/10",
                                      logStatus(activeLog) === "ok" && isExpanded && "text-green-400 bg-green-400/10",
                                    )}
                                    onClick={() => setExpandedLogs(e => ({ ...e, [leg.id]: !e[leg.id] }))}
                                  >
                                    Logs
                                  </button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteLegId(leg.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {activeLog && isExpanded && (
                          <tr key={`log-${leg.id}`} className="border-t border-white/5">
                            <td colSpan={10} className="px-3 pb-3">
                              <LegLogPanel
                                log={activeLog}
                                onClose={() => setExpandedLogs(e => ({ ...e, [leg.id]: false }))}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {!readOnly && !selectMode && !splitMode && !legSelectMode && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs h-8"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Leg
            </Button>
          )}

          {splitMode && (
            <div className="mt-3 flex items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">
                {splitSelected.size === 0
                  ? "Click legs to select which ones to split off into a new parlay"
                  : splitSelected.size === parlay.legs.length
                    ? "Can't split all legs — deselect at least one to keep in the original"
                    : `${splitSelected.size} leg${splitSelected.size !== 1 ? "s" : ""} selected to split off`}
              </p>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0"
                disabled={splitSelected.size === 0 || splitSelected.size === parlay.legs.length || splitLegs.isPending}
                onClick={() => splitLegs.mutate(
                  { parlayId: parlay.id, legIds: [...splitSelected] },
                  { onSuccess: exitSplitMode }
                )}
              >
                {splitLegs.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Scissors className="w-3.5 h-3.5" />}
                Split into new parlay
              </Button>
            </div>
          )}
        </CardContent>}
          </Card>
        );
      })()}

      {/* Outside the admin-only block below: read-only cards open these too. */}
      {story && (
        <ShameReportDialog story={story} open={shameOpen} onOpenChange={setShameOpen} />
      )}

      <BoostDialog
        open={boostOpen}
        onOpenChange={setBoostOpen}
        initialPct={parlay.boostPct}
        isSaving={setBoost.isPending}
        onConfirm={(boostPct) =>
          setBoost.mutate({ parlayId: parlay.id, boostPct }, { onSuccess: () => setBoostOpen(false) })
        }
      />

      {!readOnly && (
        <>
          {/* Edit Leg Sheet */}
          {editLeg && (
            <LegSheet
              key={editLeg.id}
              open={!!editLeg}
              onOpenChange={v => { if (!v) setEditLeg(null); }}
              title={`Edit Leg — ${legLabel(editLeg)}`}
              initial={legToForm(editLeg)}
              isSaving={updateLeg.isPending}
              onSave={form => {
                updateLeg.mutate(
                  { legId: editLeg.id, updates: { ...form, result: form.result || null, line: form.line || null, odds: form.odds || null, playerName: form.playerName || null, propType: form.propType || null, gameSegment: form.gameSegment || null, notes: form.notes || null } },
                  { onSuccess: () => setEditLeg(null) }
                );
              }}
            />
          )}

          {/* Add Leg Sheet */}
          <LegSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            title="Add New Leg"
            initial={blankLeg()}
            isSaving={addLeg.isPending}
            onSave={form => {
              addLeg.mutate(
                { parlayId: parlay.id, leg: { ...form, result: form.result || null, line: form.line || null, odds: form.odds || null, playerName: form.playerName || null, propType: form.propType || null, gameSegment: form.gameSegment || null, notes: form.notes || null } },
                { onSuccess: () => setAddOpen(false) }
              );
            }}
          />

          {/* Delete Parlay Confirm */}
          <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this parlay?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{memberName}</strong>'s parlay for <strong>{parlay.week?.label ?? `Week ${parlay.weekId}`}</strong>, including all {parlay.legs.length} leg(s). This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={() => deleteParlay.mutate(parlay.id, { onSuccess: () => setDeleteConfirm(false) })}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Leg Confirm */}
          <AlertDialog open={deleteLegId !== null} onOpenChange={v => { if (!v) setDeleteLegId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this leg?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the selected leg from the parlay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={() => deleteLeg.mutate(deleteLegId!, { onSuccess: () => setDeleteLegId(null) })}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
});

export default ParlayRollupCard;
