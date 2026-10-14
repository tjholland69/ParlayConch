import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { parseActualOdds } from "@shared/parlayOdds";

/**
 * Records the odds a parlay actually got at the sportsbook. The app can only
 * estimate a parlay's price from its legs, and books reprice the ticket as a
 * whole, so whoever placed it types in the real number here. Saving it blank
 * goes back to the estimate. Mirrors web's ParlayOddsDialog.
 */
export function ParlayOddsSheet({
  visible,
  onClose,
  actualOdds,
  estimate,
  onConfirm,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  /** What's recorded now, if anything ("+650"). */
  actualOdds?: string | null;
  /** The app's own estimate, shown for reference ("+612"). */
  estimate?: string | null;
  /** Null clears the recorded odds. */
  onConfirm: (actualOdds: string | null) => void;
  saving?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText(actualOdds ?? "");
  }, [visible, actualOdds]);

  const blank = text.trim() === "";
  const parsed = parseActualOdds(text);
  const invalid = !blank && !parsed;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Parlay odds</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#475569" />
            </Pressable>
          </View>
          <Text style={styles.note}>
            Enter the odds your sportsbook gave the whole parlay when you placed it.
            {estimate ? ` Our estimate from the legs is ${estimate}.` : ""}
          </Text>

          <Text style={styles.inputLabel}>Odds at placement</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="+650"
            placeholderTextColor="#64748b"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, invalid && styles.inputInvalid]}
            autoFocus
            testID="input-parlay-actual-odds"
          />
          <Text style={[styles.hint, invalid && styles.hintInvalid]}>
            {invalid ? "Use American odds, like +650 or -120." : "Leave it blank to go back to the estimate."}
          </Text>

          <View style={{ marginTop: 20 }}>
            <Button fullWidth onPress={() => onConfirm(blank ? null : parsed)} disabled={invalid || saving} loading={saving}>
              {blank && actualOdds ? "Use the estimate" : "Save"}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#2a3447",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#374151", alignSelf: "center", marginBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  note: { fontSize: 13, color: "#94a3b8", marginBottom: 16, lineHeight: 18 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 6 },
  input: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  },
  inputInvalid: { borderColor: "#ef4444" },
  hint: { fontSize: 12, color: "#64748b", marginTop: 6 },
  hintInvalid: { color: "#f87171" },
});
