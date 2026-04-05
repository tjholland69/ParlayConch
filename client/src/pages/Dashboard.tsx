import { useStats } from "@/hooks/use-bets";
import { StatsChart } from "@/components/StatsChart";
import { NewsFeed } from "@/components/NewsFeed";
import { BettingInsights } from "@/components/BettingInsights";
import { Trophy, TrendingUp, AlertCircle, Medal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse p-6">
        <div className="h-48 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold">Failed to load stats</h2>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  if (!stats?.length) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold">No stats available yet.</h2>
        <p className="text-muted-foreground">Start picking games to see the leaderboard!</p>
      </div>
    );
  }

  const topPlayer = stats.reduce((prev, current) => 
    (prev.winRate > current.winRate) ? prev : current
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-background to-background border border-primary/20 p-8 md:p-12">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
          <Trophy className="w-64 h-64 rotate-12" />
        </div>
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
            <Medal className="w-4 h-4" />
            Current Leader
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-2">
            {topPlayer.username}
          </h1>
          <div className="flex items-end gap-2">
            <span className="text-5xl md:text-7xl font-mono font-bold text-primary text-glow">
              {topPlayer.winRate}%
            </span>
            <span className="text-muted-foreground font-mono mb-2 md:mb-3">Win Rate</span>
          </div>
          
          <div className="mt-8 flex gap-8">
            <div>
              <p className="text-muted-foreground text-sm uppercase tracking-wider mb-1">Wins</p>
              <p className="text-2xl font-mono font-bold text-white">{topPlayer.wins}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm uppercase tracking-wider mb-1">Losses</p>
              <p className="text-2xl font-mono font-bold text-white">{topPlayer.losses}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Leaderboard */}
        <div className="bg-card/50 backdrop-blur-md rounded-2xl border border-white/5 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Leaderboard
            </h2>
          </div>
          
          <div className="space-y-2">
            {stats.sort((a, b) => b.winRate - a.winRate).map((stat, i) => (
              <div 
                key={stat.userId}
                className={cn(
                  "flex items-center justify-between p-4 rounded-xl transition-colors border border-transparent",
                  i === 0 ? "bg-primary/10 border-primary/20" : "hover:bg-white/5 hover:border-white/5"
                )}
              >
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "font-mono font-bold w-6 text-center",
                    i === 0 ? "text-primary" : "text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold">{stat.username}</p>
                    <p className="text-xs text-muted-foreground md:hidden">
                      {stat.wins}W - {stat.losses}L
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="hidden md:block text-right">
                    <p className="text-xs text-muted-foreground">Record</p>
                    <p className="font-mono text-sm">{stat.wins}-{stat.losses}-{stat.pushes}</p>
                  </div>
                  <div className="text-right min-w-[60px]">
                    <p className="text-xs text-muted-foreground md:hidden">Rate</p>
                    <p className={cn(
                      "font-mono font-bold text-xl",
                      stat.winRate >= 50 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {stat.winRate}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-card/50 backdrop-blur-md rounded-2xl border border-white/5 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Performance
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <StatsChart data={stats} />
          </div>
        </div>
      </div>

      {/* Betting Insights */}
      <BettingInsights scope="user" />

      {/* News Feed */}
      <NewsFeed />
    </div>
  );
}
