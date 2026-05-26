import React, { Component, type ReactNode, useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeagues, useAllLeagueParlays, useDeleteParlay, useDeleteParlayLeg, useUpdateParlayLeg, useUpdateParlayStatus, useAddParlayLeg, useWeeks, useLeagueMembersWithUsers, useAddHistoricalParlay } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, FlaskConical, Trash2, Pencil, Plus, Loader2, User, Calendar, GitMerge, CheckSquare, Square, RefreshCw, CloudDownload, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Scissors, FilePlus, ChevronRight, ArrowUpDown } from "lucide-react";
import { PLAYER_PROP_TYPES, type ParlayLeg, type ParlayWithLegs } from "@shared/schema";
import { useEnrichParlayLeg, useSplitParlayLegs, type EnrichLog } from "@/hooks/use-bets";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Error Boundary ─────────────────────────────────────────────────────────────
type EBState = { error: Error | null };
class CardErrorBoundary extends Component<{ parlayId: number; children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ParlayCard #${this.props.parlayId}] crashed:`, error.message, info.componentStack);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-destructive">
            Card #{this.props.parlayId} crashed — {this.state.error.message}
          </p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {this.state.error.stack}
          </pre>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={this.reset}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const BET_TYPES = ["spread", "moneyline", "over", "under", "player_prop"] as const;
const PICK_OPTIONS: Record<string, string[]> = {
  spread: ["home", "away"],
  moneyline: ["home", "away"],
  over: ["over"],
  under: ["under"],
  player_prop: ["over", "under", "yes", "no"],
};
const RESULTS = ["", "win", "loss", "push"] as const;
const STATUSES = ["pending", "approved", "rejected", "win", "loss", "push", "void"] as const;

function legLabel(leg: ParlayLeg & { game?: any }) {
  if (leg.betType === "player_prop") {
    return leg.playerName || "Player Prop";
  }
  if (leg.game) return `${leg.game.awayTeam} @ ${leg.game.homeTeam}`;
  return "Unknown Matchup";
}

function pickLabel(leg: ParlayLeg) {
  if (leg.betType === "spread" || leg.betType === "moneyline") {
    return leg.pick === "home" ? "Home" : "Away";
  }
  return leg.pick ? leg.pick.charAt(0).toUpperCase() + leg.pick.slice(1) : "—";
}

function statusColor(status: string | null) {
  switch (status) {
    case "win": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "loss": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "push": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "approved": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "rejected": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "void": return "bg-muted text-muted-foreground";
    default: return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }
}

function resultColor(result: string | null) {
  if (result === "win") return "text-green-400";
  if (result === "loss") return "text-red-400";
  if (result === "push") return "text-blue-400";
  return "text-muted-foreground";
}

type LegFormState = {
  betType: string;
  pick: string;
  line: string;
  odds: string;
  result: string;
  playerName: string;
  propType: string;
  gameSegment: string;
  notes: string;
};

const blankLeg = (): LegFormState => ({
  betType: "spread", pick: "home", line: "", odds: "",
  result: "", playerName: "", propType: "", gameSegment: "", notes: "",
});

function legToForm(leg: ParlayLeg): LegFormState {
  return {
    betType: leg.betType ?? "spread",
    pick: leg.pick ?? "home",
    line: leg.line?.toString() ?? "",
    odds: leg.odds?.toString() ?? "",
    result: leg.result ?? "",
    playerName: leg.playerName ?? "",
    propType: leg.propType ?? "",
    gameSegment: leg.gameSegment ?? "",
    notes: leg.notes ?? "",
  };
}

type LegSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial: LegFormState;
  onSave: (form: LegFormState) => void;
  isSaving: boolean;
};

function LegSheet({ open, onOpenChange, title, initial, onSave, isSaving }: LegSheetProps) {
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

type ParlayCardProps = {
  parlay: ParlayWithLegs;
  leagueId: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  collapseSignal: number;
  expandSignal: number;
};

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
          Data fetch — {new Date(log.at).toLocaleString()}
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

function ParlayCard({ parlay, leagueId, selectMode, isSelected, onToggleSelect, collapseSignal, expandSignal }: ParlayCardProps) {
  const deleteParlay = useDeleteParlay(leagueId);
  const deleteLeg = useDeleteParlayLeg(leagueId);
  const updateLeg = useUpdateParlayLeg(leagueId);
  const updateStatus = useUpdateParlayStatus(leagueId);
  const addLeg = useAddParlayLeg(leagueId);
  const enrichLeg = useEnrichParlayLeg(leagueId);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLegId, setDeleteLegId] = useState<number | null>(null);
  const [editLeg, setEditLeg] = useState<(ParlayLeg & { game?: any }) | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [enrichResults, setEnrichResults] = useState<Record<number, EnrichLog>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [fetchAllState, setFetchAllState] = useState<{ running: boolean; done: number; total: number; errors: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  React.useEffect(() => { if (collapseSignal > 0) setCollapsed(true); }, [collapseSignal]);
  React.useEffect(() => { if (expandSignal > 0) setCollapsed(false); }, [expandSignal]);
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

  const memberName = parlay.user?.firstName || parlay.user?.email || `User #${parlay.userId.slice(0, 6)}`;

  return (
    <>
      <Card
        className={cn(
          "border transition-colors",
          selectMode && isSelected
            ? "border-primary/60 bg-primary/5"
            : "border-white/10 bg-card/50",
          selectMode && "cursor-pointer"
        )}
        onClick={selectMode ? () => onToggleSelect(parlay.id) : undefined}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
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

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">{memberName}</span>
              <span className="text-muted-foreground text-sm shrink-0 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {parlay.week?.label ?? `Week ${parlay.weekId}`}
              </span>
              <span className="text-xs text-muted-foreground/60">#{parlay.id}</span>
              {collapsed && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal text-muted-foreground border-white/15">
                  {parlay.legs.length} leg{parlay.legs.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* ── Parlay leg stats summary ─────────────────────── */}
            {(() => {
              const wins    = parlay.legs.filter(l => l.result === "win").length;
              const losses  = parlay.legs.filter(l => l.result === "loss").length;
              const pushes  = parlay.legs.filter(l => l.result === "push").length;
              const resolved = wins + losses + pushes;
              const pending  = parlay.legs.filter(l => !l.result).length;
              const pct      = resolved > 0 ? Math.round((wins / resolved) * 100) : null;
              return (
                <div className="flex items-center gap-1.5 text-xs shrink-0" onClick={e => e.stopPropagation()}>
                  <span className={cn(
                    "font-semibold tabular-nums",
                    pct === null ? "text-muted-foreground/50"
                      : pct >= 60 ? "text-green-400"
                      : pct >= 40 ? "text-yellow-400"
                      : "text-red-400"
                  )}>
                    {wins}<span className="text-muted-foreground/40 font-normal">/{resolved}</span>
                    {pct !== null && (
                      <span className="ml-1 text-muted-foreground/70 font-normal">({pct}%)</span>
                    )}
                  </span>
                  {pending > 0 && (
                    <span className="text-muted-foreground/50">
                      · <span className="text-muted-foreground/70">{pending} pending</span>
                    </span>
                  )}
                </div>
              );
            })()}

            {!selectMode && (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <Select
                  value={parlay.status ?? "pending"}
                  onValueChange={v => updateStatus.mutate({ parlayId: parlay.id, status: v })}
                >
                  <SelectTrigger className={cn("h-7 text-xs border px-2 py-0 w-28", statusColor(parlay.status))}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
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

                {/* Split mode toggle */}
                {parlay.legs.length >= 2 && !splitMode && (
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
          </div>
        </CardHeader>

        {!collapsed && <CardContent className="pt-0" onClick={e => selectMode && e.stopPropagation()}>
          {parlay.legs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No legs yet.</p>
          ) : (
            <div className="rounded-lg overflow-hidden border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-xs">
                    {splitMode && <th className="px-3 py-2 w-8" />}
                    <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Pick</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Line</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Odds</th>
                    <th className="text-left px-3 py-2 font-medium">Result</th>
                    {!selectMode && !splitMode && <th className="px-2 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {parlay.legs.map((leg, i) => {
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
                        <tr
                          className={cn(
                            "border-t border-white/5",
                            i % 2 === 1 && "bg-muted/10",
                            splitMode && "cursor-pointer hover:bg-primary/5",
                            splitMode && splitSelected.has(leg.id) && "bg-primary/10"
                          )}
                          onClick={splitMode ? () => toggleSplitLeg(leg.id) : undefined}
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
                          <td className="px-3 py-2 font-medium truncate max-w-[140px]">{legLabel(leg)}</td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{pickLabel(leg)}{leg.line ? ` ${leg.line}` : ""}</td>
                          <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{leg.line || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{leg.odds || "—"}</td>
                          <td className={cn("px-3 py-2 font-medium", resultColor(leg.result))}>
                            {leg.result ? leg.result.charAt(0).toUpperCase() + leg.result.slice(1) : "—"}
                          </td>
                          {!selectMode && !splitMode && (
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
                                  title="Fetch historical data"
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
                            <td colSpan={7} className="px-3 pb-3">
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
          )}

          {!selectMode && !splitMode && (
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
  );
}

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
              const name = p.user?.firstName || p.user?.email || `User #${p.userId.slice(0, 6)}`;
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

// ── Add Historical Bet Sheet ───────────────────────────────────────────────────

type AddHistoricalBetSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leagueId: number;
  weeks: Array<{ id: number; season: number; weekNumber: number; label: string }>;
  members: Array<{ userId: string; user?: { firstName?: string | null; email?: string | null } | null }>;
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
                      {m.user?.firstName || m.user?.email || m.userId.slice(0, 8)}
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
  const { data: members } = useLeagueMembersWithUsers(leagueId);

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

  const visibleWeeks = yearFilter === "all"
    ? (weeks ?? [])
    : (weeks ?? []).filter(w => w.season === Number(yearFilter));

  const filtered = (allParlays ?? []).filter(p => {
    if (yearFilter !== "all" && p.week?.season !== Number(yearFilter)) return false;
    if (weekFilter !== "all" && p.weekId !== Number(weekFilter)) return false;
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
        const nameA = (a.user?.firstName || a.user?.email || "").toLowerCase();
        const nameB = (b.user?.firstName || b.user?.email || "").toLowerCase();
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
          <Label className="text-sm shrink-0 text-muted-foreground">Year:</Label>
          <Select value={yearFilter} onValueChange={v => {
            setYearFilter(v);
            if (v !== "all" && weekFilter !== "all") {
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
          <Label className="text-sm shrink-0 text-muted-foreground">Member:</Label>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              {members?.map(m => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.user?.firstName || m.user?.email || m.userId.slice(0, 8)}
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
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            title="Collapse all cards"
            onClick={() => setCollapseSignal(s => s + 1)}
          >
            <ChevronUp className="w-3.5 h-3.5" />
            Collapse All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            title="Expand all cards"
            onClick={() => setExpandSignal(s => s + 1)}
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Expand All
          </Button>
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
          {sorted.map(parlay => (
            <CardErrorBoundary key={parlay.id} parlayId={parlay.id}>
              <ParlayCard
                parlay={parlay}
                leagueId={leagueId}
                selectMode={selectMode}
                isSelected={selectedIds.has(parlay.id)}
                onToggleSelect={toggleSelect}
                collapseSignal={collapseSignal}
                expandSignal={expandSignal}
              />
            </CardErrorBoundary>
          ))}
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
