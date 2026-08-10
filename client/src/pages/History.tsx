import { useMyParlayHistory, useMyLegHistory, useLeagues, useAllLeagueParlaysReadOnly, useLeagueMembersWithUsers, flattenParlayPages } from "@/hooks/use-bets";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo, useRef, Fragment, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { MultiSelect } from "@/components/MultiSelect";
import { BET_TYPE_OPTIONS } from "@/lib/bettingConstants";
import { History as HistoryIcon, Trophy, Filter, Calendar, Loader2, Copy, Check, ChevronRight, User, ChevronsUpDown, Search, HelpCircle } from "lucide-react";
import { buildSlipText } from "@/components/BetSlipPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatPickLabel } from "@/lib/formatPick";
import { format } from "date-fns";
import { getDisplayName } from "@/lib/displayName";
import type { ParlayWithLegs, ParlayLegWithParlayContext } from "@shared/schema";
import { filterLegsByQuery, LEG_QUERY_HELP, filterParlaysByQuery, PARLAY_QUERY_HELP } from "@/lib/historyQuery";
import { getStatusVariant } from "@/lib/parlayStatusStyles";
import { legMatchup } from "@/lib/legLabel";
import { PageLoader } from "@/components/PageLoader";
import { ParlayLegResultBadge } from "@/components/ParlayLegResultBadge";

// ── helpers ──────────────────────────────────────────────────────────────────

type TileKey = "total" | "wins" | "losses" | "winRate" | "gameLegs" | "gameWinRate" | "propLegs" | "propWinRate";

type HistoryDateRange = { startDate?: string; endDate?: string };
type DateRangeMode = "all" | "year" | "month" | "custom";

function toISODate(d: Date): string {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

// Same All Time / This Year / This Month / Custom pattern as the Dashboard >
// Performance tile's time-range dropdown, applied here as a client-side filter.
function HistoryDateRangeFilter({
  value,
  onChange,
}: {
  value: HistoryDateRange;
  onChange: (mode: DateRangeMode, range: HistoryDateRange) => void;
}) {
  const [mode, setMode] = useState<DateRangeMode>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleModeChange = (next: string) => {
    const m = next as DateRangeMode;
    setMode(m);
    if (m === "all") {
      onChange(m, {});
    } else if (m === "year") {
      const now = new Date();
      onChange(m, { startDate: toISODate(new Date(now.getFullYear(), 0, 1)), endDate: toISODate(now) });
    } else if (m === "month") {
      const now = new Date();
      onChange(m, { startDate: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toISODate(now) });
    } else {
      setPopoverOpen(true);
      // Wait for explicit range selection before firing onChange.
    }
  };

  const applyCustomRange = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      onChange("custom", { startDate: toISODate(range.from), endDate: toISODate(range.to) });
      setPopoverOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Select value={mode} onValueChange={handleModeChange}>
        <SelectTrigger className="w-36 bg-background border-white/10 h-9 text-xs" data-testid="select-history-date-range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="year">This Year</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs bg-background border-white/10 font-normal"
              data-testid="button-history-custom-date-range"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              {value.startDate && value.endDate ? `${value.startDate} – ${value.endDate}` : "Pick dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <CalendarWidget mode="range" selected={customRange} onSelect={applyCustomRange} numberOfMonths={2} defaultMonth={customRange?.from} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ── LegTable ─────────────────────────────────────────────────────────────────

function LegTable({ legs, compact = false }: { legs: any[]; compact?: boolean }) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2 px-1">No legs.</p>;
  }
  return (
    <div className="rounded-lg overflow-hidden border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground text-xs">
            <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Type</th>
            <th className="text-left px-3 py-2 font-medium">Pick</th>
            {!compact && <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Line</th>}
            {!compact && <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Odds</th>}
            <th className="text-left px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg: any, i: number) => (
            <Fragment key={leg.id ?? i}>
              <tr
                className={cn(
                  "border-t border-white/5",
                  i % 2 === 1 && "bg-muted/10",
                  leg.result === "win" && "bg-primary/10",
                  leg.result === "loss" && "bg-destructive/5"
                )}
              >
                <td className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {leg.gameSegment && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 leading-none shrink-0">
                        {leg.gameSegment}
                      </span>
                    )}
                    <span className="truncate max-w-[130px] text-xs">{legMatchup(leg)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{formatPickLabel(leg)}</td>
                {!compact && (
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell text-xs">{leg.line || "—"}</td>
                )}
                {!compact && (
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell text-xs">{leg.odds || "—"}</td>
                )}
                <td className="px-3 py-2 font-medium text-xs">
                  <ParlayLegResultBadge leg={leg} game={leg.game} />
                </td>
              </tr>
              {leg.notes && (
                <tr className="border-t border-white/5">
                  <td
                    colSpan={compact ? 3 : 5}
                    className="px-4 py-1.5 text-xs text-muted-foreground italic border-l-2 border-white/10"
                  >
                    {leg.notes}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── LegsWithParlayTable ──────────────────────────────────────────────────────
// Like LegTable, but for legs pulled from multiple parlays at once — shows
// which parlay each leg belongs to (week/#id/status, and who owns it when
// it isn't the current user's own parlay).

function LegsWithParlayTable({ legs }: { legs: ParlayLegWithParlayContext[] }) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2 px-1">No legs.</p>;
  }
  return (
    <div className="rounded-lg overflow-hidden border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground text-xs">
            <th className="text-left px-3 py-2 font-medium">Parlay</th>
            <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Type</th>
            <th className="text-left px-3 py-2 font-medium">Pick</th>
            <th className="text-left px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => (
            <tr
              key={leg.id ?? i}
              className={cn(
                "border-t border-white/5",
                i % 2 === 1 && "bg-muted/10",
                leg.result === "win" && "bg-primary/10",
                leg.result === "loss" && "bg-destructive/5"
              )}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-xs font-medium">
                    {leg.parlay.week?.label ?? `Week ${leg.parlay.weekId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">#{leg.parlay.id}</span>
                  <Badge
                    variant={getStatusVariant(leg.parlay.status)}
                    className={cn("text-[10px] px-1 py-0", leg.parlay.status === "void" && "text-muted-foreground border-white/10")}
                  >
                    {leg.parlay.status === "void" ? "Void" : leg.parlay.status}
                  </Badge>
                  {!leg.parlay.isOwnParlay && (
                    <span className="text-[10px] text-muted-foreground/70 italic">
                      via {getDisplayName(leg.parlay.owner, "Member")}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {leg.gameSegment && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 leading-none shrink-0">
                      {leg.gameSegment}
                    </span>
                  )}
                  <span className="truncate max-w-[130px] text-xs">{legMatchup(leg)}</span>
                </div>
              </td>
              <td className="px-3 py-2 hidden sm:table-cell">
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{formatPickLabel(leg)}</td>
              <td className="px-3 py-2 font-medium text-xs">
                <ParlayLegResultBadge leg={leg} game={leg.game} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── HistoryParlayCard ─────────────────────────────────────────────────────────

const HistoryParlayCard = memo(function HistoryParlayCard({
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

  const {
    data: allLeagueParlaysPages,
    isLoading: loadingAll,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllLeagueParlaysReadOnly(parlay.leagueId, showAll);

  useEffect(() => {
    if (showAll && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [showAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allLeagueParlays = flattenParlayPages(allLeagueParlaysPages);

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
      className={cn(
        "border transition-all duration-500",
        perfect
          ? "border-green-400/60 bg-card/50"
          : "border-white/10 bg-card/50",
        parlay.status === "void" && "opacity-60"
      )}
      style={
        perfect
          ? { boxShadow: "0 0 18px 2px rgba(74,222,128,0.22), 0 0 4px 1px rgba(74,222,128,0.18)" }
          : undefined
      }
      data-testid={`card-parlay-history-${parlay.id}`}
    >
      <CardHeader className="relative overflow-hidden pb-3">
        {/* Progress bar background */}
        {pct > 0 && (
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 pointer-events-none transition-all duration-700 ease-out",
              perfect && "animate-pulse"
            )}
            style={{
              width: `${pct}%`,
              background: perfect
                ? "linear-gradient(to right, rgba(74,222,128,0.35), rgba(74,222,128,0.10))"
                : "linear-gradient(to right, rgba(74,222,128,0.18), rgba(74,222,128,0.03))",
              boxShadow: perfect
                ? "inset -4px 0 12px rgba(74,222,128,0.25)"
                : "inset -2px 0 6px rgba(74,222,128,0.08)",
            }}
          />
        )}

        {/* Header row */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 sm:gap-3">
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

          {/* Week + date */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-semibold truncate">
              {parlay.week?.label ?? `Week ${parlay.weekId}`}
            </span>
            {parlay.createdAt && (
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                {format(new Date(parlay.createdAt), "MMM d, yyyy")}
              </span>
            )}
            <span className="text-xs text-muted-foreground/50">#{parlay.id}</span>
            {collapsed && parlay.legs.length > 0 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal text-muted-foreground border-white/15">
                {parlay.legs.length} leg{parlay.legs.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* Win stats */}
          {resolved > 0 && (
            <span
              className={cn(
                "text-xs font-semibold tabular-nums shrink-0",
                pct >= 60 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"
              )}
            >
              {wins}
              <span className="text-muted-foreground/50 font-normal">/{resolved}</span>
              <span className="ml-1 text-muted-foreground/60 font-normal">({pct}%)</span>
            </span>
          )}
          {pending > 0 && resolved === 0 && (
            <span className="text-xs text-muted-foreground/50 shrink-0">{pending} pending</span>
          )}

          {/* Status badge + copy */}
          <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          {parlay.status === "void" ? (
            <p className="text-sm text-muted-foreground italic py-2">No submission — missed this week</p>
          ) : (
            <>
              {/* My legs */}
              <LegTable legs={parlay.legs} />

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
                    const displayName = getDisplayName(other.user, "Member");
                    const oWins     = other.legs.filter((l: any) => l.result === "win").length;
                    const oLosses   = other.legs.filter((l: any) => l.result === "loss").length;
                    const oPushes   = other.legs.filter((l: any) => l.result === "push").length;
                    const oResolved = oWins + oLosses + oPushes;
                    const oPct      = oResolved > 0 ? Math.round((oWins / oResolved) * 100) : 0;

                    return (
                      <div key={other.id} className="rounded-lg border border-white/5 bg-muted/10 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-white/5">
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
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
                        <LegTable legs={other.legs} compact />
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
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function History() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(true);
  const [legsCollapsed, setLegsCollapsed] = useState(true);
  const [legQuery, setLegQuery] = useState("");
  const [parlayQuery, setParlayQuery] = useState("");
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  // Default view: only the current user's own picks. Uncheck to bring in
  // every league member's picks (requires a specific league to be selected).
  const [ownPicksOnly, setOwnPicksOnly] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedBetTypes, setSelectedBetTypes] = useState<string[]>([]);
  const [historyDateRange, setHistoryDateRange] = useState<HistoryDateRange>({});

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
  const { data: myLegs } = useMyLegHistory(leagueId);
  const [activeTile, setActiveTile] = useState<TileKey | null>(null);

  // Bringing in other members' picks needs one concrete league (there's no
  // cross-league "all members" endpoint) — the league filter above provides it.
  const canShowOthers = !ownPicksOnly && leagueId !== undefined;
  const { data: members } = useLeagueMembersWithUsers(leagueId ?? 0);
  const memberOptions = useMemo(
    () => (members ?? []).map(m => ({ value: m.userId, label: getDisplayName(m.user, "Member") })),
    [members],
  );

  const {
    data: allLeaguePages,
    hasNextPage: hasNextAllLeaguePage,
    fetchNextPage: fetchNextAllLeaguePage,
    isFetchingNextPage: fetchingNextAllLeaguePage,
  } = useAllLeagueParlaysReadOnly(leagueId ?? 0, canShowOthers);

  useEffect(() => {
    if (canShowOthers && hasNextAllLeaguePage && !fetchingNextAllLeaguePage) {
      void fetchNextAllLeaguePage();
    }
  }, [canShowOthers, hasNextAllLeaguePage, fetchingNextAllLeaguePage, fetchNextAllLeaguePage]);

  const allLeagueParlays = flattenParlayPages(allLeaguePages);
  const baseParlays = canShowOthers ? allLeagueParlays : (parlays ?? []);

  const baseLegs: ParlayLegWithParlayContext[] = useMemo(() => {
    if (!canShowOthers) return myLegs ?? [];
    return allLeagueParlays.flatMap(p =>
      p.legs.map(l => ({
        ...l,
        parlay: {
          id: p.id,
          weekId: p.weekId,
          week: p.week,
          status: p.status,
          isOwnParlay: p.userId === user?.id,
          owner: p.userId === user?.id ? null : { firstName: p.user?.firstName, email: p.user?.email },
          userId: p.userId,
        },
      })),
    );
  }, [canShowOthers, allLeagueParlays, myLegs, user?.id]);

  // Structured filters (league members / bet types / time range) — applied
  // ahead of the hidden "Advanced Filter" raw query line.
  const dateFilteredParlays = useMemo(() => {
    if (!historyDateRange.startDate && !historyDateRange.endDate) return baseParlays;
    return baseParlays.filter(p => {
      if (!p.createdAt) return false;
      const d = toISODate(new Date(p.createdAt));
      if (historyDateRange.startDate && d < historyDateRange.startDate) return false;
      if (historyDateRange.endDate && d > historyDateRange.endDate) return false;
      return true;
    });
  }, [baseParlays, historyDateRange]);

  const structurallyFilteredParlays = useMemo(() => {
    let result = dateFilteredParlays;
    if (canShowOthers && selectedMemberIds.length > 0) {
      result = result.filter(p => selectedMemberIds.includes(p.userId));
    }
    if (selectedBetTypes.length > 0) {
      result = result.filter(p => p.legs.some(l => selectedBetTypes.includes(l.betType)));
    }
    return result;
  }, [dateFilteredParlays, canShowOthers, selectedMemberIds, selectedBetTypes]);

  const allowedParlayIdsForDate = useMemo(
    () => new Set(dateFilteredParlays.map(p => p.id)),
    [dateFilteredParlays],
  );

  const structurallyFilteredLegs = useMemo(() => {
    let result = baseLegs.filter(l => allowedParlayIdsForDate.has(l.parlay.id));
    if (canShowOthers && selectedMemberIds.length > 0) {
      result = result.filter(l => selectedMemberIds.includes((l.parlay as { userId?: string }).userId ?? ""));
    }
    if (selectedBetTypes.length > 0) {
      result = result.filter(l => selectedBetTypes.includes(l.betType));
    }
    return result;
  }, [baseLegs, allowedParlayIdsForDate, canShowOthers, selectedMemberIds, selectedBetTypes]);

  const filteredMyLegs = useMemo(
    () => filterLegsByQuery(structurallyFilteredLegs, legQuery),
    [structurallyFilteredLegs, legQuery],
  );

  const filteredParlays = useMemo(
    () => filterParlaysByQuery(structurallyFilteredParlays, parlayQuery),
    [structurallyFilteredParlays, parlayQuery],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = filteredParlays.length > 20;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? filteredParlays.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160,
    overscan: 4,
  });

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

  const allLegs = parlays?.flatMap(p => p.legs.map(l => ({
    ...l,
    parlay: { id: p.id, weekId: p.weekId, week: p.week, status: p.status, isOwnParlay: true, owner: null },
  }))) ?? [];
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
    return <PageLoader />;
  }

  const tileInfo: Record<TileKey, { title: string; kind: "parlays"; items: ParlayWithLegs[] } | { title: string; kind: "legs"; items: typeof allLegs }> = {
    total: { title: "Total Parlays", kind: "parlays", items: activeParlays },
    wins: { title: "Wins", kind: "parlays", items: activeParlays.filter(p => p.status === "win") },
    losses: { title: "Losses", kind: "parlays", items: activeParlays.filter(p => p.status === "loss") },
    winRate: { title: "Win Rate", kind: "parlays", items: activeParlays.filter(p => p.status === "win" || p.status === "loss") },
    gameLegs: { title: "Game Outcome Legs", kind: "legs", items: gameLegs },
    gameWinRate: { title: "Game Outcome Win %", kind: "legs", items: gameLegsWithResult },
    propLegs: { title: "Player Prop Legs", kind: "legs", items: propLegs },
    propWinRate: { title: "Player Prop Win %", kind: "legs", items: propLegsWithResult },
  };
  const activeTileInfo = activeTile ? tileInfo[activeTile] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3" data-testid="text-history-title">
            <HistoryIcon className="w-8 h-8 text-primary" />
            History
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

      {/* Filters */}
      <div className="bg-card/30 p-4 rounded-2xl border border-white/5 backdrop-blur-sm space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="own-picks-only"
              checked={ownPicksOnly}
              onCheckedChange={v => setOwnPicksOnly(!!v)}
              data-testid="checkbox-own-picks-only"
            />
            <label htmlFor="own-picks-only" className="text-sm cursor-pointer select-none">
              My picks only
            </label>
          </div>

          {!ownPicksOnly && (
            <div className="w-56">
              {leagueId === undefined ? (
                <p className="text-xs text-muted-foreground italic">Select a league above to include other members' picks.</p>
              ) : (
                <MultiSelect
                  testId="filter-history-members"
                  placeholder="All members"
                  options={memberOptions}
                  selected={selectedMemberIds}
                  onChange={setSelectedMemberIds}
                />
              )}
            </div>
          )}

          <div className="w-56">
            <MultiSelect
              testId="filter-history-bet-types"
              placeholder="All bet types"
              options={BET_TYPE_OPTIONS}
              selected={selectedBetTypes}
              onChange={setSelectedBetTypes}
            />
          </div>

          <HistoryDateRangeFilter value={historyDateRange} onChange={(_mode, range) => setHistoryDateRange(range)} />

          <button
            type="button"
            onClick={() => setShowAdvancedFilter(v => !v)}
            className="text-sm text-primary hover:underline ml-auto"
            data-testid="link-advanced-filter"
          >
            {showAdvancedFilter ? "Hide advanced filter" : "Advanced Filter"}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("total")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono">{stats.total}</p>
            <p className="text-xs text-muted-foreground uppercase">Total Parlays</p>
            {stats.missed > 0 && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{stats.missed} missed</p>
            )}
          </CardContent>
        </Card>
        <Card
          className="bg-primary/10 border-primary/20 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setActiveTile("wins")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-primary">{stats.wins}</p>
            <p className="text-xs text-muted-foreground uppercase">Wins</p>
          </CardContent>
        </Card>
        <Card
          className="bg-destructive/10 border-destructive/20 cursor-pointer hover:border-destructive/40 transition-colors"
          onClick={() => setActiveTile("losses")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-destructive">{stats.losses}</p>
            <p className="text-xs text-muted-foreground uppercase">Losses</p>
          </CardContent>
        </Card>
        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("winRate")}
        >
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold font-mono", parseFloat(winRate) >= 50 ? "text-primary" : "text-muted-foreground")}>
              {winRate}%
            </p>
            <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
          </CardContent>
        </Card>

        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("gameLegs")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-blue-400">
              {gamePct === "—" ? "—" : `${gamePct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Game Outcome Legs</p>
            <p className="text-xs text-blue-400/60 mt-0.5">{gameLegs.length} leg{gameLegs.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("gameWinRate")}
        >
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
        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("propLegs")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-violet-400">
              {propPct === "—" ? "—" : `${propPct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Player Prop Legs</p>
            <p className="text-xs text-violet-400/60 mt-0.5">{propLegs.length} leg{propLegs.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card
          className="bg-card/50 border-white/5 cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => setActiveTile("propWinRate")}
        >
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
      {!baseParlays.length ? (
        <div className="text-center py-16 bg-card/20 rounded-2xl border border-dashed border-white/10">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">No Parlays Yet</h2>
          <p className="text-muted-foreground">Join a league and start making picks!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {filteredParlays.length} of {baseParlays.length} parlay{baseParlays.length !== 1 ? "s" : ""}
              {parlayQuery.trim() || selectedBetTypes.length > 0 || selectedMemberIds.length > 0 || historyDateRange.startDate
                ? " match"
                : ownPicksOnly ? " I have created" : " in this league"}
            </p>
            <button
              onClick={() => setAllCollapsed(c => !c)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              {allCollapsed ? "Expand All" : "Collapse All"}
            </button>
          </div>

          {showAdvancedFilter && (
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={parlayQuery}
                  onChange={e => setParlayQuery(e.target.value)}
                  placeholder='Filter parlays: status:win week:"Week 5" type:player_prop -status:void'
                  className="pl-9 bg-background border-white/10 font-mono text-sm"
                  data-testid="input-parlay-query"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{PARLAY_QUERY_HELP}</TooltipContent>
              </Tooltip>
            </div>
          )}

          {filteredParlays.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2 px-1">No parlays match this query.</p>
          ) : shouldVirtualize ? (
            <div
              ref={parentRef}
              className="max-h-[70vh] overflow-y-auto"
            >
              <div
                className="relative w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const parlay = filteredParlays[virtualRow.index]!;
                  return (
                    <div
                      key={parlay.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full pb-4"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <HistoryParlayCard
                        parlay={parlay}
                        onCopySlip={handleCopySlip}
                        copiedId={copiedId}
                        initialCollapsed={allCollapsed}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            filteredParlays.map(parlay => (
              <HistoryParlayCard
                key={parlay.id}
                parlay={parlay}
                onCopySlip={handleCopySlip}
                copiedId={copiedId}
                initialCollapsed={allCollapsed}
              />
            ))
          )}
        </div>
      )}

      {/* My Parlay Legs */}
      {!!baseLegs.length && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {filteredMyLegs.length} of {baseLegs.length} leg{baseLegs.length !== 1 ? "s" : ""}
              {legQuery.trim() || selectedBetTypes.length > 0 || selectedMemberIds.length > 0 || historyDateRange.startDate
                ? " match"
                : ownPicksOnly ? " I have placed" : " in this league"}
            </p>
            <button
              onClick={() => setLegsCollapsed(c => !c)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              {legsCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>

          {!legsCollapsed && (
            <>
              {showAdvancedFilter && (
                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={legQuery}
                      onChange={e => setLegQuery(e.target.value)}
                      placeholder='Filter legs: result:win type:player_prop player:"Josh Allen" -status:void'
                      className="pl-9 bg-background border-white/10 font-mono text-sm"
                      data-testid="input-leg-query"
                    />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">{LEG_QUERY_HELP}</TooltipContent>
                  </Tooltip>
                </div>
              )}

              {filteredMyLegs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2 px-1">No legs match this query.</p>
              ) : (
                <LegsWithParlayTable legs={filteredMyLegs} />
              )}
            </>
          )}
        </div>
      )}

      {/* Tile drill-down */}
      <Dialog open={activeTile !== null} onOpenChange={open => !open && setActiveTile(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeTileInfo?.title}</DialogTitle>
          </DialogHeader>
          {activeTileInfo?.kind === "parlays" ? (
            activeTileInfo.items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No parlays match this stat.</p>
            ) : (
              <div className="space-y-4">
                {activeTileInfo.items.map(p => (
                  <HistoryParlayCard
                    key={p.id}
                    parlay={p}
                    onCopySlip={handleCopySlip}
                    copiedId={copiedId}
                    initialCollapsed={false}
                  />
                ))}
              </div>
            )
          ) : activeTileInfo?.kind === "legs" ? (
            <LegsWithParlayTable legs={activeTileInfo.items} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
