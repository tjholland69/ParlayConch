import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { useAccentColor } from "@/hooks/use-accent-color";
import { parseBoostPct } from "@shared/parlayBoost";

/**
 * Asks whether a sportsbook promo boost applies to a parlay and, if so, how
 * big. Shown before a parlay is submitted, and again from a parlay's card
 * to add or change the boost later (a boost claimed at the book is often
 * recorded after the bet is live). Mirrors web's BoostDialog.
 */
export function BoostSheet({
  visible,
  onClose,
  initialPct,
  onConfirm,
  saving,
  title = "Parlay boost",
  confirmLabel = "Save",
}: {
  visible: boolean;
  onClose: () => void;
  initialPct?: number | null;
  /** Null when there's no boost. */
  onConfirm: (boostPct: number | null) => void;
  saving?: boolean;
  title?: string;
  confirmLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const accent = useAccentColor();
  const [hasBoost, setHasBoost] = useState(false);
  const [pct, setPct] = useState("");

  useEffect(() => {
    if (!visible) return;
    setHasBoost(!!initialPct);
    setPct(initialPct ? String(initialPct) : "");
  }, [visible, initialPct]);

  const parsed = parseBoostPct(pct);
  const invalid = hasBoost && parsed == null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#475569" />
            </Pressable>
          </View>
          <Text style={styles.note}>
            Sportsbooks sometimes boost a parlay's odds as a promo, usually by 15 to 30%.
          </Text>

          <Text style={styles.inputLabel}>Boost on this parlay?</Text>
          <View style={styles.toggleRow}>
            {[false, true].map((value) => {
              const active = hasBoost === value;
              return (
                <Pressable
                  key={String(value)}
                  onPress={() => setHasBoost(value)}
                  style={[styles.toggleBtn, active && { borderColor: accent, backgroundColor: `${accent}22` }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`toggle-boost-${value ? "yes" : "no"}`}
                >
                  <Text style={[styles.toggleText, active && { color: "#f1f5f9" }]}>{value ? "Yes" : "No"}</Text>
                </Pressable>
              );
            })}
          </View>

          {hasBoost && (
            <>
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>Boost %</Text>
              <TextInput
                value={pct}
                onChangeText={setPct}
                placeholder="25"
                placeholderTextColor="#64748b"
                keyboardType="decimal-pad"
                style={styles.input}
                autoFocus
                testID="input-boost-pct"
              />
            </>
          )}

          <View style={{ marginTop: 20 }}>
            <Button fullWidth onPress={() => onConfirm(hasBoost ? parsed : null)} disabled={invalid || saving} loading={saving}>
              {confirmLabel}
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
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  note: { fontSize: 13, color: "#94a3b8", marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 6 },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2a3447",
    backgroundColor: "#141926",
  },
  toggleText: { fontSize: 15, fontWeight: "700", color: "#94a3b8" },
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
});
