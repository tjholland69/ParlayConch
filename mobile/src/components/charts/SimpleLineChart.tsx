import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface SimpleLineChartProps {
  points: LineChartPoint[];
  color?: string;
  height?: number;
}

const PADDING = 24;

export function SimpleLineChart({ points, color = "#2563eb", height = 180 }: SimpleLineChartProps) {
  if (points.length === 0) return null;

  const width = 320;
  const values = points.map((p) => p.value);
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const step = points.length > 1 ? (width - PADDING * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = PADDING + i * step;
    const y = height - PADDING - ((p.value - min) / range) * (height - PADDING * 2);
    return { x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const midY = height - PADDING - ((0 - min) / range) * (height - PADDING * 2);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={PADDING} y1={midY} x2={width - PADDING} y2={midY} stroke="#2a3447" strokeWidth={1} />
        <Polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2.5} />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={3.5} fill={color} />
        ))}
      </Svg>
      <View style={styles.labelRow}>
        {points.map((p, i) => (
          <Text key={i} style={styles.label} numberOfLines={1}>
            {points.length > 6 && i % 2 === 1 ? "" : p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: PADDING - 12,
  },
  label: { fontSize: 9, color: "#475569", flexShrink: 1 },
});