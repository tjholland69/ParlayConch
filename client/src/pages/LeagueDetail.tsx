import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useLeagues, useLeagueStats, useWeeks, useGames, useLeagueParlays, useMyParlay, useCreateParlay, useApproveParlay, useRejectParlay, useWeekLockStatus, useLockWeekParlay, useUnlockWeekParlay, useLeagueMembersWithUsers, useInviteByEmail, useLeaveLeague, useTransferAndLeave } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Calendar, Users, Check, X, Clock, ChevronRight, Loader2, Upload, Edit, FlaskConical, Settings, Lock, LockOpen, AlertTriangle, UserPlus, Plus, Trash2, Crown, Star, Mail, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ImportHistoryModal } from "@/components/ImportHistoryModal";
import { ImportInstructionsDialog } from "@/components/ImportInstructionsDialog";
import { EditParlayDialog } from "@/components/EditParlayDialog";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { Game, ParlayWithLegs } from "@shared/schema";

type ParlayLeg = { gameId: number; betType: string; pick: string; line?: string };

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:id");
  const leagueId = Number(params?.id);
  const { user } = useAuth();
  
  const { data: leagues } = useLeagues();
  const league = leagues?.find(l => l.id === leagueId);
  
  const { data: stats, isLoading: loadingStats } = useLeagueStats(leagueId);
  const { data: weeks } = useWeeks();
  const [selectedWeekId, setSelectedWeekId] = useState<number | undefined>();
  
  useEffect(() => {
    if (weeks?.length && !selectedWeekId) {
      const active = weeks.find(w => w.isActive);
      setSelectedWeekId(active?.id || weeks[0].id);
    }
  }, [weeks, selectedWeekId]);

  const { data: games } = useGames(selectedWeekId || 0);
  const { data: leagueParlays } = useLeagueParlays(leagueId, selectedWeekId || 0);
  const { data: myParlay } = useMyParlay(leagueId, selectedWeekId || 0);
  const createParlay = useCreateParlay();
  const approveParlay = useApproveParlay();
  const rejectParlay = useRejectParlay();

  const { data: lockStatus } = useWeekLockStatus(leagueId, selectedWeekId || 0);
  const lockParlay = useLockWeekParlay(leagueId, selectedWeekId || 0);
  const unlockParlay = useUnlockWeekParlay(leagueId, selectedWeekId || 0);

  const [selectedLegs, setSelectedLegs] = useState<ParlayLeg[]>([]);
  const [importInstructionsOpen, setImportInstructionsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editParlayOpen, setEditParlayOpen] = useState(false);
  const [selectedParlay, setSelectedParlay] = useState<ParlayWithLegs | null>(null);
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  // Members tab state
  const { data: members, isLoading: loadingMembers } = useLeagueMembersWithUsers(leagueId);
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

  const toggleLeg = (game: Game, betType: string, pick: string) => {
    const existing = selectedLegs.findIndex(l => l.gameId === game.id);
    const line = getLineForBet(game, betType, pick);
    
    if (existing >= 0) {
      if (selectedLegs[existing].pick === pick && selectedLegs[existing].betType === betType) {
        setSelectedLegs(prev => prev.filter((_, i) => i !== existing));
      } else {
        setSelectedLegs(prev => prev.map((l, i) => i === existing ? { gameId: game.id, betType, pick, line } : l));
      }
    } else {
      setSelectedLegs(prev => [...prev, { gameId: game.id, betType, pick, line }]);
    }
  };

  const submitParlay = () => {
    if (!selectedWeekId || !leagueId) return;
    createParlay.mutate({ leagueId, weekId: selectedWeekId, legs: selectedLegs }, {
      onSuccess: () => setSelectedLegs([])
    });
  };

  const getPickForGame = (gameId: number) => {
    return selectedLegs.find(l => l.gameId === gameId);
  };

  if (!league) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  const minLegs = league.minLegsPerParlay || 3;
  const maxLegs = league.maxLegsPerParlay || 5;
  const canSubmit = selectedLegs.length >= minLegs && selectedLegs.length <= maxLegs;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
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
            {league.isAdmin && (
              <>
                <Button
                  variant="outline"
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
                </Button>
                <Link href={`/leagues/${leagueId}/settings`}>
                  <Button variant="outline" data-testid="button-league-settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </Link>
              </>
            )}
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => league.isAdmin ? setShowTransferDialog(true) : setShowLeaveConfirm(true)}
              data-testid="button-leave-league"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave League 😢
            </Button>
            <Select value={selectedWeekId?.toString()} onValueChange={(v) => setSelectedWeekId(Number(v))}>
              <SelectTrigger className="w-48 bg-background border-white/10">
                <Calendar className="w-4 h-4 text-primary mr-2" />
                <SelectValue placeholder="Select Week" />
              </SelectTrigger>
              <SelectContent>
                {weeks?.map((week) => (
                  <SelectItem key={week.id} value={week.id.toString()}>
                    {week.label} {week.isActive && "(Current)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs defaultValue="picks" className="space-y-6">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="picks" data-testid="tab-picks">Make Picks</TabsTrigger>
          <TabsTrigger value="parlays" data-testid="tab-parlays">League Parlays</TabsTrigger>
          <TabsTrigger value="standings" data-testid="tab-standings">Standings</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
        </TabsList>

        {/* Make Picks Tab */}
        <TabsContent value="picks" className="space-y-6">
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
          ) : myParlay ? (
            <Card className="bg-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-primary" />
                  Parlay Submitted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {myParlay.legs.map((leg, i) => {
                    const pickDisplay = 
                      leg.betType === 'over' ? `Over ${leg.line || leg.game.overUnder}` :
                      leg.betType === 'under' ? `Under ${leg.line || leg.game.overUnder}` :
                      leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam;
                    const lineDisplay = 
                      leg.betType === 'spread' ? leg.line || leg.game.spread :
                      leg.betType === 'moneyline' ? (leg.pick === 'home' ? leg.game.moneylineHome : leg.game.moneylineAway) :
                      null;
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <span className="text-sm">{leg.game.awayTeam} @ {leg.game.homeTeam}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs uppercase">{leg.betType}</Badge>
                          <Badge>{pickDisplay} {lineDisplay && `(${lineDisplay})`}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Badge variant={myParlay.status === 'approved' ? 'default' : myParlay.status === 'rejected' ? 'destructive' : 'secondary'}>
                    {myParlay.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Selection Summary */}
              {selectedLegs.length > 0 && (
                <Card className="bg-card/50 border-white/5">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <CardTitle className="text-lg">Your Parlay ({selectedLegs.length}/{maxLegs} legs)</CardTitle>
                    <Button 
                      onClick={submitParlay} 
                      disabled={!canSubmit || createParlay.isPending}
                      data-testid="button-submit-parlay"
                    >
                      {createParlay.isPending ? "Submitting..." : "Submit Parlay"}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {!canSubmit && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {selectedLegs.length < minLegs 
                          ? `Select at least ${minLegs} games` 
                          : `Maximum ${maxLegs} games allowed`}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selectedLegs.map((leg, i) => {
                        const game = games?.find(g => g.id === leg.gameId);
                        const pickLabel = 
                          leg.betType === 'over' ? `O ${game?.overUnder}` :
                          leg.betType === 'under' ? `U ${game?.overUnder}` :
                          leg.pick === 'home' ? game?.homeTeam : game?.awayTeam;
                        const betLabel = 
                          leg.betType === 'spread' ? 'SPR' :
                          leg.betType === 'moneyline' ? 'ML' : '';
                        return (
                          <Badge key={i} variant="outline" className="text-sm">
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
                  const pick = getPickForGame(game.id);
                  const isPast = new Date(game.gameTime) < new Date();
                  
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
                        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
                          <span>{format(new Date(game.gameTime), "EEE, MMM d h:mm a")}</span>
                          {game.venue && <span className="truncate max-w-[120px]">{game.venue}</span>}
                        </div>
                        
                        {/* Teams Header */}
                        <div className="grid grid-cols-4 gap-1 mb-3 text-sm font-medium">
                          <div></div>
                          <div className="text-center text-muted-foreground text-xs">Spread</div>
                          <div className="text-center text-muted-foreground text-xs">ML</div>
                          <div className="text-center text-muted-foreground text-xs">Total</div>
                        </div>

                        {/* Away Team Row */}
                        <div className="grid grid-cols-4 gap-1 mb-2 items-center">
                          <div className="pr-2">
                            <div className="font-bold text-sm truncate">{game.awayTeam}</div>
                            <div className="text-xs text-muted-foreground">{game.awayRecord}</div>
                          </div>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'spread' && pick?.pick === 'away' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs leading-tight"
                            onClick={() => !isPast && toggleLeg(game, 'spread', 'away')}
                            disabled={isPast || !game.spread}
                            data-testid={`button-spread-away-${game.id}`}
                          >
                            <span>{awaySpread || '-'}</span>
                            {game.spreadOdds && <span className="text-muted-foreground">{game.spreadOdds}</span>}
                          </Button>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'moneyline' && pick?.pick === 'away' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs"
                            onClick={() => !isPast && toggleLeg(game, 'moneyline', 'away')}
                            disabled={isPast || !game.moneylineAway}
                            data-testid={`button-ml-away-${game.id}`}
                          >
                            {game.moneylineAway || '-'}
                          </Button>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'over' && pick?.pick === 'over' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs leading-tight"
                            onClick={() => !isPast && toggleLeg(game, 'over', 'over')}
                            disabled={isPast || !game.overUnder}
                            data-testid={`button-over-${game.id}`}
                          >
                            <span>O {game.overUnder || '-'}</span>
                            {game.overOdds && <span className="text-muted-foreground">{game.overOdds}</span>}
                          </Button>
                        </div>

                        {/* Home Team Row */}
                        <div className="grid grid-cols-4 gap-1 items-center">
                          <div className="pr-2">
                            <div className="font-bold text-sm truncate">{game.homeTeam}</div>
                            <div className="text-xs text-muted-foreground">{game.homeRecord}</div>
                          </div>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'spread' && pick?.pick === 'home' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs leading-tight"
                            onClick={() => !isPast && toggleLeg(game, 'spread', 'home')}
                            disabled={isPast || !game.spread}
                            data-testid={`button-spread-home-${game.id}`}
                          >
                            <span>{homeSpread || '-'}</span>
                            {game.spreadOdds && <span className="text-muted-foreground">{game.spreadOdds}</span>}
                          </Button>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'moneyline' && pick?.pick === 'home' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs"
                            onClick={() => !isPast && toggleLeg(game, 'moneyline', 'home')}
                            disabled={isPast || !game.moneylineHome}
                            data-testid={`button-ml-home-${game.id}`}
                          >
                            {game.moneylineHome || '-'}
                          </Button>
                          <Button
                            size="sm"
                            variant={pick?.betType === 'under' && pick?.pick === 'under' ? 'default' : 'outline'}
                            className="h-auto py-1.5 flex flex-col text-xs leading-tight"
                            onClick={() => !isPast && toggleLeg(game, 'under', 'under')}
                            disabled={isPast || !game.overUnder}
                            data-testid={`button-under-${game.id}`}
                          >
                            <span>U {game.overUnder || '-'}</span>
                            {game.underOdds && <span className="text-muted-foreground">{game.underOdds}</span>}
                          </Button>
                        </div>

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
            </>
          )}
        </TabsContent>

        {/* League Parlays Tab */}
        <TabsContent value="parlays" className="space-y-4">
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

          {leagueParlays?.length === 0 && !lockStatus?.isLocked ? (
            <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
              <p className="text-muted-foreground">No parlays submitted for this week yet.</p>
            </div>
          ) : (
            <>
            {leagueParlays?.map((parlay) => (
              <ContextMenu key={parlay.id}>
                <ContextMenuTrigger asChild>
                  <Card className="bg-card/50 border-white/5" data-testid={`card-parlay-${parlay.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                          {parlay.user?.firstName?.[0] || '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold">{parlay.user?.firstName || parlay.user?.email || 'Unknown'}</p>
                            {parlay.user?.isDemo && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-4" data-testid={`badge-demo-user-${parlay.id}`}>
                                DEMO
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {parlay.legs.length} leg parlay
                            {parlay.source === 'imported' && <Badge variant="outline" className="ml-2 text-xs">Imported</Badge>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          parlay.status === 'approved' ? 'default' :
                          parlay.status === 'rejected' ? 'destructive' :
                          parlay.status === 'win' ? 'default' :
                          parlay.status === 'loss' ? 'destructive' :
                          'secondary'
                        }>
                          {parlay.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {parlay.status}
                        </Badge>
                        
                        {league.isAdmin && parlay.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => approveParlay.mutate(parlay.id)}
                              data-testid={`button-approve-${parlay.id}`}
                            >
                              <Check className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => rejectParlay.mutate(parlay.id)}
                              data-testid={`button-reject-${parlay.id}`}
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {parlay.legs.map((leg, i) => {
                          const pickDisplay = 
                            leg.betType === 'over' ? `Over ${leg.line || leg.game.overUnder}` :
                            leg.betType === 'under' ? `Under ${leg.line || leg.game.overUnder}` :
                            leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam;
                          const lineDisplay = 
                            leg.betType === 'spread' ? leg.line || leg.game.spread :
                            leg.betType === 'moneyline' ? (leg.pick === 'home' ? leg.game.moneylineHome : leg.game.moneylineAway) :
                            null;
                          return (
                            <div key={i} className="flex items-center justify-between text-sm p-2 bg-white/5 rounded">
                              <span>{leg.game.awayTeam} @ {leg.game.homeTeam}</span>
                              <div className="flex items-center gap-2">
                                {leg.result && (
                                  <Badge variant={leg.result === 'win' ? 'default' : leg.result === 'loss' ? 'destructive' : 'secondary'} className="text-xs">
                                    {leg.result}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs uppercase">{leg.betType}</Badge>
                                <Badge variant="outline" className="text-xs">
                                  {pickDisplay} {lineDisplay && `(${lineDisplay})`}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </ContextMenuTrigger>
                {league.isAdmin && (
                  <ContextMenuContent>
                    <ContextMenuItem 
                      onClick={() => { setSelectedParlay(parlay); setEditParlayOpen(true); }}
                      data-testid={`context-edit-${parlay.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Parlay
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
            ))}
            {/* Void cards — members who didn't submit when parlay is locked */}
            {lockStatus?.isLocked && league.members
              ?.filter(m => !leagueParlays?.some(p => p.userId === m.userId))
              .map(m => (
                <Card key={m.userId} className="bg-card/30 border-white/10 opacity-60" data-testid={`card-void-${m.userId}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
                        {m.user?.firstName?.[0] || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-muted-foreground">{m.user?.firstName || m.user?.email || 'Unknown'}</p>
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
            </>
          )}
        </TabsContent>

        {/* Standings Tab */}
        <TabsContent value="standings">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-accent" />
                League Standings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />)}
                </div>
              ) : !stats?.length ? (
                <p className="text-muted-foreground text-center py-8">No stats yet. Start making picks!</p>
              ) : (
                <div className="space-y-2">
                  {stats.map((stat, i) => (
                    <div 
                      key={stat.userId}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border border-transparent",
                        i === 0 ? "bg-primary/10 border-primary/20" : "hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span className={cn(
                          "font-mono font-bold w-6 text-center",
                          i === 0 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          {stat.profileImageUrl ? (
                            <img src={stat.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                              {stat.username[0]}
                            </div>
                          )}
                          <p className="font-bold">{stat.username}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Record</p>
                          <p className="font-mono text-sm">{stat.wins}-{stat.losses}-{stat.pushes}</p>
                        </div>
                        <div className="text-right min-w-[60px]">
                          <p className={cn(
                            "font-mono font-bold text-xl",
                            stat.winRate >= 50 ? "text-primary" : "text-muted-foreground"
                          )}>
                            {stat.winRate.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
                          {m.user.profileImageUrl ? (
                            <img src={m.user.profileImageUrl} alt="" className="w-9 h-9 rounded-full" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                              {(m.user.firstName || m.user.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium">{m.user.firstName || m.user.email}</p>
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
      <EditParlayDialog
        open={editParlayOpen}
        onOpenChange={setEditParlayOpen}
        parlay={selectedParlay}
        leagueId={leagueId}
        weekId={selectedWeekId || 0}
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
                  {m.user.profileImageUrl ? (
                    <img src={m.user.profileImageUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                      {(m.user.firstName || m.user.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.user.firstName || m.user.email}</p>
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
