import { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface SimpleLineChartProps {
  points: LineChartPoint[];
  color?: string;
  height?: number;
  /** How to format the tooltip's value line, e.g. (v) => `${v.toFixed(1)}%`. */
  formatValue?: (value: number) => string;
  /** Optional benchmark/index series drawn as a dashed line in a lightened
   * shade of `color` — same point count and order as `points`, entries can
   * be `null` where the index has no value for that slot. */
  indexPoints?: (number | null)[];
}

const PADDING = 24;
/** Roughly the narrowest a short axis label can get before it starts
 * overlapping its neighbors — used to space out ticks by available width
 * instead of a fixed "every other point" rule. */
const MIN_LABEL_WIDTH = 34;

/** Finds the point whose x-coordinate is closest to the touch. */
function nearestIndex(touchX: number, coordsX: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coordsX.length; i++) {
    const dist = Math.abs(coordsX[i] - touchX);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

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

export function SimpleLineChart({ points, color = "#2563eb", height = 180, formatValue, indexPoints }: SimpleLineChartProps) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const indexValues = (indexPoints ?? []).filter((v): v is number => v != null);
  const values = [...points.map((p) => p.value), ...indexValues];
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const xStep = points.length > 1 ? (width - PADDING * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = PADDING + i * xStep;
    const y = height - PADDING - ((p.value - min) / range) * (height - PADDING * 2);
    return { x, y };
  });
  const indexCoords = (indexPoints ?? []).map((v, i) =>
    v == null ? null : { x: PADDING + i * xStep, y: height - PADDING - ((v - min) / range) * (height - PADDING * 2) },
  );
  const labelStep = computeLabelStep(points.length, width);

  // PanResponder's closures are created once — keep the latest coordsX
  // reachable via a ref rather than recreating the responder every render.
  const coordsXRef = useRef(coords.map((c) => c.x));
  coordsXRef.current = coords.map((c) => c.x);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setActiveIndex(nearestIndex(e.nativeEvent.locationX, coordsXRef.current));
      },
      onPanResponderMove: (e) => {
        setActiveIndex(nearestIndex(e.nativeEvent.locationX, coordsXRef.current));
      },
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    }),
  ).current;

  if (points.length === 0) return null;

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const active = activeIndex != null ? points[activeIndex] : null;
  const activeCoord = activeIndex != null ? coords[activeIndex] : null;
  const activeIndexValue = activeIndex != null ? indexPoints?.[activeIndex] ?? null : null;
  const midY = height - PADDING - ((0 - min) / range) * (height - PADDING * 2);

  // Keep the tooltip bubble from running off either edge of the chart.
  const tooltipWidth = 100;
  const tooltipLeft = activeCoord
    ? Math.min(Math.max(activeCoord.x - tooltipWidth / 2, 0), width - tooltipWidth)
    : 0;

  return (
    <View onLayout={handleLayout} {...panResponder.panHandlers}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={PADDING} y1={midY} x2={width - PADDING} y2={midY} stroke="#2a3447" strokeWidth={1} />
        {activeCoord && (
          <Line x1={activeCoord.x} y1={PADDING / 2} x2={activeCoord.x} y2={height - PADDING} stroke="#475569" strokeWidth={1} strokeDasharray="3,3" />
        )}
        {indexCoords.some((c) => c != null) && (
          <Polyline
            points={indexCoords
              .map((c, i) => (c ? `${c.x},${c.y}` : null))
              .filter((p): p is string => p != null)
              .join(" ")}
            fill="none"
            stroke={lighten(color)}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        <Polyline points={coords.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} />
        {coords.map((c, i) => (
          <Circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === activeIndex ? 5.5 : 3.5}
            fill={i === activeIndex ? "#fff" : color}
            stroke={i === activeIndex ? color : undefined}
            strokeWidth={i === activeIndex ? 2 : 0}
          />
        ))}
      </Svg>

      {active && (
        <View style={[styles.tooltip, { left: tooltipLeft, width: tooltipWidth }]} pointerEvents="none">
          <Text style={styles.tooltipLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={[styles.tooltipValue, { color }]}>{formatValue ? formatValue(active.value) : active.value.toFixed(1)}</Text>
          {activeIndexValue != null && (
            <Text style={[styles.tooltipIndexValue, { color: lighten(color) }]} numberOfLines={1}>
              Avg {formatValue ? formatValue(activeIndexValue) : activeIndexValue.toFixed(1)}
            </Text>
          )}
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
    paddingHorizontal: PADDING - 12,
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
  tooltipIndexValue: { fontSize: 10, fontWeight: "600", marginTop: 1 },
});
