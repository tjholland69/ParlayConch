import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { sussLabel, sussLevel, type SussTally } from "@shared/suss";

/**
 * "The Suss Meter": a three-part thermometer beside a pick in an open
 * parlay. Hidden until more than half the league has down-voted the pick,
 * then it fills a third at a time and pulses once everyone but the pick's
 * owner doubts it (shared/suss.ts). Mirrors the web's SussMeter.
 */
export function SussMeter({ tally }: { tally: SussTally | null | undefined }) {
  const level = sussLevel(tally);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = level === 3 ? withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true) : 1;
  }, [level, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  if (level === 0) return null;
  const fill = level === 3 ? "#dc2626" : "#ef4444";
  return (
    <Animated.View style={[styles.meter, pulseStyle]} accessible accessibilityRole="image" accessibilityLabel={sussLabel(tally)} testID="suss-meter">
      <View style={[styles.bulb, { backgroundColor: fill }]} />
      <View style={styles.tube}>
        {[1, 2, 3].map((part) => (
          <View key={part} style={[styles.part, part < 3 && styles.partDivider, part <= level && { backgroundColor: fill }]} />
        ))}
      </View>
    </Animated.View>
  );
}

/** The anonymous down vote. Never shown on your own pick. */
export function SussVoteButton({
  tally,
  onVote,
  disabled,
  legId,
}: {
  tally: SussTally | null | undefined;
  onVote: (vote: boolean) => void;
  disabled?: boolean;
  legId: number;
}) {
  const mine = !!tally?.mine;
  return (
    <Pressable
      onPress={() => onVote(!mine)}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [styles.voteBtn, mine && styles.voteBtnOn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: mine }}
      accessibilityLabel={mine ? "Take back your down vote" : "Down-vote this pick. Votes are anonymous."}
      testID={`button-suss-vote-${legId}`}
    >
      <Ionicons name={mine ? "thumbs-down" : "thumbs-down-outline"} size={15} color={mine ? "#f87171" : "#64748b"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  bulb: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: "rgba(239,68,68,0.7)", zIndex: 1 },
  tube: {
    flexDirection: "row",
    height: 8,
    marginLeft: -2,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.7)",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    overflow: "hidden",
  },
  part: { width: 7, height: "100%" },
  partDivider: { borderRightWidth: 1, borderRightColor: "rgba(239,68,68,0.35)" },
  voteBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  voteBtnOn: { backgroundColor: "rgba(239,68,68,0.15)" },
});
