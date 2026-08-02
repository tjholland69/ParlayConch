import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

/**
 * A row of the chart: one week label plus an arbitrary set of series values.
 * Series values are cumulative win-rate percentages (0–100), or null for weeks
 * a series has no decided legs in.
 */
export type PerformancePoint = { weekLabel: string } & Record<string, number | null | string>;

export type PerformanceSeries = {
  /** Key into each point's values. */
  key: string;
  /** Legend/tooltip label. */
  name: string;
  /** CSS color — use SERIES_COLORS so identity stays stable across filters. */
  color: string;
  /** Dashed marks the comparison ("index") half of a pair. */
  dashed?: boolean;
};

/**
 * Fixed categorical slot order — assigned by series identity, never cycled and
 * never reassigned when the active set changes, so a series keeps its color as
 * other series are toggled on and off. Values are defined per-theme in index.css.
 */
export const SERIES_COLORS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
  "var(--viz-7)",
  "var(--viz-8)",
] as const;

/** Slot for the Nth distinct series. Past the eighth, fold into "Other". */
export function seriesColor(slot: number): string {
  return SERIES_COLORS[slot % SERIES_COLORS.length];
}

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
 * Cumulative win-rate over time. One <Line> per series entry; a solid/dashed
 * pair sharing a color reads as "you vs. that comparison scope".
 */
export function PerformanceLineChart({
  points,
  series,
  height = 300,
}: {
  points: PerformancePoint[];
  series: PerformanceSeries[];
  height?: number;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: 0, right: 20, top: 10 }}>
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
          {/* A legend is always present for >= 2 series, so identity is never color-alone. */}
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.dashed ? 2 : 2.5}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
