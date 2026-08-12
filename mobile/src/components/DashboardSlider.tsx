import { type ReactNode } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";

export interface DashboardSlide {
  label: string;
  content: ReactNode;
}

interface DashboardStackProps {
  slides: DashboardSlide[];
}

export function DashboardLoading({ message }: { message: string }) {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator color="#2563eb" />
      <Text style={styles.centeredStateText}>{message}</Text>
    </View>
  );
}

export function DashboardEmptyState({ message }: { message: string }) {
  return (
    <View style={styles.centeredState}>
      <Text style={styles.centeredStateText}>{message}</Text>
    </View>
  );
}

/** Each dashboard section as its own stacked tile — same shadow/card framework as
 * LeagueCard and the My Picks status tiles, just without an accent bar. */
export function DashboardStack({ slides }: DashboardStackProps) {
  return (
    <View style={styles.stack}>
      {slides.map((slide) => (
        <View key={slide.label} style={styles.shadowWrap}>
          <View style={styles.card}>{slide.content}</View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  /* Shadow lives on this outer, non-clipping wrapper — combining shadow*
   * props with overflow:"hidden" on the same view breaks rendering on iOS. */
  shadowWrap: {
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#25314a",
    overflow: "hidden",
    padding: 16,
  },
  centeredState: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 10 },
  centeredStateText: { fontSize: 13, color: "#94a3b8", textAlign: "center" },
});