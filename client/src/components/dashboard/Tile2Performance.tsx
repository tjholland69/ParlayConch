import { useState } from "react";
import { BarChart3, Loader2, Sparkles } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { SlidingCard, EmptyState } from "@/components/SlidingCard";
import { useLeagues } from "@/hooks/use-bets";
import { useDashboardPerformance } from "@/hooks/use-dashboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_LEAGUES_VALUE = "all";

function LeagueFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: leagues } = useLeagues();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44 bg-background border-white/10 h-8 text-xs">
        <SelectValue placeholder="All My Leagues" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_LEAGUES_VALUE}>All My Leagues</SelectItem>
        {(leagues ?? []).map((league) => (
          <SelectItem key={league.id} value={String(league.id)}>
            {league.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-white/10 p-4 rounded-xl shadow-xl">
        <p className="font-display font-bold text-lg mb-2">{label}</p>
        <div className="space-y-1 font-mono text-sm">
          {payload.map((entry: any) => (
            <p key={entry.dataKey} style={{ color: entry.color }}>
              {entry.name}: {entry.value != null ? `${Number(entry.value).toFixed(1)}%` : "—"}
            </p>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

function PerformanceChartSlide({ leagueFilter }: { leagueFilter: string }) {
  const leagueId = leagueFilter === ALL_LEAGUES_VALUE ? undefined : Number(leagueFilter);
  const { data, isLoading, error } = useDashboardPerformance(leagueId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading performance…</span>
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState icon={BarChart3} message="Couldn't load performance data right now." />;
  }

  if (data.points.length === 0) {
    return <EmptyState icon={BarChart3} message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <BarChart3 className="w-5 h-5 text-accent" />
        Performance Over Time
      </h2>
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ left: 0, right: 20, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.1)" />
            <XAxis
              dataKey="weekLabel"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontFamily: "var(--font-display)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="myWinRate" name="You" stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="indexWinRate" name="Index" stroke="var(--secondary)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Tile2Performance() {
  const [leagueFilter, setLeagueFilter] = useState(ALL_LEAGUES_VALUE);

  return (
    <SlidingCard
      icon={<BarChart3 className="w-64 h-64 rotate-12" />}
      headerExtra={<LeagueFilter value={leagueFilter} onChange={setLeagueFilter} />}
      slides={[
        { label: "Performance", content: <PerformanceChartSlide leagueFilter={leagueFilter} /> },
        {
          label: "More Views",
          content: <EmptyState icon={Sparkles} message="More visual breakdowns are coming soon." />,
        },
      ]}
    />
  );
}
