import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { Link } from "wouter";

type InsightFocus = "general" | "bet_types" | "teams" | "props" | "trends";

interface LegRecord {
  wins: number;
  losses: number;
  pushes: number;
  total: number;
  winRate: number | null;
}

interface BettingStats {
  scope: "user" | "league";
  entityName: string;
  totalLegs: number;
  record: LegRecord;
  byBetType: Record<string, LegRecord>;
  spreadPick: { home: LegRecord; away: LegRecord };
  totalsPick: { over: LegRecord; under: LegRecord };
  byPropType: Record<string, LegRecord>;
  topTeams: { team: string; record: LegRecord }[];
  recentForm: { winRate: number | null; legs: number };
  favoritePlayer: { name: string; count: number } | null;
  leagueMemberCount?: number;
}

interface InsightResult {
  stats: BettingStats;
  commentary: string;
  disabled?: false;
}

interface InsightDisabled {
  disabled: true;
  leagueName?: string;
}

const FOCUS_OPTIONS: { value: InsightFocus; label: string }[] = [
  { value: "general", label: "Overall" },
  { value: "bet_types", label: "Bet Types" },
  { value: "teams", label: "Teams" },
  { value: "props", label: "Props" },
  { value: "trends", label: "Trends" },
];

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Props",
};

function winRateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 55) return "text-green-400";
  if (rate >= 45) return "text-yellow-400";
  return "text-red-400";
}

function WinRateIcon({ rate }: { rate: number | null }) {
  if (rate === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  if (rate >= 55) return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (rate >= 45) return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
}

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/5 border border-white/8 min-w-[72px]">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      <span className="text-base font-bold mt-0.5">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function BestBetType({ byBetType }: { byBetType: Record<string, LegRecord> }) {
  const entries = Object.entries(byBetType)
    .filter(([, r]) => r.total >= 3 && r.winRate !== null)
    .sort((a, b) => (b[1].winRate ?? 0) - (a[1].winRate ?? 0));

  if (entries.length === 0) return null;
  const [best, bestRec] = entries[0];
  const worst = entries.length > 1 ? entries[entries.length - 1] : null;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
        <TrendingUp className="w-3 h-3" />
        Best: {BET_TYPE_LABELS[best] ?? best} ({bestRec.winRate?.toFixed(1)}%)
      </span>
      {worst && worst[0] !== best && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
          <TrendingDown className="w-3 h-3" />
          Worst: {BET_TYPE_LABELS[worst[0]] ?? worst[0]} ({worst[1].winRate?.toFixed(1)}%)
        </span>
      )}
    </div>
  );
}

function TopTeams({ topTeams }: { topTeams: { team: string; record: LegRecord }[] }) {
  if (topTeams.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {topTeams.slice(0, 4).map(({ team, record }) => (
        <div key={team} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground truncate max-w-[60%]">{team}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {record.wins}W-{record.losses}L
            </span>
            <span className={`text-xs font-semibold ${winRateColor(record.winRate)}`}>
              {record.winRate !== null ? `${record.winRate.toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface BettingInsightsProps {
  scope: "user" | "league";
  leagueId?: number;
  className?: string;
}

export function BettingInsights({ scope, leagueId, className }: BettingInsightsProps) {
  const [focus, setFocus] = useState<InsightFocus>("general");
  const [refreshKey, setRefreshKey] = useState(0);

  const endpoint =
    scope === "league" && leagueId
      ? `/api/leagues/${leagueId}/insights?focus=${focus}&_r=${refreshKey}`
      : `/api/users/me/insights?focus=${focus}${leagueId ? `&leagueId=${leagueId}` : ""}&_r=${refreshKey}`;

  const { data, isLoading, isError } = useQuery<InsightResult | InsightDisabled>({
    queryKey: ["betting-insights", scope, leagueId, focus, refreshKey],
    queryFn: async () => {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to load insights");
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 min — AI calls are paid, don't over-fetch
    retry: 1,
  });

  const isDisabled = data && "disabled" in data && data.disabled === true;
  const result = isDisabled ? null : (data as InsightResult | undefined);
  const stats = result?.stats;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5 text-violet-400" />
            {scope === "league" ? "League Betting Insights" : "Your Betting Insights"}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isLoading}
            title="Regenerate commentary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Focus selector */}
        <div className="flex gap-1 flex-wrap pt-1">
          {FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFocus(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                focus === opt.value
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isDisabled ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted/40 p-3">
              <LockKeyhole className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">AI Insights Not Enabled</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                The Parlay Maestro has not enabled AI Insights for this league.
              </p>
            </div>
            {leagueId && (
              <Link href={`/leagues/${leagueId}/settings`}>
                <Button variant="outline" size="sm" className="text-xs">
                  Go to League Settings
                </Button>
              </Link>
            )}
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex gap-2 pt-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-16" />)}
            </div>
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Unable to load insights right now.
          </p>
        ) : (
          <>
            {/* AI Commentary */}
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-violet-500/60 to-violet-500/10" />
              <p className="pl-3 text-sm leading-relaxed text-muted-foreground italic">
                {result?.commentary}
              </p>
            </div>

            {/* Key stats row */}
            {stats && stats.totalLegs > 0 && (
              <>
                <div className="flex gap-2 flex-wrap">
                  <StatPill
                    label="Record"
                    value={`${stats.record.wins}-${stats.record.losses}-${stats.record.pushes}`}
                    sub={stats.record.winRate !== null ? `${stats.record.winRate.toFixed(1)}% win` : "no results"}
                  />
                  <StatPill
                    label="Recent"
                    value={
                      stats.recentForm.winRate !== null
                        ? `${stats.recentForm.winRate.toFixed(1)}%`
                        : "—"
                    }
                    sub={stats.recentForm.legs > 0 ? `last ${stats.recentForm.legs}` : "no data"}
                  />
                  <StatPill
                    label="Home ATS"
                    value={
                      stats.spreadPick.home.winRate !== null
                        ? `${stats.spreadPick.home.winRate.toFixed(1)}%`
                        : "—"
                    }
                    sub={`${stats.spreadPick.home.wins}W-${stats.spreadPick.home.losses}L`}
                  />
                  <StatPill
                    label="Away ATS"
                    value={
                      stats.spreadPick.away.winRate !== null
                        ? `${stats.spreadPick.away.winRate.toFixed(1)}%`
                        : "—"
                    }
                    sub={`${stats.spreadPick.away.wins}W-${stats.spreadPick.away.losses}L`}
                  />
                  {stats.totalsPick.over.total + stats.totalsPick.under.total > 0 && (
                    <StatPill
                      label="Overs"
                      value={
                        stats.totalsPick.over.winRate !== null
                          ? `${stats.totalsPick.over.winRate.toFixed(1)}%`
                          : "—"
                      }
                      sub={`${stats.totalsPick.over.total} bets`}
                    />
                  )}
                </div>

                {/* Best/worst bet types */}
                <BestBetType byBetType={stats.byBetType} />

                {/* Top teams */}
                {stats.topTeams.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                      Most Picked Teams
                    </p>
                    <TopTeams topTeams={stats.topTeams} />
                  </div>
                )}

                {/* Favorite prop player */}
                {stats.favoritePlayer && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ChevronRight className="w-3.5 h-3.5" />
                    Favorite prop: <span className="text-foreground font-medium">{stats.favoritePlayer.name}</span>
                    <span>({stats.favoritePlayer.count} bets)</span>
                  </div>
                )}

                {/* League member note */}
                {scope === "league" && stats.leagueMemberCount !== undefined && (
                  <p className="text-[10px] text-muted-foreground">
                    Aggregated across {stats.leagueMemberCount} league members · {stats.totalLegs} total legs
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
