import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useLeagues, useAllLeagueParlays, useDeleteParlay, useDeleteParlayLeg, useUpdateParlayLeg, useUpdateParlayStatus, useAddParlayLeg, useWeeks, useLeagueMembersWithUsers } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, FlaskConical, Trash2, Pencil, Plus, Loader2, User, Calendar } from "lucide-react";
import { PLAYER_PROP_TYPES, type ParlayLeg, type ParlayWithLegs } from "@shared/schema";
import { cn } from "@/lib/utils";

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
    betType: leg.betType,
    pick: leg.pick,
    line: leg.line ?? "",
    odds: leg.odds ?? "",
    result: leg.result ?? "",
    playerName: leg.playerName ?? "",
    propType: leg.propType ?? "",
    gameSegment: leg.gameSegment ?? "",
    notes: leg.notes ?? "",
  };
}

interface LegSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initial: LegFormState;
  onSave: (form: LegFormState) => void;
  isSaving: boolean;
}

function LegSheet({ open, onOpenChange, title, initial, onSave, isSaving }: LegSheetProps) {
  const [form, setForm] = useState<LegFormState>(initial);
  const set = (k: keyof LegFormState) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const validPicks = PICK_OPTIONS[form.betType] ?? ["home", "away"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" onOpenAutoFocus={e => {
        e.preventDefault();
        setForm(initial);
      }}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Bet Type</Label>
              <Select value={form.betType} onValueChange={v => {
                const picks = PICK_OPTIONS[v] ?? ["home"];
                setForm(p => ({ ...p, betType: v, pick: picks[0] }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BET_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_", " ").toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pick</Label>
              <Select value={form.pick} onValueChange={set("pick")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {validPicks.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Line</Label>
              <Input placeholder="-3.5" value={form.line} onChange={e => set("line")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Odds</Label>
              <Input placeholder="-110" value={form.odds} onChange={e => set("odds")(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Result</Label>
            <Select value={form.result || "__none"} onValueChange={v => set("result")(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Pending —</SelectItem>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="push">Push</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.betType === "player_prop" && (
            <>
              <div className="space-y-1.5">
                <Label>Player Name</Label>
                <Input placeholder="Travis Kelce" value={form.playerName} onChange={e => set("playerName")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prop Type</Label>
                <Select value={form.propType || "__none"} onValueChange={v => set("propType")(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select prop…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {PLAYER_PROP_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Game Segment <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="e.g. First Half" value={form.gameSegment} onChange={e => set("gameSegment")(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea placeholder="Any display note…" value={form.notes} onChange={e => set("notes")(e.target.value)} className="resize-none h-20" />
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={isSaving}>
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Leg"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface ParlayCardProps {
  parlay: ParlayWithLegs;
  leagueId: number;
}

function ParlayCard({ parlay, leagueId }: ParlayCardProps) {
  const deleteParlay = useDeleteParlay(leagueId);
  const deleteLeg = useDeleteParlayLeg(leagueId);
  const updateLeg = useUpdateParlayLeg(leagueId);
  const updateStatus = useUpdateParlayStatus(leagueId);
  const addLeg = useAddParlayLeg(leagueId);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLegId, setDeleteLegId] = useState<number | null>(null);
  const [editLeg, setEditLeg] = useState<(ParlayLeg & { game?: any }) | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const memberName = parlay.user?.firstName || parlay.user?.email || `User #${parlay.userId.slice(0, 6)}`;

  return (
    <>
      <Card className="border border-white/10 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">{memberName}</span>
              <span className="text-muted-foreground text-sm shrink-0 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {parlay.week?.label ?? `Week ${parlay.weekId}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {parlay.legs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No legs yet.</p>
          ) : (
            <div className="rounded-lg overflow-hidden border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Pick</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Line</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Odds</th>
                    <th className="text-left px-3 py-2 font-medium">Result</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {parlay.legs.map((leg, i) => (
                    <tr key={leg.id} className={cn("border-t border-white/5", i % 2 === 1 && "bg-muted/10")}>
                      <td className="px-3 py-2 font-medium truncate max-w-[140px]">{legLabel(leg)}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {leg.betType === "player_prop" ? "PROP" : leg.betType.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{pickLabel(leg)}{leg.line ? ` ${leg.line}` : ""}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{leg.line || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{leg.odds || "—"}</td>
                      <td className={cn("px-3 py-2 font-medium", resultColor(leg.result))}>
                        {leg.result ? leg.result.charAt(0).toUpperCase() + leg.result.slice(1) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
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
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteLegId(leg.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-3 text-xs h-8"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Leg
          </Button>
        </CardContent>
      </Card>

      {/* Edit Leg Sheet */}
      {editLeg && (
        <LegSheet
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

export default function DemoDataEditor() {
  const [, params] = useRoute("/leagues/:id/demo-data");
  const leagueId = Number(params?.id);

  const { data: leagues } = useLeagues();
  const league = leagues?.find(l => l.id === leagueId);

  const { data: allParlays, isLoading } = useAllLeagueParlays(leagueId);
  const { data: weeks } = useWeeks();
  const { data: members } = useLeagueMembersWithUsers(leagueId);

  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");

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

  const filtered = (allParlays ?? []).filter(p => {
    if (weekFilter !== "all" && p.weekId !== Number(weekFilter)) return false;
    if (memberFilter !== "all" && p.userId !== memberFilter) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0 text-muted-foreground">Week:</Label>
          <Select value={weekFilter} onValueChange={setWeekFilter}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks</SelectItem>
              {weeks?.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.label}</SelectItem>)}
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
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} parlay{filtered.length !== 1 ? "s" : ""} shown
        </span>
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
          {filtered.map(parlay => (
            <ParlayCard key={parlay.id} parlay={parlay} leagueId={leagueId} />
          ))}
        </div>
      )}
    </div>
  );
}
