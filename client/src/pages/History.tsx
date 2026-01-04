import { useMyParlayHistory, useLeagues } from "@/hooks/use-bets";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Trophy, Filter, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function History() {
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  
  const leagueId = selectedLeagueId === "all" ? undefined : Number(selectedLeagueId);
  const { data: parlays, isLoading } = useMyParlayHistory(leagueId);

  const getStatusVariant = (status: string | null): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case 'win': return 'default';
      case 'loss': return 'destructive';
      case 'push': return 'secondary';
      case 'approved': return 'outline';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  const stats = {
    total: parlays?.length || 0,
    wins: parlays?.filter(p => p.status === 'win').length || 0,
    losses: parlays?.filter(p => p.status === 'loss').length || 0,
    pending: parlays?.filter(p => ['pending', 'approved'].includes(p.status || '')).length || 0,
  };
  const winRate = (stats.wins + stats.losses) > 0 
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) 
    : '0.0';

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
            <Card key={parlay.id} className="bg-card/50 border-white/5" data-testid={`card-parlay-history-${parlay.id}`}>
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
                <Badge variant={getStatusVariant(parlay.status)}>
                  {parlay.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {parlay.legs.map((leg, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "flex items-center justify-between text-sm p-3 rounded-lg",
                        leg.result === 'win' ? "bg-primary/10" :
                        leg.result === 'loss' ? "bg-destructive/10" :
                        "bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{leg.game.awayTeam} @ {leg.game.homeTeam}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {leg.pick === 'home' ? leg.game.homeTeam : leg.game.awayTeam}
                        </Badge>
                        {leg.result && (
                          <Badge variant={leg.result === 'win' ? 'default' : leg.result === 'loss' ? 'destructive' : 'secondary'} className="text-xs">
                            {leg.result}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {parlay.legs.some(l => l.game.isFinished) && (
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {parlay.legs.filter(l => l.result === 'win').length} / {parlay.legs.length} legs hit
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
