import { Trophy, Users, ListChecks, TrendingUp, Dices, User, CalendarDays, Clock, Loader2, Zap, Activity, BarChart3, Info, Shield, ArrowUpDown } from "lucide-react";
import { SlidingCard, EmptyState } from "@/components/SlidingCard";
import { useDashboardSummary, useDashboardPatterns } from "@/hooks/use-dashboard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
  info,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClassName?: string;
  info?: { fullName: string; description: string };
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`About ${label}`}
                className="ml-auto -my-1 -mr-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-sm" align="start">
              <p className="font-semibold mb-1">{info.fullName}</p>
              <p className="text-muted-foreground text-xs">{info.description}</p>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <p className={cn("font-mono font-bold text-2xl", valueClassName)}>{value}</p>
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

  const powerScore = data.powerScore ?? 0;
  const participationRate = data.participationRate ?? 0;
  const bar = data.bar ?? 0;

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
        <StatCard
          icon={Activity}
          label="Participation Rate"
          value={`${(participationRate * 100).toFixed(0)}%`}
        />
        <StatCard icon={Zap} label="Power Score" value={powerScore.toFixed(2)} />
        <StatCard
          icon={BarChart3}
          label="BAR"
          value={`${bar > 0 ? "+" : ""}${bar.toFixed(2)}`}
          valueClassName={
            bar > 0 ? "text-primary" : bar < 0 ? "text-destructive" : undefined
          }
          info={{
            fullName: "Bets Above Replacement",
            description:
              "How much value you're adding compared to an average bettor in your league — your Power Score weighted by how consistently you submit picks each week compared against the field.",
          }}
        />
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
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          My Analytics
        </h2>
        <span className="text-xs text-muted-foreground font-mono">{data.totalLegs} submitted</span>
      </div>
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
        {data.favoriteTeam && (
          <StatRow icon={Shield} label="Favorite Team (Spread/ML)" value={`${data.favoriteTeam.team} (${data.favoriteTeam.count})`} />
        )}
        {data.overUnderPreference && (
          <StatRow
            icon={ArrowUpDown}
            label="Over/Under Lean"
            value={`${data.overUnderPreference.pick === "over" ? "Over" : "Under"} (${data.overUnderPreference.overCount}-${data.overUnderPreference.underCount})`}
          />
        )}
        {data.favoritePlayer && (
          <StatRow icon={User} label="Favorite Prop Player" value={`${data.favoritePlayer.name} (${data.favoritePlayer.count})`} />
        )}
        {data.favoriteDay && (
          <StatRow icon={CalendarDays} label="Most Active Day" value={`${data.favoriteDay.day} (${data.favoriteDay.count})`} />
        )}
        {data.favoriteTimeOfDay && (
          <StatRow icon={Clock} label="Most Active Slate" value={`${data.favoriteTimeOfDay.label} (${data.favoriteTimeOfDay.count})`} />
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
