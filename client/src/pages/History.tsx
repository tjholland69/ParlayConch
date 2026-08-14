import { useMyParlayHistory, useLeagues, useAllLeagueParlays } from "@/hooks/use-bets";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Trophy, Filter, Calendar, Loader2, Copy, Check, ChevronRight, ChevronsUpDown } from "lucide-react";
import { buildSlipText } from "@/components/BetSlipPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatPickLabel } from "@/lib/formatPick";
import { format } from "date-fns";
import type { ParlayWithLegs } from "@shared/schema";

// ── helpers ──────────────────────────────────────────────────────────────────

const getStatusVariant = (status: string | null): "default" | "destructive" | "secondary" | "outline" => {
  switch (status) {
    case "win": return "default";
    case "loss": return "destructive";
    case "push": return "secondary";
    case "approved": return "outline";
    case "rejected": return "destructive";
    case "void": return "outline";
    default: return "secondary";
  }
};

function legMatchup(leg: any) {
  if (leg.betType === "player_prop") {
    const propLabel = leg.propType
      ? leg.propType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null;
    return `${leg.playerName || "Player"}${propLabel ? ` — ${propLabel}` : ""}`;
  }
  return `${leg.game?.awayTeam ?? "?"} @ ${leg.game?.homeTeam ?? "?"}`;
}

// ── LegRows ──────────────────────────────────────────────────────────────────
// Flat per-leg tile rows, matching the "League Parlays" card format in LeagueDetail.

function LegRows({ legs }: { legs: any[] }) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2 px-1">No legs.</p>;
  }
  return (
    <div className="space-y-1">
      {legs.map((leg: any, i: number) => {
        const isProp = leg.betType === "player_prop";
        return (
          <div key={leg.id ?? i} className="flex flex-col gap-1 text-sm p-2 bg-white/5 rounded">
            <div className="flex items-center justify-between">
              <span>{legMatchup(leg)}</span>
              <div className="flex items-center gap-2">
                {leg.result && (
                  <Badge
                    variant={leg.result === "win" ? "default" : leg.result === "loss" ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {leg.result}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs uppercase">{isProp ? "PROP" : leg.betType}</Badge>
                <Badge variant="outline" className="text-xs">{formatPickLabel(leg)}</Badge>
              </div>
            </div>
            {leg.notes && (
              <p className="text-xs text-muted-foreground italic pl-1 border-l border-white/10">{leg.notes}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── HistoryParlayCard ─────────────────────────────────────────────────────────

function HistoryParlayCard({
  parlay,
  onCopySlip,
  copiedId,
  initialCollapsed,
}: {
  parlay: ParlayWithLegs;
  onCopySlip: (p: any) => void;
  copiedId: number | null;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    setCollapsed(initialCollapsed);
  }, [initialCollapsed]);
  const [showAll, setShowAll] = useState(false);

  const { data: allLeagueParlays, isLoading: loadingAll } = useAllLeagueParlays(
    parlay.leagueId,
    showAll,
  );

  const otherParlays = showAll
    ? (allLeagueParlays ?? []).filter(p => p.weekId === parlay.weekId && p.id !== parlay.id)
    : [];

  const wins     = parlay.legs.filter((l: any) => l.result === "win").length;
  const losses   = parlay.legs.filter((l: any) => l.result === "loss").length;
  const pushes   = parlay.legs.filter((l: any) => l.result === "push").length;
  const resolved = wins + losses + pushes;
  const pct      = resolved > 0 ? Math.round((wins / resolved) * 100) : 0;
  const perfect  = pct === 100 && resolved > 0;
  const pending  = parlay.legs.filter((l: any) => !l.result).length;

  return (
    <Card
      className={cn("border-white/5", parlay.status === "void" ? "bg-card/20 opacity-60" : "bg-card/50")}
      data-testid={`card-parlay-history-${parlay.id}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Collapse toggle */}
          <button
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronRight
              className={cn("w-4 h-4 transition-transform duration-150", !collapsed && "rotate-90")}
            />
          </button>

          {/* Avatar */}
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-primary-foreground shrink-0",
              parlay.status === "void" ? "bg-muted" : perfect ? "bg-gradient-to-tr from-green-400 to-primary" : "bg-gradient-to-tr from-primary to-accent"
            )}
          >
            <Calendar className="w-4 h-4" />
          </div>

          {/* Week + date */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn("font-bold truncate", parlay.status === "void" && "text-muted-foreground")}>
                {parlay.week?.label ?? `Week ${parlay.weekId}`}
              </p>
              {perfect && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1 py-0 h-4">
                  Perfect
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {parlay.status === "void" ? "No submission" : `${parlay.legs.length} leg parlay`}
              {parlay.createdAt && (
                <span className="ml-2 text-muted-foreground/60">
                  {format(new Date(parlay.createdAt), "MMM d, yyyy")}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Win stats */}
          {resolved > 0 && (
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                pct >= 60 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"
              )}
            >
              {wins}
              <span className="text-muted-foreground/50 font-normal">/{resolved}</span>
              <span className="ml-1 text-muted-foreground/60 font-normal">({pct}%)</span>
            </span>
          )}
          {pending > 0 && resolved === 0 && (
            <span className="text-xs text-muted-foreground/50">{pending} pending</span>
          )}

          <Badge
            variant={getStatusVariant(parlay.status)}
            className={parlay.status === "void" ? "text-muted-foreground border-white/10" : ""}
          >
            {parlay.status === "void" ? "Void" : parlay.status}
          </Badge>

          {parlay.status !== "void" && (
            <button
              onClick={() => onCopySlip(parlay)}
              title="Copy bet slip"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              {copiedId === parlay.id
                ? <Check className="w-3.5 h-3.5 text-green-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent>
          {parlay.status === "void" ? (
            <p className="text-sm text-muted-foreground italic">No submission — missed this week</p>
          ) : (
            <>
              {/* My legs */}
              <LegRows legs={parlay.legs} />

              {/* Show full parlay toggle */}
              <div className="mt-4 flex items-center gap-2.5">
                <Checkbox
                  id={`show-all-${parlay.id}`}
                  checked={showAll}
                  onCheckedChange={v => setShowAll(!!v)}
                />
                <label
                  htmlFor={`show-all-${parlay.id}`}
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show all league members' picks for this week
                </label>
                {loadingAll && showAll && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Other members */}
              {showAll && !loadingAll && otherParlays.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground italic">
                  No other members submitted a parlay this week.
                </p>
              )}

              {showAll && otherParlays.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">
                    Other members ({otherParlays.length})
                  </p>
                  {otherParlays.map(other => {
                    const displayName =
                      (other.user as any)?.settings?.displayName ||
                      other.user?.firstName ||
                      "Member";
                    const oWins     = other.legs.filter((l: any) => l.result === "win").length;
                    const oLosses   = other.legs.filter((l: any) => l.result === "loss").length;
                    const oPushes   = other.legs.filter((l: any) => l.result === "push").length;
                    const oResolved = oWins + oLosses + oPushes;
                    const oPct      = oResolved > 0 ? Math.round((oWins / oResolved) * 100) : 0;

                    return (
                      <div key={other.id} className="rounded-lg border border-white/5 bg-muted/10 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-white/5">
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                              {displayName[0]}
                            </div>
                            {displayName}
                          </span>
                          <div className="flex items-center gap-2">
                            {oResolved > 0 && (
                              <span
                                className={cn(
                                  "text-xs font-semibold tabular-nums",
                                  oPct >= 60 ? "text-green-400" : oPct >= 40 ? "text-yellow-400" : "text-red-400"
                                )}
                              >
                                {oWins}/{oResolved} ({oPct}%)
                              </span>
                            )}
                            <Badge
                              variant={getStatusVariant(other.status)}
                              className="text-xs"
                            >
                              {other.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="p-2">
                          <LegRows legs={other.legs} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function History() {
  const { toast } = useToast();
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(true);

  const handleCopySlip = async (parlay: Parameters<typeof buildSlipText>[0]) => {
    try {
      await navigator.clipboard.writeText(buildSlipText(parlay));
      setCopiedId(parlay.id);
      toast({ title: "Bet slip copied!", description: "Paste it into your sportsbook app." });
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the text manually.", variant: "destructive" });
    }
  };

  const leagueId = selectedLeagueId === "all" ? undefined : Number(selectedLeagueId);
  const { data: parlays, isLoading } = useMyParlayHistory(leagueId);

  const activeParlays = parlays?.filter(p => p.status !== "void") ?? [];
  const stats = {
    total: activeParlays.length,
    wins: activeParlays.filter(p => p.status === "win").length,
    losses: activeParlays.filter(p => p.status === "loss").length,
    pending: activeParlays.filter(p => ["pending", "approved"].includes(p.status || "")).length,
    missed: parlays?.filter(p => p.status === "void").length || 0,
  };
  const winRate =
    (stats.wins + stats.losses) > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
      : "0.0";

  const allLegs = parlays?.flatMap(p => p.legs) ?? [];
  const gameLegs = allLegs.filter(l => l.betType !== "player_prop");
  const propLegs = allLegs.filter(l => l.betType === "player_prop");
  const totalLegs = allLegs.length;

  const gameLegsWithResult = gameLegs.filter(l => l.result === "win" || l.result === "loss");
  const propLegsWithResult = propLegs.filter(l => l.result === "win" || l.result === "loss");

  const gamePct = totalLegs > 0 ? ((gameLegs.length / totalLegs) * 100).toFixed(0) : "—";
  const propPct = totalLegs > 0 ? ((propLegs.length / totalLegs) * 100).toFixed(0) : "—";
  const gameWinRate =
    gameLegsWithResult.length > 0
      ? ((gameLegs.filter(l => l.result === "win").length / gameLegsWithResult.length) * 100).toFixed(1)
      : "—";
  const propWinRate =
    propLegsWithResult.length > 0
      ? ((propLegs.filter(l => l.result === "win").length / propLegsWithResult.length) * 100).toFixed(1)
      : "—";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3" data-testid="text-history-title">
            <HistoryIcon className="w-8 h-8 text-primary" />
            My Parlay History
          </h1>
          <p className="text-muted-foreground">Track your parlay performance over time</p>
        </div>

        <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
          <SelectTrigger className="w-48 bg-background border-white/10">
            <Filter className="w-4 h-4 text-primary mr-2" />
            <SelectValue placeholder="Filter by league" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leagues</SelectItem>
            {leagues?.map(league => (
              <SelectItem key={league.id} value={league.id.toString()}>
                {league.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono">{stats.total}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Parlays</p>
            {stats.missed > 0 && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.missed} missed</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-primary">{stats.wins}</p>
            <p className="text-xs text-muted-foreground uppercase">Wins</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-destructive">{stats.losses}</p>
            <p className="text-xs text-muted-foreground uppercase">Losses</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold font-mono", parseFloat(winRate) >= 50 ? "text-primary" : "text-muted-foreground")}>
              {winRate}%
            </p>
            <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-blue-400">
              {gamePct === "—" ? "—" : `${gamePct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Game Outcome Legs</p>
            <p className="text-xs text-blue-400/60 mt-0.5">{gameLegs.length} leg{gameLegs.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold font-mono", gameWinRate !== "—" && parseFloat(gameWinRate) >= 50 ? "text-primary" : "text-muted-foreground")}>
              {gameWinRate === "—" ? "—" : `${gameWinRate}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Game Outcome Win %</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {gameLegsWithResult.length > 0
                ? `${gameLegs.filter(l => l.result === "win").length}W / ${gameLegsWithResult.length} settled`
                : "no results yet"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-violet-400">
              {propPct === "—" ? "—" : `${propPct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Player Prop Legs</p>
            <p className="text-xs text-violet-400/60 mt-0.5">{propLegs.length} leg{propLegs.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold font-mono", propWinRate !== "—" && parseFloat(propWinRate) >= 50 ? "text-primary" : "text-muted-foreground")}>
              {propWinRate === "—" ? "—" : `${propWinRate}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Player Prop Win %</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {propLegsWithResult.length > 0
                ? `${propLegs.filter(l => l.result === "win").length}W / ${propLegsWithResult.length} settled`
                : "no results yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Parlay List */}
      {!parlays?.length ? (
        <div className="text-center py-16 bg-card/20 rounded-2xl border border-dashed border-white/10">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">No Parlays Yet</h2>
          <p className="text-muted-foreground">Join a league and start making picks!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {parlays.length} parlay{parlays.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setAllCollapsed(c => !c)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              {allCollapsed ? "Expand All" : "Collapse All"}
            </button>
          </div>
          {parlays.map(parlay => (
            <HistoryParlayCard
              key={parlay.id}
              parlay={parlay}
              onCopySlip={handleCopySlip}
              copiedId={copiedId}
              initialCollapsed={allCollapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}
