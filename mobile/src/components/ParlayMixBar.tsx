import { View, StyleSheet } from "react-native";
import { getParlayMix, PARLAY_MIX_COLORS, type ParlayMixEntry } from "@/lib/parlayMix";
import type { ParlayLeg } from "@shared/schema";

/** Mobile port of client/src/components/ParlayMixBar.tsx — bet-type mix as a
 * segmented bar. Drops the desktop-only hover legend for space. */
export function ParlayMixBar({ legs }: { legs: Pick<ParlayLeg, "betType">[] }) {
  const mix = getParlayMix(legs);
  if (mix.length === 0) return null;

  return (
    <View style={styles.track}>
      {mix.map((entry: ParlayMixEntry) => (
        <View
          key={entry.category}
          style={{ width: `${entry.pct}%`, backgroundColor: PARLAY_MIX_COLORS[entry.category] }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
