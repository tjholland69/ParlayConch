import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/** Small "i" button that pops a bottom-sheet explaining a stat — e.g. how
 * Power Score or BAR are calculated. Self-contained (owns its own modal
 * state) so it can be dropped next to any label. */
export function InfoButton({ title, description }: { title: string; description: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="information-circle-outline" size={14} color="#64748b" />
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            <Pressable style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.85 }]} onPress={() => setOpen(false)}>
              <Text style={styles.closeButtonText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { marginLeft: "auto", padding: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#1a2133",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 8 },
  description: { fontSize: 13, color: "#94a3b8", lineHeight: 19 },
  closeButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
