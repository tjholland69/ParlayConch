import { useMyLegHistory, useLeagues, useAllLeagueParlaysReadOnly, useAllMyLeaguesParlaysReadOnly, useLeagueMembersWithUsers, flattenParlayPages, useMissingParlayMembers, useBackfillMissingParlays } from "@/hooks/use-bets";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "wouter";
import { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DateRange } from "react-day-picker";
import { MultiSelect } from "@/components/MultiSelect";
import { BET_TYPE_OPTIONS } from "@/lib/bettingConstants";
import { History as HistoryIcon, Trophy, Filter, Calendar, Loader2, ChevronsUpDown, Search, HelpCircle, LayoutGrid, Table2 } from "lucide-react";
import { buildSlipText } from "@/components/BetSlipPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatPickLabel } from "@/lib/formatPick";
import { getDisplayName } from "@/lib/displayName";
import type { ParlayWithLegs, ParlayLegWithParlayContext } from "@shared/schema";
import { filterLegsByQuery, LEG_QUERY_HELP, filterParlaysByQuery, PARLAY_QUERY_HELP } from "@/lib/historyQuery";
import { legMatchup } from "@/lib/legLabel";
import { PageLoader } from "@/components/PageLoader";
import { ParlayLegResultBadge } from "@/components/ParlayLegResultBadge";
import { flattenParlayLegs } from "@/lib/flattenParlayLegs";
import { ParlayRollupCard } from "@/components/ParlayRollupCard";
import { CardErrorBoundary } from "@/components/CardErrorBoundary";
import { ExpandCollapseControls } from "@/components/ExpandCollapseControls";
import { getSlate } from "@shared/slate";

// AG Grid alone is ~1MB — only worth loading once someone actually asks
// for the raw leg grid, not on every History page visit.
const ParlayLegsGrid = lazy(() =>
  import("@/components/ParlayLegsGrid").then((m) => ({ default: m.ParlayLegsGrid }))
);

// ── helpers ──────────────────────────────────────────────────────────────────

type TileKey = "total" | "wins" | "losses" | "winRate" | "gameLegs" | "gameWinRate" | "propLegs" | "propWinRate";

// A parlay is "closed" once it's reached one of these terminal statuses —
// matches the terminalStatuses set used server-side for auto win/loss rollup
// (server/storage.ts). Nothing in the app actually restricts reopening a
// closed parlay's status, so "closed" here just means "graded", not "locked".
const TERMINAL_PARLAY_STATUSES = new Set(["win", "loss", "push", "rejected", "void"]);

type HistoryDateRange = { startDate?: string; endDate?: string };
type DateRangeMode = "all" | "year" | "month" | "custom";

function toISODate(d: Date): string {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

// Same All Time / This Year / This Month / Custom pattern as the Dashboard >
// Performance tile's time-range dropdown, applied here as a client-side filter.
//
// `mode` (which Select item is shown) and `range` (what's actually applied)
// are both controlled from the parent rather than mode living in local state
// here — splitting them across component boundaries let them drift out of
// sync after repeated toggling. Lifting both into the same parent state
// keeps them atomic.
function HistoryDateRangeFilter({
  mode,
  range,
  onModeChange,
  onRangeChange,
}: {
  mode: DateRangeMode;
  range: HistoryDateRange;
  onModeChange: (mode: DateRangeMode) => void;
  onRangeChange: (range: HistoryDateRange) => void;
}) {
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleModeChange = (next: string) => {
    const m = next as DateRangeMode;
    onModeChange(m);
    if (m === "all") {
      onRangeChange({});
    } else if (m === "year") {
      const now = new Date();
      onRangeChange({ startDate: toISODate(new Date(now.getFullYear(), 0, 1)), endDate: toISODate(now) });
    } else if (m === "month") {
      const now = new Date();
      onRangeChange({ startDate: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toISODate(now) });
    } else {
      setPopoverOpen(true);
      // Wait for explicit range selection before firing onRangeChange.
    }
  };

  const applyCustomRange = (r: DateRange | undefined) => {
    setCustomRange(r);
    if (r?.from && r?.to) {
      onRangeChange({ startDate: toISODate(r.from), endDate: toISODate(r.to) });
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
              {range.startDate && range.endDate ? `${range.startDate} – ${range.endDate}` : "Pick dates"}
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

// ── LegsWithParlayTable ──────────────────────────────────────────────────────
// Flat per-leg rows pulled from (potentially) multiple parlays at once — shows
// which parlay each leg belongs to (week/#id, and who owns it when it isn't
// the current user's own parlay). Only calls out the parlay when it won —
// losing parlays render with no red status framing, per the "lookthrough"
// design: we highlight wins, not losses.

function LegsWithParlayTable({ legs }: { legs: ParlayLegWithParlayContext[] }) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2 px-1">No legs.</p>;
  }
  return (
    <div className="rounded-lg border border-white/5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground text-xs">
            <th className="text-left px-3 py-2 font-medium">Parlay</th>
            <th className="text-left px-3 py-2 font-medium">Matchup / Prop</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Pick</th>
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-left px-3 py-2 font-medium">Slate</th>
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
                leg.parlay.status === "win" && "bg-green-500/10",
                leg.game?.isFinished && !leg.result && "bg-amber-500/10"
              )}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-xs font-medium">
                    {leg.parlay.week?.label ?? `Week ${leg.parlay.weekId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">#{leg.parlay.id}</span>
                  {leg.parlay.status === "win" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500/40 text-green-400">
                      Win
                    </Badge>
                  )}
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
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {leg.betType === "player_prop" ? "PROP" : (leg.betType ?? "").toUpperCase() || "—"}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{formatPickLabel(leg)}</td>
              <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                {leg.game?.gameTime
                  ? new Date(leg.game.gameTime).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" })
                  : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                {leg.game?.gameTime ? getSlate(new Date(leg.game.gameTime)) : "—"}
              </td>
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

// ── HistoryParlayTile ────────────────────────────────────────────────────────
// Wraps the shared ParlayRollupCard (readOnly) with History-specific chrome:
// a "copy bet slip" action and an opt-in view of every other league member's
// parlay for the same week. Keeps the tile's own header/legs/badges/slate
// display in one place (ParlayRollupCard) instead of duplicating it here.

function HistoryParlayTile({
  parlay,
  onCopySlip,
  copiedId,
  collapseSignal = 0,
  expandSignal = 0,
  defaultExpanded = false,
  highlighted = false,
}: {
  parlay: ParlayWithLegs;
  onCopySlip: (p: ParlayWithLegs) => void;
  copiedId: number | null;
  collapseSignal?: number;
  expandSignal?: number;
  defaultExpanded?: boolean;
  highlighted?: boolean;
}) {
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

  if (parlay.status === "void") {
    return (
      <Card
        id={`parlay-${parlay.id}`}
        className={cn("border-white/5 bg-card/20 opacity-60", highlighted && "ring-2 ring-primary")}
        data-testid={`card-parlay-history-${parlay.id}`}
      >
        <CardContent className="p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {parlay.week?.label ?? `Week ${parlay.weekId}`} — No submission
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      id={`parlay-${parlay.id}`}
      className={cn("space-y-3 rounded-2xl", highlighted && "ring-2 ring-primary")}
      data-testid={`card-parlay-history-${parlay.id}`}
    >
      <CardErrorBoundary parlayId={parlay.id}>
        <ParlayRollupCard
          parlay={parlay}
          leagueId={parlay.leagueId}
          readOnly
          collapseSignal={collapseSignal}
          expandSignal={expandSignal}
          defaultExpanded={defaultExpanded}
          onCopySlip={onCopySlip}
          copiedId={copiedId}
        />
      </CardErrorBoundary>

      <div className="flex items-center gap-2.5 pl-2">
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

      {showAll && !loadingAll && otherParlays.length === 0 && (
        <p className="text-sm text-muted-foreground italic pl-2">
          No other members submitted a parlay this week.
        </p>
      )}

      {showAll && otherParlays.length > 0 && (
        <div className="space-y-3 pl-2">
          <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">
            Other members ({otherParlays.length})
          </p>
          {otherParlays.map(other => (
            <CardErrorBoundary key={other.id} parlayId={other.id}>
              <ParlayRollupCard parlay={other} leagueId={other.leagueId} readOnly defaultExpanded={defaultExpanded} />
            </CardErrorBoundary>
          ))}
        </div>
      )}
    </div>
  );
}

// A week that's closed (every submitted parlay graded) but "not full" — some
// league member who was active in the league at the time never submitted a
// parlay at all. Lets the league admin backfill them as Void so the week's
// record-keeping is complete. Missing-member detection is point-in-time
// aware server-side (see storage.getMissingParlayMembers), so a member who
// joined/left mid-season is judged against who was actually in the league
// that week, not who's in it now.
function MissingBettorBanner({ leagueId, weekId, weekLabel }: { leagueId: number; weekId: number; weekLabel: string }) {
  const { data: missing } = useMissingParlayMembers(leagueId, weekId);
  const backfill = useBackfillMissingParlays(leagueId);

  if (!missing || missing.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-sm">
      <span>
        <strong>{weekLabel}</strong> is closed but {missing.length} member{missing.length === 1 ? "" : "s"} never
        submitted a parlay: {missing.map(m => getDisplayName(m.user, "Member")).join(", ")}.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => backfill.mutate(weekId)}
        disabled={backfill.isPending}
        data-testid={`button-find-missing-bettor-${weekId}`}
      >
        <Search className="w-4 h-4 mr-1" />
        {backfill.isPending ? "Backfilling…" : "Find missing bettor"}
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function History() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: leagues } = useLeagues();
  const search = useSearch();
  // Deep-link target from e.g. a League Records "View bet" link
  // (/history?league=X&parlay=Y) — read once on mount so a later manual
  // league/checkbox change by the user doesn't keep fighting it.
  const [{ leagueId: linkedLeagueId, parlayId: highlightParlayId }] = useState(() => {
    const params = new URLSearchParams(search);
    const league = params.get("league");
    const parlay = params.get("parlay");
    return {
      leagueId: league ? Number(league) : null,
      parlayId: parlay ? Number(parlay) : null,
    };
  });
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(linkedLeagueId ? String(linkedLeagueId) : "all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);
  const [legsCollapsed, setLegsCollapsed] = useState(true);
  const [viewMode, setViewMode] = useState<"tiles" | "grid">("tiles");
  const [legQuery, setLegQuery] = useState("");
  const [parlayQuery, setParlayQuery] = useState("");
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  // Default view: only the current user's own picks. Uncheck to bring in
  // every league member's picks (requires a specific league to be selected).
  // A deep-linked parlay (see highlightParlayId above) may belong to someone
  // else, so start unchecked in that case or it'd never be visible to jump to.
  const [ownPicksOnly, setOwnPicksOnly] = useState(!highlightParlayId);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedBetTypes, setSelectedBetTypes] = useState<string[]>([]);
  const [historyDateRangeMode, setHistoryDateRangeMode] = useState<DateRangeMode>("all");
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
  const { data: myLegs } = useMyLegHistory(leagueId);
  const [activeTile, setActiveTile] = useState<TileKey | null>(null);

  // "My picks only" is a leg-level filter, not a data-source switch: every
  // parlay tile the user has at least one leg in stays visible (owned or
  // not) — only the legs shown inside it narrow down to the user's own. So
  // the underlying parlay data is always "everyone in scope", regardless of
  // the toggle; canShowOthers only controls the member-picker filter below.
  const canShowOthers = !ownPicksOnly;
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
    isLoading: loadingSingleLeagueParlays,
  } = useAllLeagueParlaysReadOnly(leagueId ?? 0, leagueId !== undefined);

  useEffect(() => {
    if (leagueId !== undefined && hasNextAllLeaguePage && !fetchingNextAllLeaguePage) {
      void fetchNextAllLeaguePage();
    }
  }, [leagueId, hasNextAllLeaguePage, fetchingNextAllLeaguePage, fetchNextAllLeaguePage]);

  const allMemberLeagueIds = useMemo(() => (leagues ?? []).map(l => l.id), [leagues]);
  const { data: allLeaguesOthersParlays, isLoading: loadingAllLeaguesParlays } = useAllMyLeaguesParlaysReadOnly(
    allMemberLeagueIds,
    leagueId === undefined,
  );

  const allLeagueParlays = leagueId !== undefined ? flattenParlayPages(allLeaguePages) : allLeaguesOthersParlays;
  const baseParlays = allLeagueParlays;
  const isLoading = leagueId !== undefined ? loadingSingleLeagueParlays : loadingAllLeaguesParlays;

  // Weeks that are fully graded (every parlay submitted for the week has
  // reached a terminal status) but may still be missing a bettor — only
  // meaningful with one specific league selected, and only actionable by
  // that league's admin.
  const isSelectedLeagueAdmin = leagueId !== undefined && !!leagues?.find(l => l.id === leagueId)?.isAdmin;
  const closedWeekGroups = useMemo(() => {
    if (leagueId === undefined) return [];
    const byWeek = new Map<number, { weekId: number; weekLabel: string; parlays: ParlayWithLegs[] }>();
    for (const p of allLeagueParlays) {
      const group = byWeek.get(p.weekId) ?? { weekId: p.weekId, weekLabel: p.week?.label ?? `Week ${p.weekId}`, parlays: [] };
      group.parlays.push(p);
      byWeek.set(p.weekId, group);
    }
    return [...byWeek.values()].filter(
      g => g.parlays.length > 0 && g.parlays.every(p => TERMINAL_PARLAY_STATUSES.has(p.status ?? "")),
    );
  }, [allLeagueParlays, leagueId]);

  const baseLegs: ParlayLegWithParlayContext[] = useMemo(() => {
    const legs = !canShowOthers
      ? (myLegs ?? [])
      : allLeagueParlays.flatMap(p =>
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
    // Lookthrough view: most-recent pick first, by the game's actual kickoff time.
    return [...legs].sort((a, b) => {
      const aTime = a.game?.gameTime ? new Date(a.game.gameTime).getTime() : 0;
      const bTime = b.game?.gameTime ? new Date(b.game.gameTime).getTime() : 0;
      return bTime - aTime || b.id - a.id;
    });
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
      result = result
        .filter(p => p.legs.some(l => selectedMemberIds.includes(l.userId)))
        .map(p => ({ ...p, legs: p.legs.filter(l => selectedMemberIds.includes(l.userId)) }));
    } else if (!canShowOthers) {
      // "My picks only": scope every parlay tile down to just this user's own
      // legs. Unchecking the top-level checkbox is the only way to bring
      // other members' legs back in.
      result = result
        .filter(p => p.legs.some(l => l.userId === user?.id))
        .map(p => ({ ...p, legs: p.legs.filter(l => l.userId === user?.id) }));
    }
    if (selectedBetTypes.length > 0) {
      result = result.filter(p => p.legs.some(l => selectedBetTypes.includes(l.betType)));
    }
    return result;
  }, [dateFilteredParlays, canShowOthers, selectedMemberIds, selectedBetTypes, user?.id]);

  const allowedParlayIdsForDate = useMemo(
    () => new Set(dateFilteredParlays.map(p => p.id)),
    [dateFilteredParlays],
  );

  const structurallyFilteredLegs = useMemo(() => {
    let result = baseLegs.filter(l => allowedParlayIdsForDate.has(l.parlay.id));
    if (canShowOthers && selectedMemberIds.length > 0) {
      result = result.filter(l => selectedMemberIds.includes(l.userId));
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

  // Jump to and highlight a deep-linked parlay (e.g. from a League Records
  // "View bet" link) once its data has actually loaded.
  const scrolledToHighlightRef = useRef(false);
  useEffect(() => {
    if (!highlightParlayId || isLoading || scrolledToHighlightRef.current) return;
    const index = filteredParlays.findIndex(p => p.id === highlightParlayId);
    if (index === -1) return;
    scrolledToHighlightRef.current = true;
    if (shouldVirtualize) {
      rowVirtualizer.scrollToIndex(index, { align: "center" });
      // Virtualized rows mount async after the scroll command above; give
      // the DOM node a tick to exist before trying to scroll to it directly.
      setTimeout(() => {
        document.getElementById(`parlay-${highlightParlayId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    } else {
      document.getElementById(`parlay-${highlightParlayId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightParlayId, isLoading, filteredParlays, shouldVirtualize, rowVirtualizer]);

  const activeParlays = filteredParlays.filter(p => p.status !== "void");
  const stats = {
    total: activeParlays.length,
    wins: activeParlays.filter(p => p.status === "win").length,
    losses: activeParlays.filter(p => p.status === "loss").length,
    pending: activeParlays.filter(p => ["pending", "approved"].includes(p.status || "")).length,
    missed: filteredParlays.filter(p => p.status === "void").length,
  };
  const winRate =
    (stats.wins + stats.losses) > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
      : "0.0";

  const allLegs = filteredMyLegs;
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
    <div className="max-w-screen-2xl mx-auto space-y-8 pb-12">
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

          <HistoryDateRangeFilter
            mode={historyDateRangeMode}
            range={historyDateRange}
            onModeChange={setHistoryDateRangeMode}
            onRangeChange={setHistoryDateRange}
          />

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
              {parlayQuery.trim() || selectedBetTypes.length > 0 || selectedMemberIds.length > 0 || historyDateRange.startDate || ownPicksOnly
                ? " match"
                : " in this league"}
            </p>
            <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => { if (v) setViewMode(v as "tiles" | "grid"); }}
                className="rounded-md border border-white/10 bg-card/40 p-0.5"
              >
                <ToggleGroupItem value="tiles" size="sm" className="gap-1.5 text-xs" data-testid="toggle-view-tiles">
                  <LayoutGrid className="w-3.5 h-3.5" /> Rollup Tiles
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" size="sm" className="gap-1.5 text-xs" data-testid="toggle-view-grid">
                  <Table2 className="w-3.5 h-3.5" /> Table
                </ToggleGroupItem>
              </ToggleGroup>
              {viewMode === "tiles" && (
                <ExpandCollapseControls
                  onCollapseAll={() => setCollapseSignal(s => s + 1)}
                  onExpandAll={() => setExpandSignal(s => s + 1)}
                />
              )}
            </div>
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

          {isSelectedLeagueAdmin && closedWeekGroups.length > 0 && (
            <div className="space-y-2">
              {closedWeekGroups.map(g => (
                <MissingBettorBanner key={g.weekId} leagueId={leagueId!} weekId={g.weekId} weekLabel={g.weekLabel} />
              ))}
            </div>
          )}

          {filteredParlays.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2 px-1">No parlays match this query.</p>
          ) : viewMode === "grid" ? (
            <Suspense fallback={<div className="h-[70vh] bg-white/5 rounded-xl animate-pulse" />}>
              <ParlayLegsGrid rows={flattenParlayLegs(filteredParlays)} />
            </Suspense>
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
                      <HistoryParlayTile
                        parlay={parlay}
                        onCopySlip={handleCopySlip}
                        copiedId={copiedId}
                        collapseSignal={collapseSignal}
                        expandSignal={expandSignal}
                        highlighted={highlightParlayId === parlay.id}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            filteredParlays.map(parlay => (
              <HistoryParlayTile
                key={parlay.id}
                parlay={parlay}
                onCopySlip={handleCopySlip}
                copiedId={copiedId}
                collapseSignal={collapseSignal}
                expandSignal={expandSignal}
                highlighted={highlightParlayId === parlay.id}
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
        <DialogContent className="max-w-6xl w-[95vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeTileInfo?.title}</DialogTitle>
          </DialogHeader>
          {activeTileInfo?.kind === "parlays" ? (
            activeTileInfo.items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No parlays match this stat.</p>
            ) : (
              <div className="space-y-4">
                {activeTileInfo.items.map(p => (
                  <HistoryParlayTile
                    key={p.id}
                    parlay={p}
                    onCopySlip={handleCopySlip}
                    copiedId={copiedId}
                    defaultExpanded
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
