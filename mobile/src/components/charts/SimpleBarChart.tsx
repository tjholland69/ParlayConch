import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";

export interface BarChartPoint {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  points: BarChartPoint[];
  color?: string;
  height?: number;
}

const PADDING = 12;

export function SimpleBarChart({ points, color = "#2563eb", height = 180 }: SimpleBarChartProps) {
  if (points.length === 0) return null;

  const width = 320;
  const max = Math.max(100, ...points.map((p) => p.value));
  const usableWidth = width - PADDING * 2;
  const barGap = 6;
  const barWidth = points.length > 0 ? (usableWidth - barGap * (points.length - 1)) / points.length : 0;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {points.map((p, i) => {
          const barHeight = Math.max(2, (p.value / max) * (height - PADDING * 2));
          const x = PADDING + i * (barWidth + barGap);
          const y = height - PADDING - barHeight;
          return <Rect key={i} x={x} y={y} width={barWidth} height={barHeight} rx={3} fill={color} />;
        })}
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
    paddingHorizontal: PADDING,
  },
  label: { fontSize: 9, color: "#475569", flexShrink: 1 },
});