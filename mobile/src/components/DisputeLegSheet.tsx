import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLegDisputes, useFileDispute } from "@/hooks/use-parlays";

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Pending review", color: "#f59e0b" },
  resolved: { label: "Resolved", color: "#22c55e" },
  dismissed: { label: "Dismissed", color: "#94a3b8" },
};

/**
 * Mobile port of the web's DisputeLegDialog — lets a member dispute the
 * result of their own leg. Only the "result is wrong" reason is supported
 * here (see useFileDispute for why "entered incorrectly", which requires a
 * screenshot, is web-only for now).
 */
export function DisputeLegBadge({ legId }: { legId: number }) {
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const insets = useSafeAreaInsets();

  const { data: disputes } = useLegDisputes(legId);
  const fileDispute = useFileDispute(legId);
  const openDispute = disputes?.find((d) => d.status === "open");

  function handleSubmit() {
    if (!justification.trim()) return;
    fileDispute.mutate(justification.trim(), {
      onSuccess: () => {
        setOpen(false);
        setJustification("");
      },
    });
  }

  if (openDispute) {
    const meta = STATUS_META[openDispute.status] ?? STATUS_META.open;
    return (
      <View style={[styles.badge, { borderColor: meta.color + "66" }]}>
        <Ionicons name="flag" size={11} color={meta.color} />
        <Text style={[styles.badgeText, { color: meta.color }]} numberOfLines={1}>
          Disputed — {meta.label}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dispute this bet"
      >
        <Ionicons name="flag-outline" size={15} color="#64748b" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Dispute this bet</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>What's wrong?</Text>
            <Text style={styles.reasonNote}>The result shown for this leg is incorrect.</Text>

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Justification</Text>
            <TextInput
              value={justification}
              onChangeText={setJustification}
              placeholder="Explain what you think is wrong…"
              placeholderTextColor="#64748b"
              style={styles.textarea}
              multiline
              numberOfLines={4}
              autoFocus
            />

            <Pressable
              onPress={handleSubmit}
              disabled={!justification.trim() || fileDispute.isPending}
              style={({ pressed }) => [
                styles.submitBtn,
                (!justification.trim() || fileDispute.isPending) && styles.submitBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              {fileDispute.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Dispute</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 180,
  },
  badgeText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
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
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 4 },
  reasonNote: { fontSize: 13, color: "#f1f5f9" },
  textarea: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    minHeight: 88,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
