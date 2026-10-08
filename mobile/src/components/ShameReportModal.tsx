import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  Share,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import type { ParlayStory } from "@shared/parlayStory";

const SLIDE_MS = 10_000;
const SLIDE_COUNT = 2;

/** A lost parlay's story is red, a won one's green. */
const THEME = {
  shame: { background: "#2a0a0d", accent: "#fca5a5" },
  locks: { background: "#06251a", accent: "#6ee7b7" },
} as const;

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
 * A parlay report as a two-slide story. The Shame Report: who ruined a lost
 * parlay, then every losing bet. The Locks Report: who brought a won parlay
 * home, then every bet in it. Each slide runs on a timer shown in the bar at the
 * top. Tap to skip ahead (or the left edge to go back), press and hold to
 * pause. When the last slide runs out the story closes; the card's report
 * chip brings it back. Either slide can be shared as an image, or the
 * whole report as text. Mirrors web's ShameReportDialog.
 */
export function ShameReportModal({
  story,
  visible,
  onClose,
}: {
  story: ParlayStory;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const slideRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const theme = THEME[story.kind];
  const [holding, setHolding] = useState(false);
  const paused = holding || sharing;

  // How far through the current slide's timer we are, 0 to 1. `elapsed`
  // mirrors it so a pause can pick up where it stopped.
  const progress = useRef(new Animated.Value(0)).current;
  const elapsed = useRef(0);
  useEffect(() => {
    const id = progress.addListener(({ value }) => { elapsed.current = value; });
    return () => progress.removeListener(id);
  }, [progress]);

  function goTo(next: number) {
    progress.setValue(0);
    elapsed.current = 0;
    setSlide(next);
  }

  useEffect(() => {
    if (visible) {
      goTo(0);
      setHolding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || paused) return;
    const timer = Animated.timing(progress, {
      toValue: 1,
      duration: (1 - elapsed.current) * SLIDE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    timer.start(({ finished }) => {
      if (!finished) return;
      if (slide >= SLIDE_COUNT - 1) onClose();
      else goTo(slide + 1);
    });
    return () => timer.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, slide, paused]);

  function onTap(e: GestureResponderEvent) {
    if (e.nativeEvent.pageX < width * 0.3) {
      goTo(Math.max(0, slide - 1));
    } else if (slide >= SLIDE_COUNT - 1) {
      onClose();
    } else {
      goTo(slide + 1);
    }
  }

  // Shares the slide on screen as an image (the share sheet offers Messages
  // and Save Image). Only iOS can share a file this way; elsewhere, and on a
  // build without the capture module, it shares the text instead. The timer
  // waits while the share sheet is up.
  async function shareSlide() {
    setSharing(true);
    try {
      const uri = Platform.OS === "ios" ? await captureSlide(slideRef.current) : null;
      await Share.share(uri ? { url: uri } : { message: story.text });
    } catch {
      // Dismissing the share sheet isn't an error worth surfacing.
    } finally {
      setSharing(false);
    }
  }

  async function shareText() {
    setSharing(true);
    try {
      await Share.share({ message: story.text });
    } catch {
      // Dismissed.
    } finally {
      setSharing(false);
    }
  }

  const pendingLine = story.footnote;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.progressRow}>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <View key={i} style={styles.progressTrack}>
              {i < slide ? (
                <View style={[styles.progressFill, { width: "100%" }]} />
              ) : i === slide ? (
                <Animated.View
                  style={[
                    styles.progressFill,
                    { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel={`Close ${story.title}`}>
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable
          style={styles.slide}
          onPress={onTap}
          // A long press pauses instead of skipping: once onLongPress fires,
          // Pressable doesn't call onPress on release.
          onLongPress={() => setHolding(true)}
          delayLongPress={180}
          onPressOut={() => setHolding(false)}
          accessibilityRole="button"
          accessibilityLabel="Next slide"
          accessibilityHint="Press and hold to pause"
          testID="button-shame-slide"
        >
          {/* Everything in this view is what a shared slide image shows.
              collapsable={false} keeps it a real native view to capture. */}
          <View ref={slideRef} collapsable={false} style={[styles.capture, { backgroundColor: theme.background }]}>
            <Text style={styles.kicker} numberOfLines={1}>{story.weekLabel} · {story.title}</Text>
            {slide === 0 ? (
              <View style={styles.loserSlide} testID="slide-shame-loser">
                <Text style={styles.siren}>{story.emoji}</Text>
                <Text style={[styles.loserLabel, { color: theme.accent }]}>{story.leadLabel}</Text>
                <Text style={styles.loserName} adjustsFontSizeToFit numberOfLines={2}>{story.leadName}</Text>
                <Text style={styles.ruinedWith}>{story.leadCaption}</Text>
                <Text style={styles.loserPick}>{story.leadPick}</Text>
              </View>
            ) : (
              <View style={styles.listSlide} testID="slide-shame-list">
                <Text style={styles.listTitle}>{story.listTitle}</Text>
                <ScrollView contentContainerStyle={styles.list}>
                  {story.rows.map((l) => (
                    <View key={l.legId} style={styles.listRow}>
                      <Text style={[styles.listName, l.highlight && { color: theme.accent }]}>
                        {l.highlight ? `${story.emoji} ` : ""}{l.name}
                      </Text>
                      <Text style={styles.listPick}>{l.pick}</Text>
                    </View>
                  ))}
                </ScrollView>
                {pendingLine && <Text style={styles.pendingLine} testID="text-shame-pending">{pendingLine}</Text>}
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
            onPress={shareText}
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
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: "#ffffff" },
  pendingLine: { paddingTop: 12, fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.6)", textAlign: "center" },
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
  listPick: { marginTop: 2, fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center" },
});
