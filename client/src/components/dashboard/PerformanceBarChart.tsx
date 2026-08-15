import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import type { PerformancePoint, PerformanceSeries } from "@/components/dashboard/PerformanceLineChart";
import { getParlayVisualStyle } from "@/lib/parlayVisuals";

// Same glowing green as a perfect (100% win rate, full participation) parlay
// rollup tile — see getParlayVisualStyle in lib/parlayVisuals.ts. boxShadow's
// "0 0 16px 2px rgba(...)" has a spread value CSS drop-shadow() doesn't accept,
// so pull just the blur radius + color back out for the SVG filter.
const PERFECT_WEEK_VISUAL = getParlayVisualStyle(100, 1);
const PERFECT_WEEK_FILL = "rgb(74, 222, 128)"; // green-400, matches parlayVisuals' GREEN
const PERFECT_WEEK_DROP_SHADOW = (() => {
  const match = PERFECT_WEEK_VISUAL.boxShadow?.match(/rgba\([^)]+\)/);
  const color = match?.[0] ?? "rgba(74, 222, 128, 0.34)";
  return `0 0 16px ${color}`;
})();

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-white/10 p-4 rounded-xl shadow-xl">
        <p className="font-display font-bold text-lg mb-2">{label}</p>
        <div className="space-y-1 font-mono text-sm">
          {payload.map((entry: any) => (
            <p key={entry.dataKey} className="flex items-center gap-2 text-foreground">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              {entry.value != null ? `${Number(entry.value).toFixed(1)}%` : "—"}
            </p>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

/**
 * That week's own win rate — a solid/faded pair sharing a color reads as
 * "you vs. that comparison scope", mirroring the line chart's solid/dashed pairing.
 */
export function PerformanceBarChart({
  points,
  series,
  height = 300,
  glowPerfect = false,
}: {
  points: PerformancePoint[];
  series: PerformanceSeries[];
  height?: number;
  /** Light up any bar at a 100% win rate in the same glowing green as a perfect parlay rollup tile. */
  glowPerfect?: boolean;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ left: 0, right: 20, top: 10 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.1)" vertical={false} />
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted-foreground) / 0.08)" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              fillOpacity={s.dashed ? 0.55 : 1}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            >
              {glowPerfect &&
                points.map((p, i) => {
                  const perfect = p[s.key] === 100;
                  return (
                    <Cell
                      key={`cell-${i}`}
                      fill={perfect ? PERFECT_WEEK_FILL : s.color}
                      className={perfect ? "animate-pulse" : undefined}
                      style={perfect ? { filter: `drop-shadow(${PERFECT_WEEK_DROP_SHADOW})` } : undefined}
                    />
                  );
                })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
