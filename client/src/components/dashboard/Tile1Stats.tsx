import { useState } from "react";
import { Trophy, Users, ListChecks, TrendingUp, Dices, User, CalendarDays, Clock, Loader2, Zap, Activity, BarChart3, Info, Shield, ArrowUpDown } from "lucide-react";
import { SlidingCard, EmptyState } from "@/components/SlidingCard";
import { useDashboardSummary, useDashboardPatterns } from "@/hooks/use-dashboard";
import { useMyParlayLegsByIds } from "@/hooks/use-bets";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LegsCsvButton, LegsWithParlayTable } from "@/components/LegsWithParlayTable";
import { cn } from "@/lib/utils";

function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
  info,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClassName?: string;
  info?: { fullName: string; description: string };
  /** Present when this stat has underlying legs to drill into ("lookthrough"). */
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-white/5 border border-white/10 rounded-2xl p-5",
        onClick && "cursor-pointer hover:bg-white/10 hover:border-white/20 transition-colors",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
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

type Lookthrough = { title: string; legIds: number[] };

/** The legs behind whichever dashboard number was clicked. */
function LegsLookthroughDialog({ lookthrough, onClose }: { lookthrough: Lookthrough | null; onClose: () => void }) {
  const { data: legs, isLoading } = useMyParlayLegsByIds(lookthrough?.legIds ?? []);
  return (
    <Dialog open={lookthrough !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lookthrough?.title}
            <LegsCsvButton legs={legs} filename={lookthrough?.title ?? "legs"} />
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <LegsWithParlayTable legs={legs ?? []} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummarySlide() {
  const { data, isLoading, error } = useDashboardSummary();
  const [lookthrough, setLookthrough] = useState<Lookthrough | null>(null);

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
  const ids = data.lookthrough;
  // Only clickable when there's something to show.
  const open = (title: string, legIds: number[] | undefined) =>
    legIds && legIds.length > 0 ? () => setLookthrough({ title, legIds }) : undefined;

  return (
    <div>
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <Trophy className="w-5 h-5 text-accent" />
        Summary
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Leagues" value={String(data.leagueCount)} />
        <StatCard
          icon={ListChecks}
          label="Parlays Owned"
          value={String(data.parlaysPlaced)}
          onClick={open("Parlays Owned", ids?.ownedParlayLegIds)}
        />
        <StatCard
          icon={ListChecks}
          label="Legs Placed"
          value={String(data.legsPlaced)}
          onClick={open("Legs Placed", ids?.placedLegIds)}
        />
        <StatCard
          icon={TrendingUp}
          label="Leg Win Rate"
          value={`${data.legWinRate.toFixed(1)}%`}
          onClick={open("Decided Legs", ids && [...ids.winLegIds, ...ids.lossLegIds])}
        />
        <StatCard icon={Trophy} label="Leg Wins" value={String(data.legWins)} onClick={open("Leg Wins", ids?.winLegIds)} />
        <StatCard icon={Dices} label="Leg Losses" value={String(data.legLosses)} onClick={open("Leg Losses", ids?.lossLegIds)} />
        <StatCard
          icon={Activity}
          label="Participation Rate"
          value={`${(participationRate * 100).toFixed(0)}%`}
        />
        <StatCard
          icon={Zap}
          label="Power Score"
          value={powerScore.toFixed(2)}
          info={{
            fullName: "Power Score",
            description:
              "Average value earned per settled leg. Winning legs score based on their odds — a +150 underdog win scores 1.5, a -150 favorite win scores about 0.67 — while losing legs score 0. Pushes and voided legs don't count. It rewards value-weighted wins, not just win rate.",
          }}
        />
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
              "How much value you're adding compared to an average bettor in your league — your Power Score weighted by how consistently you submit picks each week, minus the league average Power Score weighted by its average participation. Positive means you're outperforming the league average; negative means below it.",
          }}
        />
      </div>
      <LegsLookthroughDialog lookthrough={lookthrough} onClose={() => setLookthrough(null)} />
    </div>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  /** Present when this stat has underlying legs to drill into ("lookthrough"). */
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10",
        onClick && "cursor-pointer hover:bg-white/10 transition-colors"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}

/** "Over 3 - 2 Under": always over first, with the side picked less often
 * greyed out (neither, when they're level). */
function OverUnderLean({ over, under }: { over: number; under: number }) {
  const dim = "text-muted-foreground/50 font-normal";
  return (
    <span data-testid="text-over-under-lean">
      <span className={cn(over < under && dim)}>Over {over}</span>
      <span className="text-muted-foreground/50"> - </span>
      <span className={cn(under < over && dim)}>{under} Under</span>
    </span>
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
  const [lookthrough, setLookthrough] = useState<Lookthrough | null>(null);

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
            onClick={() => setLookthrough({ title: "Most Common Bet Type", legIds: data.topBetType!.legIds })}
          />
        )}
        {data.favoriteTeam && (
          <StatRow
            icon={Shield}
            label="Favorite Team (Spread/ML)"
            value={`${data.favoriteTeam.team} (${data.favoriteTeam.count})`}
            onClick={() => setLookthrough({ title: "Favorite Team (Spread/ML)", legIds: data.favoriteTeam!.legIds })}
          />
        )}
        {data.overUnderPreference && (
          <StatRow
            icon={ArrowUpDown}
            label="Over/Under Lean"
            value={<OverUnderLean over={data.overUnderPreference.overCount} under={data.overUnderPreference.underCount} />}
            onClick={() => setLookthrough({
              title: "Over/Under Lean",
              legIds: [...data.overUnderPreference!.overLegIds, ...data.overUnderPreference!.underLegIds],
            })}
          />
        )}
        {data.favoritePlayer && (
          <StatRow
            icon={User}
            label="Favorite Prop Player"
            value={`${data.favoritePlayer.name} (${data.favoritePlayer.count})`}
            onClick={() => setLookthrough({ title: "Favorite Prop Player", legIds: data.favoritePlayer!.legIds })}
          />
        )}
        {data.favoriteDay && (
          <StatRow
            icon={CalendarDays}
            label="Most Active Day"
            value={`${data.favoriteDay.day} (${data.favoriteDay.count})`}
            onClick={() => setLookthrough({ title: "Most Active Day", legIds: data.favoriteDay!.legIds })}
          />
        )}
        {data.slateBreakdown.some(s => s.count > 0) && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 text-muted-foreground text-sm mb-3">
              <Clock className="w-4 h-4" />
              Slate Breakdown
            </div>
            <div className="space-y-2">
              {data.slateBreakdown.map(s => (
                <div
                  key={s.slate}
                  className={cn(
                    "flex items-center justify-between text-sm rounded-md -mx-2 px-2 py-1",
                    s.count > 0 && "cursor-pointer hover:bg-white/10 transition-colors"
                  )}
                  onClick={s.count > 0 ? () => setLookthrough({ title: `${s.slate} Slate`, legIds: s.legIds }) : undefined}
                  role={s.count > 0 ? "button" : undefined}
                >
                  <span className="text-muted-foreground">{s.slate}</span>
                  <span className="font-mono font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <LegsLookthroughDialog lookthrough={lookthrough} onClose={() => setLookthrough(null)} />
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
