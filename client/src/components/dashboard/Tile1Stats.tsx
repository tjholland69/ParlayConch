import { Trophy, Users, ListChecks, TrendingUp, Dices, User, CalendarDays, Clock, Loader2 } from "lucide-react";
import { SlidingCard, EmptyState } from "@/components/SlidingCard";
import { useDashboardSummary, useDashboardPatterns } from "@/hooks/use-dashboard";

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="font-mono font-bold text-2xl">{value}</p>
    </div>
  );
}

function SummarySlide() {
  const { data, isLoading, error } = useDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading summary…</span>
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState icon={Trophy} message="Couldn't load your summary right now." />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <Trophy className="w-5 h-5 text-accent" />
        Summary
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Leagues" value={String(data.leagueCount)} />
        <StatCard icon={ListChecks} label="Parlays Owned" value={String(data.parlaysPlaced)} />
        <StatCard icon={ListChecks} label="Legs Placed" value={String(data.legsPlaced)} />
        <StatCard icon={TrendingUp} label="Leg Win Rate" value={`${data.legWinRate.toFixed(1)}%`} />
        <StatCard icon={Trophy} label="Leg Wins" value={String(data.legWins)} />
        <StatCard icon={Dices} label="Leg Losses" value={String(data.legLosses)} />
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Player Prop",
};

function AnalyticsSlide() {
  const { data, isLoading, error } = useDashboardPatterns();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading analytics…</span>
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState icon={TrendingUp} message="Couldn't load your analytics right now." />;
  }

  if (data.wins + data.losses + data.pushes === 0) {
    return <EmptyState icon={TrendingUp} message="Place some parlay legs to see your personal analytics." />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-accent" />
        My Analytics
      </h2>
      <div className="space-y-3">
        <StatRow
          icon={Trophy}
          label="Record"
          value={`${data.wins}-${data.losses}-${data.pushes} (${data.winRate.toFixed(1)}%)`}
        />
        {data.topBetType && (
          <StatRow
            icon={Dices}
            label="Most Common Bet Type"
            value={`${BET_TYPE_LABELS[data.topBetType.type] ?? data.topBetType.type} (${data.topBetType.count})`}
          />
        )}
        {data.favoritePlayer && (
          <StatRow icon={User} label="Favorite Prop Player" value={`${data.favoritePlayer.name} (${data.favoritePlayer.count})`} />
        )}
        {data.favoriteDay && (
          <StatRow icon={CalendarDays} label="Most Active Day" value={`${data.favoriteDay.day} (${data.favoriteDay.count})`} />
        )}
        {data.favoriteTimeOfDay && (
          <StatRow icon={Clock} label="Most Active Time" value={`${data.favoriteTimeOfDay.label} (${data.favoriteTimeOfDay.count})`} />
        )}
      </div>
    </div>
  );
}

export function Tile1Stats() {
  return (
    <SlidingCard
      slides={[
        { label: "Summary", content: <SummarySlide /> },
        { label: "My Analytics", content: <AnalyticsSlide /> },
      ]}
    />
  );
}
