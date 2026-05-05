import { UserStat } from "@shared/schema";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

interface StatsChartProps {
  data: UserStat[];
}

export function StatsChart({ data }: StatsChartProps) {
  // Sort by win rate for the chart
  const sortedData = [...data].sort((a, b) => b.winRate - a.winRate);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-white/10 p-4 rounded-xl shadow-xl">
          <p className="font-display font-bold text-lg mb-2">{label}</p>
          <div className="space-y-1 font-mono text-sm">
            <p className="text-primary">Win Rate: {payload[0].value}%</p>
            <p className="text-muted-foreground">Wins: {payload[0].payload.wins}</p>
            <p className="text-red-400">Losses: {payload[0].payload.losses}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sortedData} layout="vertical" margin={{ left: 0, right: 20 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis 
            dataKey="username" 
            type="category" 
            width={80} 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: 'var(--font-display)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
          <Bar dataKey="winRate" radius={[0, 4, 4, 0]} barSize={20}>
            {sortedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={index === 0 ? 'var(--primary)' : 'var(--secondary)'} 
                className="transition-all hover:opacity-80"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
