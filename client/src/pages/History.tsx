import { useBetHistory } from "@/hooks/use-bets";
import { Loader2, History as HistoryIcon, Check, X, Minus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function History() {
  const { data: history, isLoading } = useBetHistory();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // Group by week
  const groupedHistory = history?.reduce((acc, bet) => {
    const weekLabel = bet.week.label;
    if (!acc[weekLabel]) acc[weekLabel] = [];
    acc[weekLabel].push(bet);
    return acc;
  }, {} as Record<string, typeof history>);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <HistoryIcon className="w-8 h-8 text-primary" />
          Betting History
        </h1>
        <p className="text-muted-foreground mt-1">
          Your past performance across all weeks.
        </p>
      </div>

      {!history?.length ? (
        <div className="text-center py-20 bg-card/20 rounded-2xl border border-dashed border-white/10">
          <p className="text-xl font-bold mb-2">No bets yet</p>
          <p className="text-muted-foreground">Head over to the Picks page to get started!</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedHistory || {}).map(([weekLabel, bets]) => (
            <div key={weekLabel} className="space-y-4">
              <h2 className="text-xl font-bold font-display px-2 border-l-4 border-primary text-white/90">
                {weekLabel}
              </h2>
              <div className="grid gap-4">
                {bets.map((bet) => {
                  const isWin = bet.status === 'win';
                  const isLoss = bet.status === 'loss';
                  const isPush = bet.status === 'push';
                  const isPending = bet.status === 'pending';
                  
                  return (
                    <div 
                      key={bet.id}
                      className="bg-card/50 border border-white/5 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:bg-white/5"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground uppercase">
                            {format(new Date(bet.game.gameTime), "MMM d")}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">•</span>
                          <span className="text-xs font-mono text-muted-foreground uppercase">
                            {bet.game.awayTeam} vs {bet.game.homeTeam}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-lg">
                          <span className="text-muted-foreground">You Picked:</span>
                          <span className={cn(
                            "font-bold font-display",
                            isWin ? "text-primary" : isLoss ? "text-destructive" : "text-white"
                          )}>
                            {bet.pick === 'home' ? bet.game.homeTeam : bet.game.awayTeam}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right">
                           <p className="text-xs text-muted-foreground uppercase tracking-wider">Spread</p>
                           <p className="font-mono">{bet.game.spread || "PK"}</p>
                        </div>

                        <div className={cn(
                          "px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center gap-2 border",
                          isWin ? "bg-green-500/10 text-green-400 border-green-500/20" :
                          isLoss ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          isPush ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                          "bg-white/5 text-muted-foreground border-white/10"
                        )}>
                          {isWin && <Check className="w-4 h-4" />}
                          {isLoss && <X className="w-4 h-4" />}
                          {isPush && <Minus className="w-4 h-4" />}
                          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                          {bet.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
