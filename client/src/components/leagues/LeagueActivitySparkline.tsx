import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";

/**
 * Mini performance line for league tiles: cumulative league-wide win rate
 * (all members) from inception to date — same shape as the dashboard
 * performance chart, compressed. Weeks with no decided legs are omitted
 * upstream so the line only connects weeks that had activity.
 */
export function LeagueActivitySparkline({
  points,
  color,
  height = 40,
}: {
  points: { weekLabel: string; winRate: number }[];
  color: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  return (
    <div className="w-24 shrink-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}>
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as { weekLabel: string; winRate: number };
              return (
                <div className="bg-card border border-white/10 px-2.5 py-1.5 rounded-lg shadow-xl text-xs whitespace-nowrap">
                  <span className="text-muted-foreground">{point.weekLabel}: </span>
                  <span className="font-semibold">{point.winRate.toFixed(1)}%</span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}