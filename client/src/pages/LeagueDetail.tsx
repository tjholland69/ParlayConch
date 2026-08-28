import { useState, useMemo, useRef, Suspense, lazy, type Dispatch, type SetStateAction, type ElementType } from "react";
import { useRoute, useLocation } from "wouter";
import { useLeagues, useLeagueStats, useWeeks, useGames, useLeagueParlays, useMyParlay, useAddDraftLeg, useRemoveDraftLeg, useSubmitDraftParlay, useTakenPicks, useApproveParlay, useRejectParlay, useWeekLockStatus, useLockWeekParlay, useUnlockWeekParlay, useLeagueMembersWithUsers, useInviteByEmail, useLeaveLeague, useTransferAndLeave, useLeaguesOverviewStats, useAllLeagueParlaysReadOnly, flattenParlayPages, useLeagueDataStats, usePopularPicks, useMyParlayHistory, useLeagueRecords } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Calendar, Users, Check, X, Loader2, Upload, Edit, FlaskConical, Settings, Lock, LockOpen, AlertTriangle, UserPlus, Plus, Trash2, Crown, Star, Mail, LogOut, Download, ChevronDown, LayoutGrid, Table2, Award, Flame, Shield, User, Dices, TrendingUp, TrendingDown, Citrus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ImportHistoryModal } from "@/components/ImportHistoryModal";
import { ImportInstructionsDialog } from "@/components/ImportInstructionsDialog";
import { BetSlipPanel } from "@/components/BetSlipPanel";
import { ParlayRollupCard } from "@/components/ParlayRollupCard";
import { AddPropLegDialog } from "@/components/AddPropLegDialog";
import { flattenParlayLegs } from "@/lib/flattenParlayLegs";
import { CardErrorBoundary } from "@/components/CardErrorBoundary";
import { ExpandCollapseControls } from "@/components/ExpandCollapseControls";
import { LeagueRolesDialog } from "@/components/LeagueRolesDialog";
import { PageLoader } from "@/components/PageLoader";
import { UserAvatar } from "@/components/UserAvatar";
import { getDisplayName, shortId } from "@/lib/displayName";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getBuildingVerb } from "@/lib/parlaySlang";
import type { Game, UserStat } from "@shared/schema";

// AG Grid alone is ~1MB — only worth loading once someone actually asks
// for the raw leg grid, not on every league page visit.
const ParlayLegsGrid = lazy(() =>
  import("@/components/ParlayLegsGrid").then((m) => ({ default: m.ParlayLegsGrid }))
);

function AllParlaysList({
  list,
  leagueId,
  allCollapseSignal,
  allExpandSignal,
  setAllCollapseSignal,
  setAllExpandSignal,
  submittersByWeek,
  memberCount,
  loserLabel,
  heroLabel,
  shouldVirtualize,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  list: import("@shared/schema").ParlayWithLegs[];
  leagueId: number;
  allCollapseSignal: number;
  allExpandSignal: number;
  setAllCollapseSignal: Dispatch<SetStateAction<number>>;
  setAllExpandSignal: Dispatch<SetStateAction<number>>;
  submittersByWeek: Map<number, Set<string>>;
  memberCount: number;
  loserLabel: string | null | undefined;
  heroLabel: string | null | undefined;
  shouldVirtualize: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? list.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 4,
  });

  const renderCard = (parlay: (typeof list)[number]) => (
    <CardErrorBoundary key={parlay.id} parlayId={parlay.id}>
      <ParlayRollupCard
        parlay={parlay}
        leagueId={leagueId}
        readOnly
        collapseSignal={allCollapseSignal}
        expandSignal={allExpandSignal}
        participationRate={(submittersByWeek.get(parlay.weekId)?.size ?? 0) / memberCount}
        loserLabel={loserLabel}
        heroLabel={heroLabel}
      />
    </CardErrorBoundary>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExpandCollapseControls
          onCollapseAll={() => setAllCollapseSignal((s) => s + 1)}
          onExpandAll={() => setAllExpandSignal((s) => s + 1)}
        />
      </div>
      {shouldVirtualize ? (
        <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const parlay = list[virtualRow.index]!;
              return (
                <div
                  key={parlay.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-4"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderCard(parlay)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map(renderCard)}
        </div>
      )}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function StandingsList({ list }: { list: UserStat[] }) {
  if (!list.length) {
    return <p className="text-muted-foreground text-center py-8 text-sm">No stats yet.</p>;
  }
  const sorted = [...list].sort((a, b) => (b.bar ?? 0) - (a.bar ?? 0));
  return (
    <div className="space-y-2">
      {sorted.map((stat, i) => (
        <div
          key={stat.userId}
          className={cn(
            "flex items-center justify-between p-3 rounded-xl border border-transparent",
            i === 0 ? "bg-primary/10 border-primary/20" : "hover:bg-white/5"
          )}
        >
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-mono font-bold w-6 text-center text-sm",
              i === 0 ? "text-primary" : "text-muted-foreground"
            )}>
              {i + 1}
            </span>
            <div className="flex items-center gap-2">
              <UserAvatar
                profileImageUrl={stat.profileImageUrl}
                name={stat.username}
                size="sm"
              />
              <p className="font-bold text-sm">{stat.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Record</p>
              <p className="font-mono text-xs">{stat.wins}-{stat.losses}-{stat.pushes}</p>
            </div>
            <div className="text-right min-w-[50px]">
              <p className="text-xs text-muted-foreground">Win%</p>
              <p className={cn(
                "font-mono font-bold text-sm",
                stat.winRate >= 50 ? "text-primary" : "text-muted-foreground"
              )}>
                {stat.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="text-right min-w-[44px]">
              <p className="text-xs text-muted-foreground">Part%</p>
              <p className="font-mono font-bold text-sm text-foreground">
                {((stat.participationRate ?? 0) * 100).toFixed(0)}%
              </p>
            </div>
            <div className="text-right min-w-[44px]">
              <p className="text-xs text-muted-foreground">Power</p>
              <p className="font-mono font-bold text-sm text-foreground">
                {(stat.powerScore ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="text-right min-w-[44px]">
              <p className="text-xs text-muted-foreground">BAR</p>
              <p className={cn(
                "font-mono font-bold text-sm",
                (stat.bar ?? 0) > 0 ? "text-primary" : (stat.bar ?? 0) < 0 ? "text-destructive" : "text-muted-foreground"
              )}>
                {(stat.bar ?? 0) > 0 ? "+" : ""}{(stat.bar ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const LEAGUE_RECORD_ICONS: Record<string, ElementType> = {
  highestSingleLegOdds: Dices,
  highestSingleLegOddsWon: Award,
  highestParlayOdds: TrendingUp,
  mostParlayLosses: TrendingDown,
  juiceman: Citrus,
  longestWinStreak: Flame,
  longestLossStreak: AlertTriangle,
  favoriteTeam: Shield,
  favoritePlayer: User,
  favoriteBetType: Dices,
};

/**
 * One tile in a game's 3×2 picks grid. All 6 tiles (away spread/ML/over,
 * home spread/ML/under) share the same evenly-sized shape and the same
 * three visual states: selected (this user's own pick), taken (someone
 * else already locked this exact pick in — distinct from a plain disabled
 * tile so it reads as "unavailable" rather than "not postable yet", and
 * labeled with who took it so the tile itself answers "who has this"), and
 * plain disabled (game started, or odds not posted).
 */
function PickTile({
  label,
  subLabel,
  hasOdds,
  isPast,
  isSelected,
  takenBy,
  capReached,
  onClick,
  testId,
}: {
  label: string;
  subLabel?: string | null;
  hasOdds: boolean;
  isPast: boolean;
  isSelected: boolean;
  takenBy?: { web: string; mobile: string } | null;
  capReached: boolean;
  onClick: () => void;
  testId: string;
}) {
  const isTaken = !!takenBy;
  const disabled = isPast || !hasOdds || (!isSelected && (isTaken || capReached));
  return (
    <Button
      size="sm"
      variant={isSelected ? "default" : "outline"}
      className={cn(
        "h-14 min-h-14 py-1.5 flex flex-col items-center justify-center gap-0.5 text-xs leading-tight",
        isTaken && !isSelected && "opacity-40"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span>{label}</span>
      {isTaken && !isSelected ? (
        // Web (sm+ viewports) shows "F.Lastname"; narrower/mobile widths show
        // just the first name — same data, two pre-formatted strings from
        // the server (see shared/pickOwnerLabel.ts) so a full last name
        // never has to round-trip to the client unabbreviated.
        <span className="text-[10px] text-muted-foreground truncate max-w-full">
          <span className="hidden sm:inline">Taken by {takenBy.web}</span>
          <span className="sm:hidden">Taken by {takenBy.mobile}</span>
        </span>
      ) : (
        subLabel && <span className="text-muted-foreground">{subLabel}</span>
      )}
    </Button>
  );
}

function formatRecordDateRange(range: { start: string; end: string } | null | undefined): string | null {
  if (!range) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const start = fmt(range.start);
  const end = fmt(range.end);
  return start === end ? start : `${start} – ${end}`;
}

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:id");
  const leagueId = Number(params?.id);
  const { user } = useAuth();
  
  const { data: leagues } = useLeagues();
  const league = leagues?.find(l => l.id === leagueId);
  
  const { data: weeks } = useWeeks();
  // Header week dropdown — purely a filter for the All Parlays list. Open Parlays
  // always operates on the active week directly, ignoring this selection.
  const [selectedWeekId, setSelectedWeekId] = useState<number | "all">("all");
  const activeWeek = weeks?.find(w => w.isActive);
  const activeWeekId = activeWeek?.id;
  const historicalWeeksDesc = (weeks ?? [])
    .filter(w => !w.isActive)
    .sort((a, b) => (b.season - a.season) || (b.weekNumber - a.weekNumber));

  // All Parlays tab: independent Year / Week / Member filters, defaulting to
  // "All Weeks" / "All Years". Separate from the header week dropdown above.
  const [allYearFilter, setAllYearFilter] = useState<string>("all");
  const [allWeekFilter, setAllWeekFilter] = useState<string>("all");
  const [allMemberFilter, setAllMemberFilter] = useState<string>("all");
  const [allViewMode, setAllViewMode] = useState<"tiles" | "grid">("tiles");
  const [activeTab, setActiveTab] = useState("open");
  const allSeasons = [...new Set((weeks ?? []).map(w => w.season))].sort((a, b) => b - a);
  const allVisibleWeeksDesc = (weeks ?? [])
    .filter(w => allYearFilter === "all" || w.season === Number(allYearFilter))
    .sort((a, b) => (b.season - a.season) || (b.weekNumber - a.weekNumber));

  const { data: stats } = useLeagueStats(leagueId);
  const { data: overviewStats } = useLeaguesOverviewStats();
  const { data: dataStats, isLoading: loadingDataStats } = useLeagueDataStats(leagueId);
  const {
    data: allParlaysPages,
    isLoading: loadingAllParlays,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllLeagueParlaysReadOnly(leagueId, activeTab === "all");
  const allParlays = useMemo(
    () => flattenParlayPages(allParlaysPages),
    [allParlaysPages],
  );

  const { data: games } = useGames(activeWeekId || 0);
  const { data: leagueParlays } = useLeagueParlays(leagueId, activeWeekId || 0);
  const { data: myParlay } = useMyParlay(leagueId, activeWeekId || 0);
  const addDraftLeg = useAddDraftLeg();
  const removeDraftLeg = useRemoveDraftLeg();
  const submitDraftParlay = useSubmitDraftParlay();
  const approveParlay = useApproveParlay();
  const rejectParlay = useRejectParlay();

  const { data: lockStatus } = useWeekLockStatus(leagueId, activeWeekId || 0);
  const openParticipationRate = lockStatus?.totalMembers
    ? lockStatus.submittedCount / lockStatus.totalMembers
    : 1;
  const lockParlay = useLockWeekParlay(leagueId, activeWeekId || 0);
  const unlockParlay = useUnlockWeekParlay(leagueId, activeWeekId || 0);
  const { data: popularPicks } = usePopularPicks(leagueId, activeWeekId || 0);
  const { data: takenPicks } = useTakenPicks(leagueId, activeWeekId || 0);
  const { data: myParlayHistory } = useMyParlayHistory(leagueId);

  const [propDialogGame, setPropDialogGame] = useState<Game | null>(null);
  const [importInstructionsOpen, setImportInstructionsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [openCollapseSignal, setOpenCollapseSignal] = useState(0);
  const [openExpandSignal, setOpenExpandSignal] = useState(0);
  const [allCollapseSignal, setAllCollapseSignal] = useState(0);
  const [allExpandSignal, setAllExpandSignal] = useState(0);

  // CSV export helper
  function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Members tab state
  const { data: members, isLoading: loadingMembers } = useLeagueMembersWithUsers(leagueId);

  // Records tab state
  const { data: leagueRecords, isLoading: loadingRecords } = useLeagueRecords(leagueId);
  const inviteByEmail = useInviteByEmail(leagueId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>(['']);
  const [inviteResults, setInviteResults] = useState<{ email: string; status: string; username?: string }[] | null>(null);

  // Leave league state
  const [, navigate] = useLocation();
  const leaveLeague = useLeaveLeague(leagueId);
  const transferAndLeave = useTransferAndLeave(leagueId);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");

  const getLineForBet = (game: Game, betType: string, pick: string): string | undefined => {
    if (betType === 'spread') {
      const line = pick === 'home' ? game.spread : (game.spread ? (game.spread.startsWith('-') ? `+${game.spread.slice(1)}` : `-${game.spread.slice(1)}`) : null);
      const odds = game.spreadOdds || '-110';
      return line ? `${line} (${odds})` : undefined;
    } else if (betType === 'moneyline') {
      return pick === 'home' ? game.moneylineHome || undefined : game.moneylineAway || undefined;
    } else if (betType === 'over') {
      const odds = game.overOdds || '-110';
      return game.overUnder ? `O${game.overUnder} (${odds})` : undefined;
    } else if (betType === 'under') {
      const odds = game.underOdds || '-110';
      return game.overUnder ? `U${game.overUnder} (${odds})` : undefined;
    }
    return undefined;
  };

  // The draft parlay (server-side, status: 'draft') is now the source of
  // truth for "what's selected" — no local selection state. myParlay is
  // truthy (and its legs populated) as soon as the first tile is tapped,
  // via useMyParlay -> getUserParlayForWeek, which returns draft parlays too.
  const myLegs = myParlay?.legs ?? [];
  const maxBetsPerGame = league?.maxBetsPerGame || 1;

  const legsForGame = (gameId: number) => myLegs.filter(l => l.gameId === gameId);

  const isMySelection = (gameId: number, betType: string, pick: string) =>
    myLegs.some(l => l.gameId === gameId && l.betType === betType && l.pick === pick);

  const takenByOther = (gameId: number, betType: string, pick: string) =>
    (takenPicks ?? []).find(t => t.gameId === gameId && t.betType === betType && t.pick === pick);

  const toggleLeg = (game: Game, betType: string, pick: string) => {
    if (!activeWeekId || !leagueId) return;
    const existing = myLegs.find(l => l.gameId === game.id && l.betType === betType && l.pick === pick);
    if (existing) {
      if (!myParlay) return;
      removeDraftLeg.mutate({ parlayId: myParlay.id, legId: existing.id, leagueId, weekId: activeWeekId });
      return;
    }
    if (takenByOther(game.id, betType, pick)) return;
    if (legsForGame(game.id).length >= maxBetsPerGame) return;
    const line = getLineForBet(game, betType, pick);
    addDraftLeg.mutate({ leagueId, weekId: activeWeekId, leg: { gameId: game.id, betType, pick, line } });
  };

  const submitParlay = () => {
    if (!activeWeekId || !leagueId || !myParlay) return;
    submitDraftParlay.mutate({ parlayId: myParlay.id, leagueId, weekId: activeWeekId });
  };

  if (!league) {
    return <PageLoader />;
  }

  const minLegs = league.minLegsPerParlay || 3;
  const maxLegs = league.maxLegsPerParlay || 5;
  const canSubmit = myLegs.length >= minLegs && myLegs.length <= maxLegs;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6 pb-12">
      {/* Demo Banner */}
      {league.isDemo && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400" data-testid="banner-demo-league">
          <FlaskConical className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">
            This league is flagged as <strong>Demo / QA data</strong> — records here are not live production entries.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-display font-bold" data-testid="text-league-name">{league.name}</h1>
              {league.isDemo && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30" data-testid="badge-league-demo">
                  DEMO
                </Badge>
              )}
            </div>
            {league.description && <p className="text-muted-foreground">{league.description}</p>}
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="w-4 h-4" />{league.memberCount} members</span>
              <span>{minLegs}-{maxLegs} leg parlays</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={String(selectedWeekId)}
              onValueChange={(v) => setSelectedWeekId(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="w-48 bg-background border-white/10" data-testid="select-header-week">
                <Calendar className="w-4 h-4 text-primary mr-2" />
                <SelectValue placeholder="Select Week" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Weeks</SelectItem>
                {activeWeek && (
                  <SelectItem value={activeWeek.id.toString()}>
                    {activeWeek.label} (Current)
                  </SelectItem>
                )}
                {historicalWeeksDesc.map((week) => (
                  <SelectItem key={week.id} value={week.id.toString()}>
                    {week.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-league-actions">
                  League Actions
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {league.isAdmin && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger data-testid="menu-historical-data">
                      Historical Data
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {league.isDemo && (
                        <DropdownMenuItem asChild data-testid="button-demo-data-editor">
                          <Link href={`/leagues/${leagueId}/demo-data`}>
                            <Edit className="w-4 h-4 mr-2" />
                            Data Editor
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          const skip = (user?.settings as any)?.skipImportInstructions;
                          if (skip) {
                            setImportModalOpen(true);
                          } else {
                            setImportInstructionsOpen(true);
                          }
                        }}
                        data-testid="button-import-history"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import History
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild data-testid="button-screenshot-import">
                        <Link href={`/leagues/${leagueId}/screenshot-import`}>
                          <Download className="w-4 h-4 mr-2" />
                          Screenshot Import
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {league.isAdmin && (
                  <DropdownMenuItem asChild data-testid="button-league-settings">
                    <Link href={`/leagues/${leagueId}/settings`}>
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                {league.isAdmin && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => league.isAdmin ? setShowTransferDialog(true) : setShowLeaveConfirm(true)}
                  data-testid="button-leave-league"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave League
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="open" data-testid="tab-open">Open Parlays</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All Parlays</TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data">League Data</TabsTrigger>
          <TabsTrigger value="records" data-testid="tab-records">Records</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
        </TabsList>

        {/* Open Parlays Tab — always scoped to the active week, ignores the header week dropdown */}
        <TabsContent value="open" className="space-y-6">
          {!activeWeekId ? (
            <Card className="bg-card/50 border-white/5">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Calendar className="w-10 h-10 text-muted-foreground" />
                <p className="text-lg font-semibold">No Active Week</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  The season hasn't started yet — check back once the next week's games are live.
                </p>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Lock header row — visible to Parlay Maestro */}
          {league.isAdmin && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-card/40 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span data-testid="text-submission-count">
                  {lockStatus?.submittedCount ?? 0} / {lockStatus?.totalMembers ?? league.memberCount} submitted
                </span>
                {lockStatus?.allSubmitted && !lockStatus?.isLocked && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs ml-1">All in</Badge>
                )}
                {lockStatus?.isLocked && lockStatus?.hadMissingBets && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs ml-1">
                    <AlertTriangle className="w-3 h-3 mr-1" />Locked with missing bets
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lockStatus?.isLocked ? (
                  <>
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30" data-testid="badge-parlay-locked">
                      <Lock className="w-3 h-3 mr-1" />Locked
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlockParlay.mutate()}
                      disabled={unlockParlay.isPending}
                      data-testid="button-unlock-parlay"
                    >
                      <LockOpen className="w-4 h-4 mr-1" />Unlock
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!lockStatus?.allSubmitted) {
                        setShowLockConfirm(true);
                      } else {
                        lockParlay.mutate(false);
                      }
                    }}
                    disabled={lockParlay.isPending}
                    className={cn(
                      "transition-all",
                      lockStatus?.allSubmitted
                        ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                        : "bg-muted text-muted-foreground border-white/10 hover:bg-muted/80"
                    )}
                    data-testid="button-lock-parlay"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock Parlay
                  </Button>
                )}
              </div>
            </div>
          )}

          {lockStatus?.isLocked ? (
            <Card className="bg-card/50 border-white/5">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Lock className="w-10 h-10 text-muted-foreground" />
                <p className="text-lg font-semibold">Parlay Locked</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  The Parlay Maestro has locked this week's parlay. No new submissions or edits are allowed.
                </p>
                {myParlay && (
                  <Badge variant="secondary" className="mt-2">Your submission is locked in</Badge>
                )}
              </CardContent>
            </Card>
          ) : !myParlay || myParlay.status === "draft" ? (
            <>
              {/* Selection Summary */}
              {myLegs.length > 0 && (
                <Card className="bg-card/50 border-white/5">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <CardTitle className="text-lg">Your Parlay ({myLegs.length}/{maxLegs} legs)</CardTitle>
                    <Button
                      onClick={submitParlay}
                      disabled={!canSubmit || submitDraftParlay.isPending}
                      data-testid="button-submit-parlay"
                    >
                      {submitDraftParlay.isPending ? `${getBuildingVerb(leagueId)}...` : "Submit Parlay"}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {!canSubmit && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {myLegs.length < minLegs
                          ? `Select at least ${minLegs} games`
                          : `Maximum ${maxLegs} games allowed`}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {myLegs.map((leg) => {
                        const game = games?.find(g => g.id === leg.gameId);
                        const pickLabel =
                          leg.betType === 'player_prop' ? `${leg.playerName ?? 'Player'} ${leg.pick}` :
                          leg.betType === 'over' ? `O ${game?.overUnder}` :
                          leg.betType === 'under' ? `U ${game?.overUnder}` :
                          leg.pick === 'home' ? game?.homeTeam : game?.awayTeam;
                        const betLabel =
                          leg.betType === 'spread' ? 'SPR' :
                          leg.betType === 'moneyline' ? 'ML' :
                          leg.betType === 'player_prop' ? 'PROP' : '';
                        return (
                          <Badge key={leg.id} variant="outline" className="text-sm">
                            {pickLabel} {betLabel && `(${betLabel})`}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Games Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {games?.map((game) => {
                  const isPast = game.gameTime ? new Date(game.gameTime) < new Date() : false;
                  const capReached = legsForGame(game.id).length >= maxBetsPerGame;

                  const awaySpread = game.spread ? `+${game.spread.replace('-', '')}` : null;
                  const homeSpread = game.spread || null;

                  return (
                    <Card
                      key={game.id}
                      className={cn(
                        "bg-card/50 border-white/5 transition-all",
                        isPast && "opacity-50"
                      )}
                      data-testid={`card-game-${game.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                          <span>{game.gameTime ? format(new Date(game.gameTime), "EEE, MMM d h:mm a") : "Time TBD"}</span>
                          {game.venue && <span className="truncate max-w-[120px]">{game.venue}</span>}
                        </div>
                        <div className="flex items-center justify-between mb-3 text-sm font-medium">
                          <span className="truncate">{game.awayTeam} <span className="text-xs text-muted-foreground">{game.awayRecord}</span></span>
                          <span className="text-xs text-muted-foreground px-1">@</span>
                          <span className="truncate text-right">{game.homeTeam} <span className="text-xs text-muted-foreground">{game.homeRecord}</span></span>
                        </div>

                        {/* 3×2 pick tiles: row 1 = away spread/ML/over, row 2 = home spread/ML/under */}
                        <div className="grid grid-cols-3 gap-2">
                          <PickTile
                            label={awaySpread || '-'}
                            subLabel={game.spreadOdds}
                            hasOdds={!!game.spread}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'spread', 'away')}
                            takenBy={takenByOther(game.id, 'spread', 'away')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'spread', 'away')}
                            testId={`button-spread-away-${game.id}`}
                          />
                          <PickTile
                            label={game.moneylineAway || '-'}
                            hasOdds={!!game.moneylineAway}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'moneyline', 'away')}
                            takenBy={takenByOther(game.id, 'moneyline', 'away')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'moneyline', 'away')}
                            testId={`button-ml-away-${game.id}`}
                          />
                          <PickTile
                            label={`O ${game.overUnder || '-'}`}
                            subLabel={game.overOdds}
                            hasOdds={!!game.overUnder}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'over', 'over')}
                            takenBy={takenByOther(game.id, 'over', 'over')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'over', 'over')}
                            testId={`button-over-${game.id}`}
                          />
                          <PickTile
                            label={homeSpread || '-'}
                            subLabel={game.spreadOdds}
                            hasOdds={!!game.spread}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'spread', 'home')}
                            takenBy={takenByOther(game.id, 'spread', 'home')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'spread', 'home')}
                            testId={`button-spread-home-${game.id}`}
                          />
                          <PickTile
                            label={game.moneylineHome || '-'}
                            hasOdds={!!game.moneylineHome}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'moneyline', 'home')}
                            takenBy={takenByOther(game.id, 'moneyline', 'home')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'moneyline', 'home')}
                            testId={`button-ml-home-${game.id}`}
                          />
                          <PickTile
                            label={`U ${game.overUnder || '-'}`}
                            subLabel={game.underOdds}
                            hasOdds={!!game.overUnder}
                            isPast={isPast}
                            isSelected={isMySelection(game.id, 'under', 'under')}
                            takenBy={takenByOther(game.id, 'under', 'under')?.takenBy}
                            capReached={capReached}
                            onClick={() => toggleLeg(game, 'under', 'under')}
                            testId={`button-under-${game.id}`}
                          />
                        </div>

                        <button
                          type="button"
                          className="mt-3 text-xs text-primary hover:underline"
                          onClick={() => setPropDialogGame(game)}
                          data-testid={`button-view-props-${game.id}`}
                        >
                          View player props →
                        </button>

                        {game.isFinished && (
                          <div className="mt-3 pt-3 border-t border-white/10 text-center text-sm">
                            <span className="font-mono">{game.awayScore} - {game.homeScore}</span>
                            <Badge variant="outline" className="ml-2">Final</Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {propDialogGame && activeWeekId && (
                <AddPropLegDialog
                  game={propDialogGame}
                  leagueId={leagueId}
                  weekId={activeWeekId}
                  open={!!propDialogGame}
                  onOpenChange={(open) => !open && setPropDialogGame(null)}
                />
              )}
            </>
          ) : (
            <>
              {(() => {
                const openParlays = (leagueParlays ?? []).filter(p => p.status === 'pending' || p.status === 'approved');
                if (openParlays.length === 0) {
                  return (
                    <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
                      <p className="text-muted-foreground">No open parlays for this week yet.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <ExpandCollapseControls
                        onCollapseAll={() => setOpenCollapseSignal(s => s + 1)}
                        onExpandAll={() => setOpenExpandSignal(s => s + 1)}
                      />
                    </div>
                    {openParlays.map(parlay => (
                      <div key={parlay.id} className="space-y-2">
                        {league.isAdmin && parlay.status === 'pending' && (
                          <div className="flex justify-end gap-2 -mb-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => approveParlay.mutate(parlay.id)}
                              data-testid={`button-approve-${parlay.id}`}
                            >
                              <Check className="w-4 h-4 text-green-500 mr-1" />Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectParlay.mutate(parlay.id)}
                              data-testid={`button-reject-${parlay.id}`}
                            >
                              <X className="w-4 h-4 text-red-500 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                        <CardErrorBoundary parlayId={parlay.id}>
                          <ParlayRollupCard
                            parlay={parlay}
                            leagueId={leagueId}
                            readOnly
                            collapseSignal={openCollapseSignal}
                            expandSignal={openExpandSignal}
                            participationRate={openParticipationRate}
                            loserLabel={league.loserLabel}
                            heroLabel={league.heroLabel}
                          />
                        </CardErrorBoundary>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Void cards — members who didn't submit when parlay is locked.
                  A 'draft' parlay (still being built, never hit submit) doesn't
                  count as having submitted — without this check, someone who
                  only started a pick would be silently excluded from the void
                  list instead of correctly landing on it. */}
              {lockStatus?.isLocked && league.members
                ?.filter(m => !leagueParlays?.some(p => p.userId === m.userId && p.status !== 'draft'))
                .map(m => (
                  <Card key={m.userId} className="bg-card/30 border-white/10 opacity-60" data-testid={`card-void-${m.userId}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                          {getDisplayName(m.user, "?")[0]}
                        </div>
                        <div>
                          <p className="font-bold text-muted-foreground">{getDisplayName(m.user)}</p>
                          <p className="text-xs text-muted-foreground">No submission</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-muted-foreground border-white/10">
                        Void
                      </Badge>
                    </CardHeader>
                  </Card>
                ))
              }

              {/* Suggested bets — popular picks this week + your own history */}
              {((popularPicks?.length ?? 0) > 0 || (myParlayHistory?.length ?? 0) > 0) && (
                <Card className="bg-card/30 border-white/5">
                  <CardHeader>
                    <CardTitle className="text-base">Need inspiration?</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {popularPicks && popularPicks.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Popular picks this week</p>
                        <div className="flex flex-wrap gap-2">
                          {popularPicks.map((p, i) => {
                            const game = games?.find(g => g.id === p.gameId);
                            const label = p.betType === 'player_prop'
                              ? `${p.playerName ?? 'Player'}${p.propType ? ` — ${p.propType.replace(/_/g, ' ')}` : ''} ${p.pick}`
                              : game
                                ? `${p.pick === 'home' ? game.homeTeam : p.pick === 'away' ? game.awayTeam : p.pick.toUpperCase()} (${p.betType})`
                                : `${p.pick} (${p.betType})`;
                            return (
                              <Badge key={i} variant="outline" className="text-xs">
                                {label} · {p.count} pick{p.count !== 1 ? "s" : ""}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(() => {
                      const freq = new Map<string, { label: string; count: number }>();
                      for (const p of myParlayHistory ?? []) {
                        for (const leg of p.legs) {
                          const key = leg.betType === 'player_prop'
                            ? `prop:${leg.playerName}:${leg.propType}:${leg.pick}`
                            : `bet:${leg.betType}:${leg.pick}`;
                          const label = leg.betType === 'player_prop'
                            ? `${leg.playerName ?? 'Player'}${leg.propType ? ` — ${leg.propType.replace(/_/g, ' ')}` : ''} ${leg.pick}`
                            : `${leg.betType} — ${leg.pick}`;
                          const existing = freq.get(key);
                          if (existing) existing.count++;
                          else freq.set(key, { label, count: 1 });
                        }
                      }
                      const top = [...freq.values()].sort((a, b) => b.count - a.count).slice(0, 5);
                      if (top.length === 0) return null;
                      return (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Picks you've made before</p>
                          <div className="flex flex-wrap gap-2">
                            {top.map((t, i) => (
                              <Badge key={i} variant="outline" className="text-xs capitalize">
                                {t.label} · {t.count}x
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </>
          )}
          </>
          )}
        </TabsContent>

        {/* All Parlays Tab */}
        <TabsContent value="all" className="space-y-6">
          {/* Lightweight league stats strip */}
          {(() => {
            const overview = overviewStats?.[leagueId];
            return (
              <div className="flex flex-wrap items-center gap-6 px-4 py-3 rounded-xl bg-card/40 border border-white/5 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {activeWeek?.label ?? "No active week"}
                </span>
                {overview && overview.totalDecided > 0 && (
                  <>
                    <span className="text-muted-foreground">
                      League win rate: <strong className="text-foreground">{overview.winRate.toFixed(1)}%</strong>
                    </span>
                    <span className="text-muted-foreground">
                      {overview.wins} won · {overview.losses} lost
                    </span>
                  </>
                )}
              </div>
            );
          })()}

          {/* Year / Week / Member filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0 text-muted-foreground">Year:</Label>
              <Select
                value={allYearFilter}
                onValueChange={(v) => {
                  setAllYearFilter(v);
                  if (v !== "all" && allWeekFilter !== "all") {
                    const stillValid = (weeks ?? []).some(w => String(w.id) === allWeekFilter && w.season === Number(v));
                    if (!stillValid) setAllWeekFilter("all");
                  }
                }}
              >
                <SelectTrigger className="w-28 h-9 text-sm" data-testid="select-all-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {allSeasons.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0 text-muted-foreground">Week:</Label>
              <Select value={allWeekFilter} onValueChange={setAllWeekFilter}>
                <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-all-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Weeks</SelectItem>
                  {allVisibleWeeksDesc.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.label} {w.isActive && "(Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0 text-muted-foreground">Member:</Label>
              <Select value={allMemberFilter} onValueChange={setAllMemberFilter}>
                <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-all-member">
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
            <ToggleGroup
              type="single"
              value={allViewMode}
              onValueChange={(v) => { if (v) setAllViewMode(v as "tiles" | "grid"); }}
              className="ml-auto rounded-md border border-white/10 bg-card/40 p-0.5"
            >
              <ToggleGroupItem value="tiles" size="sm" className="gap-1.5 text-xs" data-testid="toggle-view-tiles">
                <LayoutGrid className="w-3.5 h-3.5" /> Rollup Tiles
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" size="sm" className="gap-1.5 text-xs" data-testid="toggle-view-grid">
                <Table2 className="w-3.5 h-3.5" /> Remove Rollup Tile
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {(() => {
            let list = allParlays;
            if (allYearFilter !== "all") {
              list = list.filter(p => p.week?.season === Number(allYearFilter));
            }
            if (allWeekFilter !== "all") {
              list = list.filter(p => p.weekId === Number(allWeekFilter));
            }
            if (allMemberFilter !== "all") {
              list = list
                .filter(p => p.legs.some(l => l.userId === allMemberFilter))
                .map(p => ({ ...p, legs: p.legs.filter(l => l.userId === allMemberFilter) }));
            }
            if (loadingAllParlays) {
              return (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              );
            }
            if (list.length === 0) {
              return (
                <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
                  <p className="text-muted-foreground">No parlays found.</p>
                </div>
              );
            }
            // Participation rate per week: distinct submitters that week / current member count.
            const submittersByWeek = new Map<number, Set<string>>();
            for (const p of allParlays) {
              if (!submittersByWeek.has(p.weekId)) submittersByWeek.set(p.weekId, new Set());
              submittersByWeek.get(p.weekId)!.add(p.userId);
            }
            const memberCount = league.memberCount || 1;
            const shouldVirtualize = list.length > 20;
            if (allViewMode === "grid") {
              return (
                <div className="space-y-3">
                  <Suspense fallback={<div className="h-[70vh] bg-white/5 rounded-xl animate-pulse" />}>
                    <ParlayLegsGrid rows={flattenParlayLegs(list)} />
                  </Suspense>
                  {hasNextPage && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                      >
                        {isFetchingNextPage ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</>
                        ) : (
                          "Load more"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <AllParlaysList
                list={list}
                leagueId={leagueId}
                allCollapseSignal={allCollapseSignal}
                allExpandSignal={allExpandSignal}
                setAllCollapseSignal={setAllCollapseSignal}
                setAllExpandSignal={setAllExpandSignal}
                submittersByWeek={submittersByWeek}
                memberCount={memberCount}
                loserLabel={league.loserLabel}
                heroLabel={league.heroLabel}
                shouldVirtualize={shouldVirtualize}
                hasNextPage={!!hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
              />
            );
          })()}
        </TabsContent>

        {/* League Data Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              {loadingDataStats ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{dataStats?.totalParlays ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total Parlays</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dataStats?.totalLegs ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total Legs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dataStats?.memberCount ?? league.memberCount}</p>
                    <p className="text-xs text-muted-foreground">Members</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(dataStats?.avgLegsPerParlay ?? 0).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">Avg Legs / Parlay</p>
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold whitespace-nowrap">
                      {league.createdAt ? format(new Date(league.createdAt), "MMM d, yyyy") : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">League Created</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50 border-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="w-5 h-5 text-primary" />
                  Current Season Standings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDataStats ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />)}
                  </div>
                ) : (
                  <StandingsList list={dataStats?.currentSeasonStandings ?? []} />
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="w-5 h-5 text-accent" />
                  All-Time Standings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDataStats ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />)}
                  </div>
                ) : (
                  <StandingsList list={dataStats?.allTimeStandings ?? []} />
                )}
              </CardContent>
            </Card>
          </div>

          {stats && stats.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                data-testid="button-export-standings"
                onClick={() => downloadCsv(
                  `${league?.name ?? "league"}-standings.csv`,
                  ["rank", "user_id", "username", "wins", "losses", "pushes", "win_rate_pct", "power_score", "participation_rate", "bar"],
                  stats.map((s, i) => [
                    i + 1,
                    s.userId,
                    s.username,
                    s.wins,
                    s.losses,
                    s.pushes,
                    s.winRate.toFixed(1),
                    (s.powerScore ?? 0).toFixed(3),
                    (s.participationRate ?? 0).toFixed(3),
                    (s.bar ?? 0).toFixed(3),
                  ])
                )}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Records Tab */}
        <TabsContent value="records" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                League Records
              </CardTitle>
              <CardDescription>
                Best-of records across every member's picks in this league — grows over time as new record types are added.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRecords ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : !leagueRecords || leagueRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4">
                  No decided picks yet — records will appear once the league has some history.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {leagueRecords.map(record => {
                    const Icon = LEAGUE_RECORD_ICONS[record.key] ?? Trophy;
                    const holderName = record.holderUserId
                      ? getDisplayName(members?.find(m => m.userId === record.holderUserId)?.user, "Unknown")
                      : null;
                    const weekLabel = record.week ? `${record.week.label}, ${record.week.season}` : null;
                    const dateRangeLabel = formatRecordDateRange(record.dateRange);
                    const winLossLabel = record.winLoss
                      ? `${record.winLoss.wins}-${record.winLoss.losses} (${((record.winLoss.wins / (record.winLoss.wins + record.winLoss.losses || 1)) * 100).toFixed(1)}%)`
                      : null;
                    return (
                      <div key={record.key} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        {record.title ? (
                          <>
                            <div className="flex items-center gap-2 font-display font-bold text-sm mb-0.5">
                              <Icon className="w-3.5 h-3.5 text-primary" />
                              {record.title}
                            </div>
                            {record.label && (
                              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
                                {record.label}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2">
                            <Icon className="w-3.5 h-3.5" />
                            {record.label}
                          </div>
                        )}
                        <p className="font-mono font-bold text-xl truncate">
                          {record.value}
                          {record.detail && (
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">({record.detail})</span>
                          )}
                        </p>
                        {winLossLabel && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">Record: {winLossLabel}</p>
                        )}
                        {holderName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{holderName}</p>
                        )}
                        {weekLabel && (
                          <p className="text-xs text-muted-foreground truncate">{weekLabel}</p>
                        )}
                        {dateRangeLabel && (
                          <p className="text-xs text-muted-foreground truncate">{dateRangeLabel}</p>
                        )}
                        {record.link && (
                          <Link
                            href={`/history?league=${record.link.leagueId}&parlay=${record.link.parlayId}`}
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            View bet →
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                League Members
                <LeagueRolesDialog />
              </CardTitle>
              {league.isAdmin && (
                <Button
                  size="sm"
                  onClick={() => { setInviteEmails(['']); setInviteResults(null); setInviteOpen(true); }}
                  data-testid="button-invite-members"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Invite Members
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white/5 rounded animate-pulse" />)}
                </div>
              ) : !members?.length ? (
                <p className="text-muted-foreground text-center py-8">No members found.</p>
              ) : (
                <div className="space-y-2">
                  {/* Sort: admin first, then lieutenants, then members */}
                  {[...members]
                    .sort((a, b) => {
                      const order = { admin: 0, lieutenant: 1, member: 2 };
                      return (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
                    })
                    .map((m) => (
                      <div
                        key={m.userId}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
                        data-testid={`row-member-${m.userId}`}
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            profileImageUrl={m.user.profileImageUrl}
                            name={getDisplayName(m.user, "?")}
                            size="lg"
                          />
                          <div>
                            <p className="text-sm font-medium">{getDisplayName(m.user)}</p>
                            <p className="text-xs text-muted-foreground">{m.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.user.isDemo && (
                            <Badge className="text-[10px] px-1 py-0 h-4 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">DEMO</Badge>
                          )}
                          {m.role === 'admin' ? (
                            <Badge className="flex items-center gap-1 bg-primary/20 text-primary border-primary/30">
                              <Crown className="w-3 h-3" />
                              Parlay Maestro
                            </Badge>
                          ) : m.role === 'lieutenant' ? (
                            <Badge className="flex items-center gap-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
                              <Star className="w-3 h-3" />
                              Parlay Lieutenant
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Member</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {members && members.length > 0 && (
                <div className="flex justify-end pt-4 border-t border-white/5 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    data-testid="button-export-members"
                    onClick={() => downloadCsv(
                      `${league?.name ?? "league"}-members.csv`,
                      ["user_id", "display_name", "first_name", "email", "role", "is_demo"],
                      [...members]
                        .sort((a, b) => {
                          const order = { admin: 0, lieutenant: 1, member: 2 };
                          return (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
                        })
                        .map(m => [
                          m.userId,
                          (m.user.settings as any)?.displayName ?? "",
                          m.user.firstName ?? "",
                          m.user.email ?? "",
                          m.role,
                          m.user.isDemo ? "true" : "false",
                        ])
                    )}
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite Members Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setInviteResults(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-invite-members">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Invite Members
            </DialogTitle>
            <DialogDescription>
              Enter the email addresses of people you'd like to add to this league. You can invite up to 5 at once.
            </DialogDescription>
          </DialogHeader>

          {inviteResults ? (
            /* Results view */
            <div className="space-y-3 py-2">
              {inviteResults.map((r) => {
                const isInvited = r.status === 'invited';
                const isAdded = r.status === 'added';
                const isMember = r.status === 'already_member';

                return (
                  <div key={r.email} className={cn(
                    "p-3 rounded-lg border",
                    isInvited ? "bg-blue-500/5 border-blue-500/20" :
                    isAdded ? "bg-green-500/5 border-green-500/20" :
                    "bg-white/5 border-white/5"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                        isAdded ? "bg-green-500/20" :
                        isMember ? "bg-yellow-500/20" :
                        "bg-blue-500/20"
                      )}>
                        {isAdded ? <Check className="w-3.5 h-3.5 text-green-400" /> :
                         isMember ? <Users className="w-3.5 h-3.5 text-yellow-400" /> :
                         <Mail className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {isAdded ? `Added to league as ${r.username}` :
                           isMember ? 'Already a member' :
                           'Invite email sent — they\'ll get instructions to join'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Summary note if any invites were sent to non-members */}
              {inviteResults.some(r => r.status === 'invited') && (
                <div className="pt-1 px-1">
                  <p className="text-xs text-muted-foreground">
                    Invite emails were sent automatically from <span className="text-foreground font-medium">invites@parlayconch.com</span> with your league's join code.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Email input view */
            <div className="space-y-3 py-2">
              {inviteEmails.map((email, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`invite-email-${idx}`} className="sr-only">Email {idx + 1}</Label>
                    <Input
                      id={`invite-email-${idx}`}
                      type="email"
                      placeholder={`Email address ${idx + 1}`}
                      value={email}
                      onChange={(e) => {
                        const updated = [...inviteEmails];
                        updated[idx] = e.target.value;
                        setInviteEmails(updated);
                      }}
                      className="bg-background border-white/10"
                      data-testid={`input-invite-email-${idx}`}
                    />
                  </div>
                  {inviteEmails.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setInviteEmails(inviteEmails.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-email-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}

              {inviteEmails.length < 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-white/20 text-muted-foreground hover:text-foreground"
                  onClick={() => setInviteEmails([...inviteEmails, ''])}
                  data-testid="button-add-email"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add another email
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            {inviteResults ? (
              <Button onClick={() => setInviteOpen(false)} data-testid="button-invite-done">Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button
                  onClick={async () => {
                    const validEmails = inviteEmails.filter(e => e.trim() !== '');
                    if (!validEmails.length) return;
                    const data = await inviteByEmail.mutateAsync(validEmails);
                    setInviteResults(data.results);
                  }}
                  disabled={inviteByEmail.isPending || inviteEmails.every(e => !e.trim())}
                  data-testid="button-send-invites"
                >
                  {inviteByEmail.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Sending…</> : "Send Invites"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <ImportInstructionsDialog
        open={importInstructionsOpen}
        onOpenChange={setImportInstructionsOpen}
        onContinue={() => setImportModalOpen(true)}
      />
      <ImportHistoryModal 
        open={importModalOpen} 
        onOpenChange={setImportModalOpen} 
        leagueId={leagueId} 
      />

      {/* Lock confirmation dialog — shown when not all bets are in */}
      <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Lock with missing bets?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Only <strong>{lockStatus?.submittedCount ?? 0} of {lockStatus?.totalMembers ?? 0} members</strong> have submitted their picks for this week.
              </span>
              <span className="block">
                Members who haven't submitted will be marked as <strong>Void</strong> for this week and will not be included in the parlay. This cannot be undone without unlocking.
              </span>
              <span className="block text-yellow-400 font-medium">
                Are you sure you want to lock the parlay now?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-lock">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={() => {
                setShowLockConfirm(false);
                lockParlay.mutate(true);
              }}
              data-testid="button-confirm-lock"
            >
              Lock Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave League — confirmation for regular members / lieutenants */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent data-testid="dialog-leave-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5 text-destructive" />
              Leave {league.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll be removed from this league immediately. You can rejoin later using the league's invite code, but your history will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-leave">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                leaveLeague.mutate(undefined, {
                  onSuccess: () => navigate("/leagues"),
                });
              }}
              disabled={leaveLeague.isPending}
              data-testid="button-confirm-leave"
            >
              {leaveLeague.isPending ? "Leaving…" : "Leave League"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer & Leave — Parlay Maestro must pick a successor */}
      <Dialog open={showTransferDialog} onOpenChange={(open) => { setShowTransferDialog(open); if (!open) setTransferTargetId(""); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-transfer-admin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              Transfer Parlay Maestro &amp; Leave
            </DialogTitle>
            <DialogDescription>
              As the Parlay Maestro, you must hand the role to another member before you can leave. Lieutenants are listed first. Current lieutenants will remain in their roles — the new Maestro can adjust the structure at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto py-1">
            {members
              ?.filter(m => m.userId !== user?.id)
              .sort((a, b) => {
                const order = { lieutenant: 0, member: 1, admin: 2 };
                return (order[a.role as keyof typeof order] ?? 1) - (order[b.role as keyof typeof order] ?? 1);
              })
              .map(m => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setTransferTargetId(m.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors",
                    transferTargetId === m.userId
                      ? "border-primary bg-primary/10"
                      : "border-white/5 bg-white/5 hover:bg-white/8"
                  )}
                  data-testid={`button-select-successor-${m.userId}`}
                >
                  <UserAvatar
                    profileImageUrl={m.user.profileImageUrl}
                    name={getDisplayName(m.user, "?")}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getDisplayName(m.user)}</p>
                    {m.user.email && <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.role === 'lieutenant' && (
                      <Badge className="text-[10px] px-1.5 py-0 h-5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                        <Star className="w-2.5 h-2.5 mr-0.5" />Lieutenant
                      </Badge>
                    )}
                    {m.user.isDemo && (
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">DEMO</Badge>
                    )}
                    {transferTargetId === m.userId && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                </button>
              ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowTransferDialog(false); setTransferTargetId(""); }} data-testid="button-cancel-transfer">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!transferTargetId || transferAndLeave.isPending}
              onClick={() => {
                transferAndLeave.mutate(transferTargetId, {
                  onSuccess: () => navigate("/leagues"),
                });
              }}
              data-testid="button-confirm-transfer-leave"
            >
              {transferAndLeave.isPending ? "Transferring…" : "Transfer & Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
