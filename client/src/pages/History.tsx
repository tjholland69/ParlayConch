import { useMyParlayHistory, useLeagues } from "@/hooks/use-bets";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Trophy, Filter, Calendar, Loader2, Copy, Check } from "lucide-react";
import { buildSlipText } from "@/components/BetSlipPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function History() {
  const { toast } = useToast();
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  const getStatusVariant = (status: string | null): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case 'win': return 'default';
      case 'loss': return 'destructive';
      case 'push': return 'secondary';
      case 'approved': return 'outline';
      case 'rejected': return 'destructive';
      case 'void': return 'outline';
      default: return 'secondary';
    }
  };

  const activeParlays = parlays?.filter(p => p.status !== 'void') ?? [];
  const stats = {
    total: activeParlays.length,
    wins: activeParlays.filter(p => p.status === 'win').length,
    losses: activeParlays.filter(p => p.status === 'loss').length,
    pending: activeParlays.filter(p => ['pending', 'approved'].includes(p.status || '')).length,
    missed: parlays?.filter(p => p.status === 'void').length || 0,
  };
  const winRate = (stats.wins + stats.losses) > 0 
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) 
    : '0.0';

  // Leg-level breakdown: game outcomes vs player props
  const allLegs = parlays?.flatMap(p => p.legs) ?? [];
  const gameLegs = allLegs.filter(l => l.betType !== 'player_prop');
  const propLegs = allLegs.filter(l => l.betType === 'player_prop');
  const totalLegs = allLegs.length;

  const gameLegsWithResult = gameLegs.filter(l => l.result === 'win' || l.result === 'loss');
  const propLegsWithResult = propLegs.filter(l => l.result === 'win' || l.result === 'loss');

  const gamePct = totalLegs > 0 ? ((gameLegs.length / totalLegs) * 100).toFixed(0) : '—';
  const propPct = totalLegs > 0 ? ((propLegs.length / totalLegs) * 100).toFixed(0) : '—';
  const gameWinRate = gameLegsWithResult.length > 0
    ? ((gameLegs.filter(l => l.result === 'win').length / gameLegsWithResult.length) * 100).toFixed(1)
    : '—';
  const propWinRate = propLegsWithResult.length > 0
    ? ((propLegs.filter(l => l.result === 'win').length / propLegsWithResult.length) * 100).toFixed(1)
    : '—';

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
            {leagues?.map((league) => (
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
            <p className={cn(
              "text-2xl font-bold font-mono",
              parseFloat(winRate) >= 50 ? "text-primary" : "text-muted-foreground"
            )}>
              {winRate}%
            </p>
            <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
          </CardContent>
        </Card>

        {/* Game Outcome vs Player Prop breakdown */}
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-blue-400">
              {gamePct === '—' ? '—' : `${gamePct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Game Outcome Legs</p>
            <p className="text-xs text-blue-400/60 mt-0.5">
              {gameLegs.length} leg{gameLegs.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className={cn(
              "text-2xl font-bold font-mono",
              gameWinRate !== '—' && parseFloat(gameWinRate) >= 50 ? "text-primary" : "text-muted-foreground"
            )}>
              {gameWinRate === '—' ? '—' : `${gameWinRate}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Game Outcome Win %</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {gameLegsWithResult.length > 0 ? `${gameLegs.filter(l => l.result === 'win').length}W / ${gameLegsWithResult.length} settled` : 'no results yet'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold font-mono text-violet-400">
              {propPct === '—' ? '—' : `${propPct}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Player Prop Legs</p>
            <p className="text-xs text-violet-400/60 mt-0.5">
              {propLegs.length} leg{propLegs.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-white/5">
          <CardContent className="p-4 text-center">
            <p className={cn(
              "text-2xl font-bold font-mono",
              propWinRate !== '—' && parseFloat(propWinRate) >= 50 ? "text-primary" : "text-muted-foreground"
            )}>
              {propWinRate === '—' ? '—' : `${propWinRate}%`}
            </p>
            <p className="text-xs text-muted-foreground uppercase">Player Prop Win %</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {propLegsWithResult.length > 0 ? `${propLegs.filter(l => l.result === 'win').length}W / ${propLegsWithResult.length} settled` : 'no results yet'}
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
          {parlays.map((parlay) => (
            <Card
              key={parlay.id}
              className={cn("border-white/5", parlay.status === 'void' ? "bg-card/20 opacity-60" : "bg-card/50")}
              data-testid={`card-parlay-history-${parlay.id}`}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{parlay.week.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {parlay.createdAt && format(new Date(parlay.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {parlay.status !== 'void' && (
                    <button
                      onClick={() => handleCopySlip(parlay)}
                      title="Copy bet slip"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    >
                      {copiedId === parlay.id
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <Badge variant={getStatusVariant(parlay.status)} className={parlay.status === 'void' ? 'text-muted-foreground border-white/10' : ''}>
                    {parlay.status === 'void' ? 'Void' : parlay.status}
                  </Badge>
                </div>
              </CardHeader>
              {parlay.status === 'void' ? (
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">No submission — missed this week</p>
                </CardContent>
              ) : (
              <CardContent>
                <div className="space-y-2">
                  {parlay.legs.map((leg, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "flex flex-col gap-1 text-sm p-3 rounded-lg",
                        leg.result === 'win' ? "bg-primary/10" :
                        leg.result === 'loss' ? "bg-destructive/10" :
                        "bg-white/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(leg as any).gameSegment && (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 leading-none">
                              {(leg as any).gameSegment}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {leg.betType === 'player_prop'
                              ? `${leg.playerName || 'Player'}${leg.propType ? ` — ${leg.propType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : ''}`
                              : `${leg.game?.awayTeam ?? '?'} @ ${leg.game?.homeTeam ?? '?'}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {leg.betType === 'player_prop'
                              ? `${leg.pick.charAt(0).toUpperCase()}${leg.pick.slice(1)}${leg.line ? ` ${leg.line}` : ''}${(leg as any).odds ? ` (${(leg as any).odds})` : ''}`
                              : leg.betType === 'over'
                              ? `Over ${leg.line || leg.game?.overUnder}${(leg as any).odds ? ` (${(leg as any).odds})` : ''}`
                              : leg.betType === 'under'
                              ? `Under ${leg.line || leg.game?.overUnder}${(leg as any).odds ? ` (${(leg as any).odds})` : ''}`
                              : leg.betType === 'moneyline'
                              ? `${leg.pick === 'home' ? leg.game?.homeTeam : leg.game?.awayTeam}${(leg as any).odds ? ` ${(leg as any).odds}` : ''}`
                              : `${leg.pick === 'home' ? leg.game?.homeTeam : leg.game?.awayTeam}${leg.line ? ` ${leg.line}` : ''}${(leg as any).odds ? ` (${(leg as any).odds})` : ''}`}
                          </Badge>
                          {leg.result && (
                            <Badge variant={leg.result === 'win' ? 'default' : leg.result === 'loss' ? 'destructive' : 'secondary'} className="text-xs">
                              {leg.result}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {leg.notes && (
                        <p className="text-xs text-muted-foreground italic pl-1 border-l border-white/10">
                          {leg.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                
                {parlay.legs.some(l => l.game?.isFinished) && (
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {parlay.legs.filter(l => l.result === 'win').length} / {parlay.legs.length} legs hit
                    </span>
                  </div>
                )}
              </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
