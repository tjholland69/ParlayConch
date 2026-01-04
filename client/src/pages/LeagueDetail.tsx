import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useLeagues, useLeagueStats, useWeeks, useGames, useLeagueParlays, useMyParlay, useCreateParlay, useApproveParlay, useRejectParlay } from "@/hooks/use-bets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Trophy, Calendar, Users, Check, X, Clock, ChevronRight, Loader2, Upload, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ImportHistoryModal } from "@/components/ImportHistoryModal";
import { EditParlayDialog } from "@/components/EditParlayDialog";
import type { Game, ParlayWithLegs } from "@shared/schema";

type ParlayLeg = { gameId: number; betType: string; pick: string; line?: string };

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:id");
  const leagueId = Number(params?.id);
  
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

  const [selectedLegs, setSelectedLegs] = useState<ParlayLeg[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editParlayOpen, setEditParlayOpen] = useState(false);
  const [selectedParlay, setSelectedParlay] = useState<ParlayWithLegs | null>(null);

  const toggleLeg = (game: Game, betType: string, pick: string) => {
    const existing = selectedLegs.findIndex(l => l.gameId === game.id);
    if (existing >= 0) {
      // If same pick, remove. If different, replace.
      if (selectedLegs[existing].pick === pick && selectedLegs[existing].betType === betType) {
        setSelectedLegs(prev => prev.filter((_, i) => i !== existing));
      } else {
        setSelectedLegs(prev => prev.map((l, i) => i === existing ? { gameId: game.id, betType, pick, line: game.spread || undefined } : l));
      }
    } else {
      setSelectedLegs(prev => [...prev, { gameId: game.id, betType, pick, line: game.spread || undefined }]);
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
      {/* Header */}
      <div className="bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold" data-testid="text-league-name">{league.name}</h1>
            {league.description && <p className="text-muted-foreground">{league.description}</p>}
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="w-4 h-4" />{league.memberCount} members</span>
              <span>{minLegs}-{maxLegs} leg parlays</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {league.isAdmin && (
              <Button 
                variant="outline" 
                onClick={() => setImportModalOpen(true)}
                data-testid="button-import-history"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import History
              </Button>
            )}
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
        </TabsList>

        {/* Make Picks Tab */}
        <TabsContent value="picks" className="space-y-6">
          {myParlay ? (
            <Card className="bg-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-primary" />
                  Parlay Submitted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {myParlay.legs.map((leg, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <span>{leg.game.awayTeam} @ {leg.game.homeTeam}</span>
                      <Badge>{leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam} ({leg.betType})</Badge>
                    </div>
                  ))}
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
                        return (
                          <Badge key={i} variant="outline" className="text-sm">
                            {leg.pick === 'home' ? game?.homeTeam : game?.awayTeam}
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
                          {game.venue && <span>{game.venue}</span>}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 items-center">
                          <Button
                            variant={pick?.pick === 'away' ? 'default' : 'outline'}
                            className="flex flex-col h-auto py-3"
                            onClick={() => !isPast && toggleLeg(game, 'spread', 'away')}
                            disabled={isPast}
                            data-testid={`button-pick-away-${game.id}`}
                          >
                            <span className="font-bold">{game.awayTeam}</span>
                            <span className="text-xs text-muted-foreground">{game.awayRecord}</span>
                            {game.spread && <span className="text-xs">+{game.spread?.replace('-', '')}</span>}
                          </Button>
                          
                          <div className="text-center text-sm text-muted-foreground">
                            <span className="block">@</span>
                            {game.spread && <span className="font-mono">{game.spread}</span>}
                          </div>
                          
                          <Button
                            variant={pick?.pick === 'home' ? 'default' : 'outline'}
                            className="flex flex-col h-auto py-3"
                            onClick={() => !isPast && toggleLeg(game, 'spread', 'home')}
                            disabled={isPast}
                            data-testid={`button-pick-home-${game.id}`}
                          >
                            <span className="font-bold">{game.homeTeam}</span>
                            <span className="text-xs text-muted-foreground">{game.homeRecord}</span>
                            {game.spread && <span className="text-xs">{game.spread}</span>}
                          </Button>
                        </div>

                        {game.isFinished && (
                          <div className="mt-3 text-center text-sm">
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
          {leagueParlays?.length === 0 ? (
            <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
              <p className="text-muted-foreground">No parlays submitted for this week yet.</p>
            </div>
          ) : (
            leagueParlays?.map((parlay) => (
              <ContextMenu key={parlay.id}>
                <ContextMenuTrigger asChild>
                  <Card className="bg-card/50 border-white/5" data-testid={`card-parlay-${parlay.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                          {parlay.user?.firstName?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-bold">{parlay.user?.firstName || parlay.user?.email || 'Unknown'}</p>
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
                        {parlay.legs.map((leg, i) => (
                          <div key={i} className="flex items-center justify-between text-sm p-2 bg-white/5 rounded">
                            <span>{leg.game.awayTeam} @ {leg.game.homeTeam}</span>
                            <div className="flex items-center gap-2">
                              {leg.result && (
                                <Badge variant={leg.result === 'win' ? 'default' : leg.result === 'loss' ? 'destructive' : 'secondary'} className="text-xs">
                                  {leg.result}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam}
                              </Badge>
                            </div>
                          </div>
                        ))}
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
            ))
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
      </Tabs>

      {/* Modals */}
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
    </div>
  );
}
