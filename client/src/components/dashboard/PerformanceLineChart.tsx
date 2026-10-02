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

/**
 * A couple shades lighter than the given color, same hue — used to derive a
 * paired dashed line's color from its solid counterpart so the two read as
 * linked rather than unrelated series.
 */
export function lighten(color: string): string {
  return `color-mix(in srgb, ${color} 75%, white)`;
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

/** A series' most recent value — the last week it has decided legs in. */
function currentValue(points: PerformancePoint[], key: string): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i][key];
    if (typeof value === "number") return value;
  }
  return null;
}

/**
 * Where each line stands right now, so the latest win rate reads at a glance
 * instead of only on hover. Sits at the top right of a chart, next to its
 * heading; lists series in the chart's own order (each "you" line followed by
 * the index it's paired with).
 */
export function PerformanceCurrentValues({
  points,
  series,
}: {
  points: PerformancePoint[];
  series: PerformanceSeries[];
}) {
  const current = series
    .map((s) => ({ ...s, value: currentValue(points, s.key) }))
    .filter((s): s is PerformanceSeries & { value: number } => s.value != null);
  if (current.length === 0) return null;

  return (
    <div className="text-right" data-testid="text-performance-current">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Current</p>
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
        {current.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-3 h-0 shrink-0 border-t-2"
              style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="font-mono font-bold text-sm text-foreground">{s.value.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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
