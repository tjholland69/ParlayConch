import { useStats } from "@/hooks/use-bets";
import { StatsChart } from "@/components/StatsChart";
import { NewsFeed } from "@/components/NewsFeed";
import { BettingInsights } from "@/components/BettingInsights";
import { HeroSlider } from "@/components/HeroSlider";
import { Trophy, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse p-6">
        <div className="h-64 rounded-3xl bg-white/5" />
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

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Hero Slider */}
      <HeroSlider globalStats={stats ?? []} />

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
            {(stats ?? []).slice().sort((a, b) => b.winRate - a.winRate).map((stat, i) => (
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
            <StatsChart data={stats ?? []} />
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
