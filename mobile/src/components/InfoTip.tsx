import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

/** Small "i" button that pops a bottom-sheet explaining a stat — e.g. how
 * Power Score or BAR are calculated. Self-contained (owns its own modal
 * state) so it can be dropped next to any label. */
export function InfoButton({ title, description }: { title: string; description: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        onPress={() => setOpen(true)}
        accessibilityLabel={`About ${title}`}
        style={styles.infoHit}
      >
        <Ionicons name="information-circle-outline" size={18} color="#64748b" />
      </IconButton>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            <Button fullWidth style={styles.closeButton} onPress={() => setOpen(false)}>
              Got it
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  infoHit: { marginLeft: "auto" },
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
  closeButton: { marginTop: 16 },
});
