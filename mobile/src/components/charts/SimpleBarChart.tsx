import { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import Svg, { Rect, Polyline } from "react-native-svg";

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
  /** Optional benchmark/index series drawn as a dashed line in a lightened
   * shade of `color`, overlaid on the bars — same point count/order as
   * `points`, `null` where the index has no value for that slot. */
  indexPoints?: (number | null)[];
}

const PADDING = 12;
/** Roughly the narrowest a short axis label can get before it starts
 * overlapping its neighbors — used to space out ticks by available width
 * instead of a fixed "every other point" rule. */
const MIN_LABEL_WIDTH = 34;

/** How many points to skip between rendered x-axis labels so they fit the
 * measured chart width without overlapping. */
function computeLabelStep(pointCount: number, width: number): number {
  if (pointCount <= 1) return 1;
  const maxLabels = Math.max(1, Math.floor(width / MIN_LABEL_WIDTH));
  return Math.max(1, Math.ceil(pointCount / maxLabels));
}

/** Lightens a `#rrggbb` color for a benchmark/index line that should read as
 * "linked to" the primary series without competing with it visually. */
function lighten(hex: string, amount = 0.35): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function SimpleBarChart({ points, color = "#2563eb", height = 180, formatValue, indexPoints }: SimpleBarChartProps) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const indexValues = (indexPoints ?? []).filter((v): v is number => v != null);
  const max = Math.max(100, ...points.map((p) => p.value), ...indexValues);
  const usableWidth = width - PADDING * 2;
  const barGap = 6;
  const barWidth = points.length > 0 ? (usableWidth - barGap * (points.length - 1)) / points.length : 0;

  const bars = points.map((p, i) => {
    const barHeight = Math.max(2, (p.value / max) * (height - PADDING * 2));
    const x = PADDING + i * (barWidth + barGap);
    const y = height - PADDING - barHeight;
    return { x, y, width: barWidth, height: barHeight };
  });
  const indexCoords = (indexPoints ?? []).map((v, i) =>
    v == null ? null : { x: PADDING + i * (barWidth + barGap) + barWidth / 2, y: height - PADDING - (v / max) * (height - PADDING * 2) },
  );
  const labelStep = computeLabelStep(points.length, width);

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
        {indexCoords.some((c) => c != null) && (
          <Polyline
            points={indexCoords
              .map((c) => (c ? `${c.x},${c.y}` : null))
              .filter((p): p is string => p != null)
              .join(" ")}
            fill="none"
            stroke={lighten(color)}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
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
            {i % labelStep === 0 || i === points.length - 1 ? p.label : ""}
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
