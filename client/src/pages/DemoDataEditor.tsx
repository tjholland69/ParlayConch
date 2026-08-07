import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeagues, useAllLeagueParlays, useWeeks, useLeagueMembersWithUsers, useAddHistoricalParlay, useBulkUpdateParlayLegs, useMissingParlayMembers, useBackfillMissingParlays } from "@/hooks/use-bets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, FlaskConical, Trash2, Plus, Loader2, GitMerge, RefreshCw, FilePlus, ArrowUpDown, ListChecks, PencilLine, UserX } from "lucide-react";
import { PLAYER_PROP_TYPES, type ParlayWithLegs, type LeagueMemberWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ParlayRollupCard, LegSheet, blankLeg, BET_TYPES, RESULTS, type LegFormState } from "@/components/ParlayRollupCard";
import { CardErrorBoundary } from "@/components/CardErrorBoundary";
import { ExpandCollapseControls } from "@/components/ExpandCollapseControls";
import { getDisplayName, shortId, sortByFirstName } from "@/lib/displayName";

// ── Merge Dialog ──────────────────────────────────────────────────────────────

type MergeDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selected: ParlayWithLegs[];
  leagueId: number;
  onDone: () => void;
};

function MergeDialog({ open, onOpenChange, selected, leagueId, onDone }: MergeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState<string>("");

  const merge = useMutation({
    mutationFn: async ({ targetParlayId, sourceParlayIds }: { targetParlayId: number; sourceParlayIds: number[] }) => {
      await apiRequest("POST", `/api/leagues/${leagueId}/parlays/merge`, { targetParlayId, sourceParlayIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).includes("parlays") });
      toast({ title: "Parlays merged", description: `${selected.length - 1} parlay(s) folded into the target.` });
      onDone();
    },
    onError: (err: any) => {
      toast({ title: "Merge failed", description: err.message, variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    if (!targetId) return;
    const targetParlayId = Number(targetId);
    const sourceParlayIds = selected.map(p => p.id).filter(id => id !== targetParlayId);
    merge.mutate({ targetParlayId, sourceParlayIds });
  };

  const totalLegs = selected.reduce((sum, p) => sum + p.legs.length, 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!merge.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary" />
            Merge {selected.length} Parlays
          </DialogTitle>
          <DialogDescription>
            All legs from the other parlays will be moved into the one you keep. The rest will be deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col min-h-0 overflow-hidden">
          <p className="text-sm font-medium text-muted-foreground mb-3">Which parlay should be kept as the base?</p>
          <RadioGroup value={targetId} onValueChange={setTargetId} className="space-y-2 overflow-y-auto max-h-[40vh] pr-1">
            {selected.map(p => {
              const name = getDisplayName(p.user, `User #${shortId(p.userId)}`);
              const week = p.week?.label ?? `Week ${p.weekId}`;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    targetId === String(p.id)
                      ? "border-primary/60 bg-primary/5"
                      : "border-white/10 bg-card/30 hover:border-white/20"
                  )}
                >
                  <RadioGroupItem value={String(p.id)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{name} — {week}</p>
                    <p className="text-xs text-muted-foreground">{p.legs.length} leg{p.legs.length !== 1 ? "s" : ""} · Parlay #{p.id}</p>
                  </div>
                </label>
              );
            })}
          </RadioGroup>

          {targetId && (
            <p className="text-xs text-muted-foreground border border-white/10 rounded-lg p-3 bg-muted/20 mt-3">
              The selected parlay will receive all {totalLegs} leg{totalLegs !== 1 ? "s" : ""} combined.{" "}
              {selected.length - 1} parlay{selected.length - 1 !== 1 ? "s" : ""} will be deleted.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!targetId || merge.isPending}>
            {merge.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitMerge className="w-4 h-4 mr-2" />}
            Merge Parlays
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Edit Legs Dialog ───────────────────────────────────────────────────────

const BULK_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "result", label: "Result" },
  { value: "betType", label: "Bet Type" },
  { value: "pick", label: "Pick" },
  { value: "line", label: "Line" },
  { value: "odds", label: "Odds" },
  { value: "gameSegment", label: "Game Segment" },
  { value: "playerName", label: "Player Name" },
  { value: "propType", label: "Prop Type" },
  { value: "notes", label: "Notes" },
  { value: "userId", label: "Owner" },
];

type BulkEditLegsDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leagueId: number;
  legIds: number[];
  members: LeagueMemberWithUser[];
  allParlays: ParlayWithLegs[];
  onDone: () => void;
};

function BulkEditLegsDialog({ open, onOpenChange, leagueId, legIds, members, allParlays, onDone }: BulkEditLegsDialogProps) {
  const [field, setField] = useState("result");
  const [value, setValue] = useState("");
  const bulkUpdate = useBulkUpdateParlayLegs(leagueId);

  const reset = () => { setField("result"); setValue(""); };

  // Members who already own a leg (outside the selection) in one of the
  // affected parlays — reassigning to them would fail server-side, so hide
  // them from the "Owner" picker rather than letting the bulk apply fail.
  const legIdSet = new Set(legIds);
  const affectedParlays = allParlays.filter(p => p.legs.some(l => legIdSet.has(l.id)));
  const unavailableOwnerIds = new Set(
    affectedParlays.flatMap(p => p.legs.filter(l => !legIdSet.has(l.id)).map(l => l.userId))
  );

  const handleApply = () => {
    bulkUpdate.mutate(
      { legIds, field, value: value || null },
      { onSuccess: () => { reset(); onDone(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!bulkUpdate.isPending) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="w-5 h-5 text-primary" />
            Bulk Edit {legIds.length} Leg{legIds.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Choose a field and a value to apply to every selected leg. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Select value={field} onValueChange={v => { setField(v); setValue(""); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULK_FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">New Value</Label>
            {field === "result" ? (
              <Select value={value || "__none"} onValueChange={v => setValue(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {RESULTS.filter(Boolean).map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : field === "betType" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select bet type" /></SelectTrigger>
                <SelectContent>
                  {BET_TYPES.map(t => <SelectItem key={t} value={t}>{t === "player_prop" ? "Player Prop" : t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : field === "propType" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select prop type" /></SelectTrigger>
                <SelectContent>
                  {PLAYER_PROP_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : field === "userId" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.filter(m => !unavailableOwnerIds.has(m.userId)).map(m => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {getDisplayName(m.user, shortId(m.userId, 8))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field === "notes" ? (
              <Textarea className="min-h-[64px] text-sm" value={value} onChange={e => setValue(e.target.value)} placeholder="Optional notes…" />
            ) : (
              <Input className="h-9" value={value} onChange={e => setValue(e.target.value)} placeholder={`New ${BULK_FIELD_OPTIONS.find(f => f.value === field)?.label.toLowerCase()}`} />
            )}
          </div>

          <p className="text-xs text-muted-foreground border border-white/10 rounded-lg p-3 bg-muted/20">
            This will overwrite the "{BULK_FIELD_OPTIONS.find(f => f.value === field)?.label}" field on all {legIds.length} selected leg{legIds.length !== 1 ? "s" : ""}.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkUpdate.isPending}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={(field !== "notes" && field !== "result" && !value) || bulkUpdate.isPending}>
            {bulkUpdate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PencilLine className="w-4 h-4 mr-2" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Historical Bet Sheet ───────────────────────────────────────────────────

type AddHistoricalBetSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leagueId: number;
  weeks: Array<{ id: number; season: number; weekNumber: number; label: string }>;
  members: Array<{ userId: string; user?: { firstName?: string | null; email?: string | null; settings?: unknown } | null }>;
};

function AddHistoricalBetSheet({ open, onOpenChange, leagueId, weeks, members }: AddHistoricalBetSheetProps) {
  const addHistorical = useAddHistoricalParlay(leagueId);
  const [userId, setUserId] = useState("");
  const [yearStr, setYearStr] = useState("");
  const [weekId, setWeekId] = useState("");
  const [legs, setLegs] = useState<LegFormState[]>([]);
  const [legSheetKey, setLegSheetKey] = useState(0);
  const [legSheetOpen, setLegSheetOpen] = useState(false);

  const seasons = [...new Set(weeks.map(w => w.season))].sort((a, b) => b - a);
  const visibleWeeks = yearStr ? weeks.filter(w => w.season === Number(yearStr)) : weeks;

  const reset = () => {
    setUserId(""); setYearStr(""); setWeekId(""); setLegs([]); setLegSheetOpen(false);
  };

  const openAddLeg = () => {
    setLegSheetKey(k => k + 1);
    setLegSheetOpen(true);
  };

  const handleSave = () => {
    addHistorical.mutate(
      { userId, weekId: Number(weekId), legs: legs.map(l => ({ ...l, result: l.result || null, line: l.line || null, odds: l.odds || null, playerName: l.playerName || null, propType: l.propType || null, gameSegment: l.gameSegment || null, notes: l.notes || null })) },
      { onSuccess: () => { reset(); onOpenChange(false); } }
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-primary" />
              Add Historical Bet
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-5 py-4">
            {/* Member */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Member</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {getDisplayName(m.user, shortId(m.userId, 8))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year + Week */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <Select value={yearStr} onValueChange={v => { setYearStr(v); setWeekId(""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    {seasons.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Week</Label>
                <Select value={weekId} onValueChange={setWeekId} disabled={!yearStr}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Week" /></SelectTrigger>
                  <SelectContent>
                    {visibleWeeks.map(w => <SelectItem key={w.id} value={String(w.id)}>Week {w.weekNumber}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Legs list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Legs</Label>
                {legs.length > 0 && (
                  <span className="text-xs text-muted-foreground">{legs.length} added</span>
                )}
              </div>

              {legs.length > 0 && (
                <div className="rounded-lg border border-white/10 divide-y divide-white/5">
                  {legs.map((leg, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0 font-mono">
                        {leg.betType === "player_prop" ? "PROP" : leg.betType.toUpperCase()}
                      </Badge>
                      <span className="text-sm flex-1 truncate text-muted-foreground">
                        {leg.betType === "player_prop"
                          ? `${leg.playerName || "Player Prop"}${leg.propType ? ` — ${PLAYER_PROP_TYPES.find(p => p.value === leg.propType)?.label ?? leg.propType}` : ""}`
                          : `${leg.pick}${leg.line ? ` ${leg.line}` : ""}`}
                      </span>
                      {leg.result && (
                        <Badge className={cn("text-xs px-1.5 py-0 shrink-0",
                          leg.result === "win" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          leg.result === "loss" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        )}>
                          {leg.result}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setLegs(prev => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5 border-dashed"
                onClick={openAddLeg}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Leg
              </Button>
            </div>
          </div>

          <SheetFooter className="pt-2">
            <Button
              className="w-full gap-2"
              disabled={!userId || !weekId || legs.length === 0 || addHistorical.isPending}
              onClick={handleSave}
            >
              {addHistorical.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FilePlus className="w-4 h-4" />}
              Save Parlay ({legs.length} leg{legs.length !== 1 ? "s" : ""})
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Nested sheet for adding individual legs */}
      <LegSheet
        key={legSheetKey}
        open={legSheetOpen}
        onOpenChange={setLegSheetOpen}
        title="Add Leg"
        initial={blankLeg()}
        isSaving={false}
        onSave={form => {
          setLegs(prev => [...prev, form]);
          setLegSheetOpen(false);
        }}
      />
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DemoDataEditor() {
  const [, params] = useRoute("/leagues/:id/demo-data");
  const leagueId = Number(params?.id);

  const queryClient = useQueryClient();
  const { data: leagues } = useLeagues();
  const league = leagues?.find(l => l.id === leagueId);

  const { data: allParlays, isLoading } = useAllLeagueParlays(leagueId);
  const { data: weeks } = useWeeks();
  const { data: membersRaw } = useLeagueMembersWithUsers(leagueId);
  const members = useMemo(() => membersRaw ? sortByFirstName(membersRaw) : membersRaw, [membersRaw]);

  const [yearFilter, setYearFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [addHistoricalOpen, setAddHistoricalOpen] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);
  const [sortBy, setSortBy] = useState("week-desc");
  const [legSelectMode, setLegSelectMode] = useState(false);
  const [selectedLegIds, setSelectedLegIds] = useState<Set<number>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Backfill only targets one concrete week — in "All Years" mode the week
  // filter can represent the same weekNumber across multiple season rows, so
  // require both Year and Week to be pinned down before it's actionable.
  const specificWeekId = yearFilter !== "all" && weekFilter !== "all" ? Number(weekFilter) : null;
  const { data: missingMembers } = useMissingParlayMembers(leagueId, specificWeekId);
  const backfillMissing = useBackfillMissingParlays(leagueId);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleLegSelect = (legId: number) => {
    setSelectedLegIds(prev => {
      const next = new Set(prev);
      if (next.has(legId)) next.delete(legId); else next.add(legId);
      return next;
    });
  };

  const exitLegSelectMode = () => {
    setLegSelectMode(false);
    setSelectedLegIds(new Set());
  };

  if (!league) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!league.isAdmin || !league.isDemo) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <p className="text-muted-foreground">The Data Editor is only available to admins of demo leagues.</p>
        <Link href={`/leagues/${leagueId}`}>
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Back to League</Button>
        </Link>
      </div>
    );
  }

  const seasons = [...new Set((weeks ?? []).map(w => w.season))].sort((a, b) => b - a);

  // "All Years" shows one Week N per distinct week number rather than once per
  // season — a league with 2 seasons of data would otherwise list "Week 1"
  // twice, etc. The selected value still points at one concrete week row; when
  // "All Years" is active, filtering below matches by weekNumber across every
  // season instead of that single row's id.
  const visibleWeeks = yearFilter === "all"
    ? Array.from(new Map((weeks ?? []).map(w => [w.weekNumber, w])).values()).sort((a, b) => a.weekNumber - b.weekNumber)
    : (weeks ?? []).filter(w => w.season === Number(yearFilter));

  const filtered = (allParlays ?? []).filter(p => {
    if (yearFilter !== "all" && p.week?.season !== Number(yearFilter)) return false;
    if (weekFilter !== "all") {
      if (yearFilter === "all") {
        const selectedWeekNumber = (weeks ?? []).find(w => String(w.id) === weekFilter)?.weekNumber;
        if (selectedWeekNumber !== undefined && p.week?.weekNumber !== selectedWeekNumber) return false;
      } else if (p.weekId !== Number(weekFilter)) {
        return false;
      }
    }
    if (memberFilter !== "all" && p.userId !== memberFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "week-desc":
        return (b.week?.season ?? 0) - (a.week?.season ?? 0) || (b.week?.weekNumber ?? 0) - (a.week?.weekNumber ?? 0) || b.id - a.id;
      case "week-asc":
        return (a.week?.season ?? 0) - (b.week?.season ?? 0) || (a.week?.weekNumber ?? 0) - (b.week?.weekNumber ?? 0) || a.id - b.id;
      case "member-asc": {
        const nameA = getDisplayName(a.user, "").toLowerCase();
        const nameB = getDisplayName(b.user, "").toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case "win-pct-desc": {
        const pct = (p: typeof a) => {
          const wins   = p.legs.filter(l => l.result === "win").length;
          const res    = p.legs.filter(l => !!l.result).length;
          return res > 0 ? wins / res : -1;
        };
        return pct(b) - pct(a);
      }
      case "pending-desc":
        return b.legs.filter(l => !l.result).length - a.legs.filter(l => !l.result).length;
      case "legs-desc":
        return b.legs.length - a.legs.length;
      default:
        return 0;
    }
  });

  const selectedParlays = filtered.filter(p => selectedIds.has(p.id));

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/leagues/${leagueId}`}>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-yellow-400" />
          <div>
            <h1 className="text-xl font-display font-bold leading-tight">Demo Data Editor</h1>
            <p className="text-muted-foreground text-sm">{league.name}</p>
          </div>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">DEMO ONLY</Badge>
        </div>
      </div>

      {/* Filters + Select toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0 text-muted-foreground">Year:</Label>
          <Select value={yearFilter} onValueChange={v => {
            setYearFilter(v);
            if (weekFilter === "all") return;
            if (v === "all") {
              // Re-point the selection at the deduped-by-weekNumber row so the
              // Select's current value still matches one of the new options.
              const currentWeekNumber = (weeks ?? []).find(w => String(w.id) === weekFilter)?.weekNumber;
              const representative = currentWeekNumber !== undefined
                ? (weeks ?? []).find(w => w.weekNumber === currentWeekNumber)
                : undefined;
              setWeekFilter(representative ? String(representative.id) : "all");
            } else {
              const weekStillValid = (weeks ?? []).some(w => String(w.id) === weekFilter && w.season === Number(v));
              if (!weekStillValid) setWeekFilter("all");
            }
          }}>
            <SelectTrigger className="w-28 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {seasons.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0 text-muted-foreground">Week:</Label>
          <Select value={weekFilter} onValueChange={setWeekFilter}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks</SelectItem>
              {visibleWeeks.map(w => (
                <SelectItem key={w.id} value={String(w.id)}>Week {w.weekNumber}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0 text-muted-foreground">Member:</Label>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              {members?.map(m => (
                <SelectItem key={m.userId} value={m.userId}>
                  {getDisplayName(m.user, shortId(m.userId, 8))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week-desc">Week (Newest First)</SelectItem>
              <SelectItem value="week-asc">Week (Oldest First)</SelectItem>
              <SelectItem value="member-asc">Member (A → Z)</SelectItem>
              <SelectItem value="win-pct-desc">Win % (Highest First)</SelectItem>
              <SelectItem value="pending-desc">Most Pending Legs</SelectItem>
              <SelectItem value="legs-desc">Most Legs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length} parlay{filtered.length !== 1 ? "s" : ""} shown
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'parlays', 'all'] })}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <ExpandCollapseControls
            className="flex items-center gap-2"
            onCollapseAll={() => setCollapseSignal(s => s + 1)}
            onExpandAll={() => setExpandSignal(s => s + 1)}
          />
          {selectMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={() => {
                  const allSelected = filtered.every(p => selectedIds.has(p.id));
                  if (allSelected) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filtered.map(p => p.id)));
                  }
                }}
              >
                {filtered.every(p => selectedIds.has(p.id)) ? "Deselect All" : "Select All"}
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exitSelectMode}>
                Cancel
              </Button>
            </>
          ) : legSelectMode ? (
            <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exitLegSelectMode}>
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm gap-1.5"
                onClick={() => setAddHistoricalOpen(true)}
              >
                <FilePlus className="w-4 h-4" />
                Add Bet
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-sm gap-1.5" onClick={() => setSelectMode(true)}>
                <GitMerge className="w-4 h-4" />
                Select &amp; Merge
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-sm gap-1.5" onClick={() => setLegSelectMode(true)}>
                <ListChecks className="w-4 h-4" />
                Select Legs
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No parlays found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const groupByUserWeek = new Map<string, number[]>();
            for (const p of sorted) {
              const key = `${p.userId}|${p.weekId}`;
              if (!groupByUserWeek.has(key)) groupByUserWeek.set(key, []);
              groupByUserWeek.get(key)!.push(p.id);
            }
            const versionMap = new Map<number, number>();
            for (const ids of groupByUserWeek.values()) {
              if (ids.length > 1) {
                [...ids].sort((a, b) => a - b).forEach((id, i) => versionMap.set(id, i + 1));
              }
            }
            const submittersByWeek = new Map<number, Set<string>>();
            for (const p of allParlays ?? []) {
              if (!submittersByWeek.has(p.weekId)) submittersByWeek.set(p.weekId, new Set());
              submittersByWeek.get(p.weekId)!.add(p.userId);
            }
            const memberCount = members?.length || 1;
            return sorted.map(parlay => (
              <CardErrorBoundary key={parlay.id} parlayId={parlay.id}>
                <ParlayRollupCard
                  parlay={parlay}
                  leagueId={leagueId}
                  members={members}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(parlay.id)}
                  onToggleSelect={toggleSelect}
                  legSelectMode={legSelectMode}
                  selectedLegIds={selectedLegIds}
                  onToggleLegSelect={toggleLegSelect}
                  collapseSignal={collapseSignal}
                  expandSignal={expandSignal}
                  versionNumber={versionMap.get(parlay.id)}
                  participationRate={(submittersByWeek.get(parlay.weekId)?.size ?? 0) / memberCount}
                  loserLabel={league.loserLabel}
                  heroLabel={league.heroLabel}
                />
              </CardErrorBoundary>
            ));
          })()}
        </div>
      )}

      {/* Sticky merge action bar */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none">
          <div className="pointer-events-auto bg-card border border-primary/30 shadow-2xl rounded-xl px-6 py-4 flex items-center gap-4 max-w-sm w-full mx-4">
            <div className="flex-1">
              <p className="font-semibold text-sm">{selectedIds.size} parlays selected</p>
              <p className="text-xs text-muted-foreground">
                {selectedParlays.reduce((s, p) => s + p.legs.length, 0)} total legs
              </p>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setMergeOpen(true)}>
              <GitMerge className="w-4 h-4" />
              Merge
            </Button>
          </div>
        </div>
      )}

      {/* Sticky bulk-edit action bar */}
      {legSelectMode && selectedLegIds.size >= 1 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none">
          <div className="pointer-events-auto bg-card border border-primary/30 shadow-2xl rounded-xl px-6 py-4 flex items-center gap-4 max-w-sm w-full mx-4">
            <div className="flex-1">
              <p className="font-semibold text-sm">{selectedLegIds.size} leg{selectedLegIds.size !== 1 ? "s" : ""} selected</p>
              <p className="text-xs text-muted-foreground">Across any visible parlay</p>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setBulkEditOpen(true)}>
              <PencilLine className="w-4 h-4" />
              Bulk Edit
            </Button>
          </div>
        </div>
      )}

      {/* Sticky backfill-missing action bar — only when a single concrete week
          is selected and some league members (as of that week) have no parlay */}
      {!selectMode && !legSelectMode && specificWeekId && !!missingMembers?.length && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none">
          <div className="pointer-events-auto bg-card border border-amber-500/30 shadow-2xl rounded-xl px-6 py-4 flex items-center gap-4 max-w-md w-full mx-4">
            <div className="flex-1">
              <p className="font-semibold text-sm">{missingMembers.length} member{missingMembers.length !== 1 ? "s" : ""} missing a parlay</p>
              <p className="text-xs text-muted-foreground truncate">
                {missingMembers.map(m => getDisplayName(m.user, shortId(m.userId, 8))).join(", ")}
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 shrink-0 border-amber-500/40 text-amber-400 hover:text-amber-300"
              disabled={backfillMissing.isPending}
              onClick={() => backfillMissing.mutate(specificWeekId)}
            >
              {backfillMissing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
              Backfill as Void
            </Button>
          </div>
        </div>
      )}

      {/* Merge dialog */}
      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        selected={selectedParlays}
        leagueId={leagueId}
        onDone={() => {
          setMergeOpen(false);
          exitSelectMode();
        }}
      />

      {/* Bulk Edit Legs dialog */}
      <BulkEditLegsDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        leagueId={leagueId}
        legIds={[...selectedLegIds]}
        members={members ?? []}
        allParlays={allParlays ?? []}
        onDone={() => {
          setBulkEditOpen(false);
          exitLegSelectMode();
        }}
      />

      {/* Add Historical Bet */}
      <AddHistoricalBetSheet
        open={addHistoricalOpen}
        onOpenChange={setAddHistoricalOpen}
        leagueId={leagueId}
        weeks={weeks ?? []}
        members={members ?? []}
      />
    </div>
  );
}
