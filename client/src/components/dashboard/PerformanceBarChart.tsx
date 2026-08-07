import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import type { PerformancePoint, PerformanceSeries } from "@/components/dashboard/PerformanceLineChart";

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
}: {
  points: PerformancePoint[];
  series: PerformanceSeries[];
  height?: number;
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
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
