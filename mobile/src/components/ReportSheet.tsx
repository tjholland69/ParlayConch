import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReportId } from "@shared/reports";
import { useLeagueReport } from "@/hooks/use-leagues";
import { LegLookthroughSheet } from "@/components/LegLookthrough";

/**
 * One report in a bottom sheet: its bars, then a button that shares the text
 * version (Messages, Copy, …). The pared-down mobile take on the web's
 * Reports page: no file downloads, and no Story Studio.
 */
/** The view as a PNG file, or null where the capture module isn't in this build (Expo Go). */
async function captureAsImage(view: View | null): Promise<string | null> {
  if (!view) return null;
  try {
    const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
    return await captureRef(view, { format: "png", quality: 1, result: "tmpfile" });
  } catch {
    return null;
  }
}

export function ReportSheet({ leagueId, reportId, title, onClose }: { leagueId: number; reportId: ReportId | null; title: string; onClose: () => void }) {
  const { data: report, isLoading, isError } = useLeagueReport(leagueId, reportId);
  const graphicRef = useRef<View>(null);
  const [sharingImage, setSharingImage] = useState(false);

  // The graphic as a picture for the group chat. Falls back to the text
  // where a picture can't be made.
  async function shareImage() {
    if (!report || sharingImage) return;
    setSharingImage(true);
    try {
      const uri = await captureAsImage(graphicRef.current);
      await Share.share(uri ? { url: uri } : { message: report.text });
    } catch {
      // The share sheet was dismissed.
    } finally {
      setSharingImage(false);
    }
  }

  return (
    <LegLookthroughSheet visible={!!reportId} title={title} isLoading={isLoading} onClose={onClose}>
      {isError || !report ? (
        <Text style={styles.reportEmpty}>Couldn't load this report. Try again in a moment.</Text>
      ) : (
        <ScrollView style={{ flexGrow: 0 }}>
          {/* collapsable={false} keeps this a real native view, so it can be captured. */}
          <View ref={graphicRef} collapsable={false} style={styles.reportGraphic}>
            <Text style={styles.reportGraphicTitle}>{report.dataset.title}</Text>
            <Text style={styles.reportChartTitle}>{report.chart.title}</Text>
            {report.chart.bars.length === 0 ? (
              <Text style={styles.reportEmpty}>Nothing to chart yet.</Text>
            ) : (
              report.chart.bars.map((bar) => (
                <View key={bar.label} style={styles.reportBarRow} accessibilityLabel={`${bar.label}: ${bar.display}`}>
                  <Text style={styles.reportBarLabel} numberOfLines={1}>{bar.label}</Text>
                  <View style={styles.reportBarTrack}>
                    <View style={[styles.reportBarFill, { width: `${Math.max(0, Math.min(100, (bar.value / (report.chart.max || 1)) * 100))}%` }]} />
                  </View>
                  <Text style={styles.reportBarValue}>{bar.display}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={styles.reportText} selectable testID="text-report-sms">{report.text}</Text>
          <View style={styles.reportShareRow}>
            <Pressable
              onPress={shareImage}
              disabled={sharingImage}
              style={({ pressed }) => [styles.reportShareBtn, styles.reportShareBtnHalf, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              testID="button-report-share-image"
            >
              {sharingImage ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="image-outline" size={16} color="#ffffff" />}
              <Text style={styles.reportShareText}>Share as image</Text>
            </Pressable>
            <Pressable
              onPress={() => void Share.share({ message: report.text }).catch(() => undefined)}
              style={({ pressed }) => [styles.reportShareBtn, styles.reportShareBtnHalf, styles.reportShareBtnAlt, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              testID="button-report-share-text"
            >
              <Ionicons name="share-outline" size={16} color="#ffffff" />
              <Text style={styles.reportShareText}>Share as text</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </LegLookthroughSheet>
  );
}

const styles = StyleSheet.create({
  reportChartTitle: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  reportBarRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  reportBarLabel: { width: 92, fontSize: 13, color: "#f1f5f9" },
  reportBarTrack: { flex: 1, height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: "#141926", overflow: "hidden" },
  reportBarFill: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: "#2563eb" },
  reportBarValue: { width: 44, textAlign: "right", fontSize: 13, fontWeight: "700", color: "#f1f5f9", fontVariant: ["tabular-nums"] },
  reportText: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: "#141926", fontSize: 13, lineHeight: 19, color: "#cbd5e1" },
  reportShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    marginTop: 12,
  },
  reportShareText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  reportShareRow: { flexDirection: "row", gap: 8 },
  reportShareBtnHalf: { flex: 1 },
  reportShareBtnAlt: { backgroundColor: "#334155" },
  // Its own background and padding, so the captured picture stands alone.
  reportGraphic: { backgroundColor: "#1c2538", padding: 14, borderRadius: 12 },
  reportGraphicTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 8 },
  reportEmpty: { fontSize: 13, color: "#94a3b8", paddingVertical: 20 },
});
