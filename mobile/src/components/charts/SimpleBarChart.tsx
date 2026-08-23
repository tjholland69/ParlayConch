import { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import Svg, { Rect } from "react-native-svg";

export interface BarChartPoint {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  points: BarChartPoint[];
  color?: string;
  height?: number;
  /** How to format the tooltip's value line, e.g. (v) => `${v.toFixed(1)}%`. */
  formatValue?: (value: number) => string;
}

const PADDING = 12;

export function SimpleBarChart({ points, color = "#2563eb", height = 180, formatValue }: SimpleBarChartProps) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const max = Math.max(100, ...points.map((p) => p.value));
  const usableWidth = width - PADDING * 2;
  const barGap = 6;
  const barWidth = points.length > 0 ? (usableWidth - barGap * (points.length - 1)) / points.length : 0;

  const bars = points.map((p, i) => {
    const barHeight = Math.max(2, (p.value / max) * (height - PADDING * 2));
    const x = PADDING + i * (barWidth + barGap);
    const y = height - PADDING - barHeight;
    return { x, y, width: barWidth, height: barHeight };
  });

  // PanResponder's closures are created once — keep the latest bar layout
  // reachable via a ref rather than recreating the responder every render.
  const barsRef = useRef(bars);
  barsRef.current = bars;

  function indexAtX(touchX: number): number {
    const list = barsRef.current;
    for (let i = 0; i < list.length; i++) {
      if (touchX >= list[i].x - barGap / 2 && touchX < list[i].x + list[i].width + barGap / 2) return i;
    }
    // Off either end — clamp to the nearest bar rather than reporting none.
    return touchX < (list[0]?.x ?? 0) ? 0 : list.length - 1;
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setActiveIndex(indexAtX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setActiveIndex(indexAtX(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    }),
  ).current;

  if (points.length === 0) return null;

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const active = activeIndex != null ? points[activeIndex] : null;
  const activeBar = activeIndex != null ? bars[activeIndex] : null;

  const tooltipWidth = 100;
  const tooltipLeft = activeBar
    ? Math.min(Math.max(activeBar.x + activeBar.width / 2 - tooltipWidth / 2, 0), width - tooltipWidth)
    : 0;

  return (
    <View onLayout={handleLayout} {...panResponder.panHandlers}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {bars.map((b, i) => (
          <Rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={3}
            fill={i === activeIndex ? "#fff" : color}
            opacity={activeIndex == null || i === activeIndex ? 1 : 0.5}
          />
        ))}
      </Svg>

      {active && (
        <View style={[styles.tooltip, { left: tooltipLeft, width: tooltipWidth }]} pointerEvents="none">
          <Text style={styles.tooltipLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={[styles.tooltipValue, { color }]}>{formatValue ? formatValue(active.value) : active.value.toFixed(1)}</Text>
        </View>
      )}

      <View style={styles.labelRow}>
        {points.map((p, i) => (
          <Text key={i} style={[styles.label, i === activeIndex && styles.labelActive]} numberOfLines={1}>
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
  labelActive: { color: "#f1f5f9", fontWeight: "700" },
  tooltip: {
    position: "absolute",
    top: 4,
    backgroundColor: "#0f1420",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tooltipLabel: { fontSize: 9, color: "#94a3b8" },
  tooltipValue: { fontSize: 13, fontWeight: "700" },
});
