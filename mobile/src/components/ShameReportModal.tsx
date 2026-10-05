import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, Share, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { shameReportText, type ShameReport } from "@shared/shameReport";

const SLIDE_MS = 4500;
const SLIDE_COUNT = 2;

/**
 * Saves the slide on screen as a PNG and returns its file path, or null if
 * it can't be captured. react-native-view-shot is a native module, loaded
 * here rather than at the top of the file: an over-the-air update can reach
 * an installed build from before it was added, where importing it throws.
 * Those builds fall back to sharing the text.
 */
async function captureSlide(view: View | null): Promise<string | null> {
  if (!view) return null;
  try {
    const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
    return await captureRef(view, { format: "png", quality: 1, result: "tmpfile" });
  } catch {
    return null;
  }
}

/**
 * The weekly shame report as a two-slide "short": first who ruined the
 * parlay, then every losing bet. Moves on to the list by itself; tap a slide
 * to flip between them. Either slide can be shared as an image, or the whole
 * report as text. Mirrors web's ShameReportDialog.
 */
export function ShameReportModal({
  report,
  visible,
  onClose,
}: {
  report: ShameReport;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [slide, setSlide] = useState(0);
  const slideRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // Shares the slide on screen as an image (the share sheet offers Save
  // Image). Only iOS can share a file this way; elsewhere, and on a build
  // without the capture module, it shares the text instead.
  async function shareSlide() {
    setSharing(true);
    try {
      const uri = Platform.OS === "ios" ? await captureSlide(slideRef.current) : null;
      await Share.share(uri ? { url: uri } : { message: shameReportText(report) });
    } catch {
      // Dismissing the share sheet isn't an error worth surfacing.
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => { if (visible) setSlide(0); }, [visible]);
  // Auto-advances once, from the reveal to the list, then holds there.
  useEffect(() => {
    if (!visible || slide !== 0) return;
    const timer = setTimeout(() => setSlide(1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [visible, slide]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.progressRow}>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <View key={i} style={[styles.progressTrack, i <= slide && styles.progressDone]} />
          ))}
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close shame report">
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable
          style={styles.slide}
          onPress={() => setSlide((s) => (s + 1) % SLIDE_COUNT)}
          accessibilityRole="button"
          accessibilityLabel="Next slide"
          testID="button-shame-slide"
        >
          {/* Everything in this view is what a shared slide image shows.
              collapsable={false} keeps it a real native view to capture. */}
          <View ref={slideRef} collapsable={false} style={styles.capture}>
            <Text style={styles.kicker} numberOfLines={1}>{report.weekLabel} · Shame Report</Text>
            {slide === 0 ? (
              <View style={styles.loserSlide} testID="slide-shame-loser">
                <Text style={styles.siren}>🚨</Text>
                <Text style={styles.loserLabel}>{report.loserLabel}</Text>
                <Text style={styles.loserName} adjustsFontSizeToFit numberOfLines={2}>{report.loserName}</Text>
                <Text style={styles.ruinedWith}>ruined it with</Text>
                <Text style={styles.loserPick}>{report.loserPick}</Text>
              </View>
            ) : (
              <View style={styles.listSlide} testID="slide-shame-list">
                <Text style={styles.listTitle}>The Losing Bets</Text>
                <ScrollView contentContainerStyle={styles.list}>
                  {report.losers.map((l) => (
                    <View key={l.legId} style={styles.listRow}>
                      <Text style={[styles.listName, l.isParlayLoser && styles.listNameLoser]}>
                        {l.isParlayLoser ? "🚨 " : ""}{l.name}
                      </Text>
                      <Text style={styles.listPick}>{l.pick}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <Text style={styles.brand}>PARLAY CONCH</Text>
          </View>
        </Pressable>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button fullWidth onPress={shareSlide} disabled={sharing} loading={sharing}>
              Share this slide
            </Button>
          </View>
          <Pressable
            onPress={() => Share.share({ message: shameReportText(report) })}
            style={({ pressed }) => [styles.textShare, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            testID="button-shame-share-text"
          >
            <Text style={styles.textShareLabel}>Share as text</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#2a0a0d", paddingHorizontal: 20 },
  progressRow: { flexDirection: "row", gap: 6 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  progressDone: { backgroundColor: "#ffffff" },
  close: { alignSelf: "flex-end", marginTop: 12 },
  capture: { flex: 1, backgroundColor: "#2a0a0d", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20 },
  brand: { fontSize: 10, fontWeight: "700", letterSpacing: 2, color: "rgba(255,255,255,0.35)", textAlign: "center" },
  actions: { gap: 10 },
  action: { alignSelf: "stretch" },
  textShare: { alignItems: "center", paddingVertical: 8 },
  textShareLabel: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  kicker: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.6)",
  },
  slide: { flex: 1, marginVertical: 12 },
  loserSlide: { flex: 1, alignItems: "center", justifyContent: "center" },
  siren: { fontSize: 84 },
  loserLabel: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#fca5a5",
    textAlign: "center",
  },
  loserName: { marginTop: 6, fontSize: 48, fontWeight: "900", color: "#ffffff", textAlign: "center" },
  ruinedWith: { marginTop: 24, fontSize: 14, color: "rgba(255,255,255,0.7)" },
  loserPick: { marginTop: 4, fontSize: 18, fontWeight: "700", color: "#ffffff", textAlign: "center" },
  listSlide: { flex: 1, paddingTop: 24 },
  listTitle: { fontSize: 28, fontWeight: "900", color: "#ffffff", textAlign: "center" },
  list: { paddingTop: 20, gap: 18 },
  listRow: { alignItems: "center" },
  listName: { fontSize: 18, fontWeight: "800", color: "#ffffff", textAlign: "center" },
  listNameLoser: { color: "#fca5a5" },
  listPick: { marginTop: 2, fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center" },
});
