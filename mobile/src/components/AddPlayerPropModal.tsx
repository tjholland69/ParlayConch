import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import type { Game } from "@shared/schema";
import { PLAYER_PROP_TYPES } from "@shared/schema";
import { PlayerTypeahead } from "@/components/PlayerTypeahead";
import { useAccentColor } from "@/hooks/use-accent-color";

const PICK_OPTIONS = ["over", "under", "yes", "no"] as const;
const PICK_LABELS: Record<(typeof PICK_OPTIONS)[number], string> = {
  over: "Over",
  under: "Under",
  yes: "Yes",
  no: "No",
};

export type AddPlayerPropLeg = {
  gameId: number;
  betType: "player_prop";
  pick: string;
  line?: string;
  playerName: string;
  propType: string;
};

/** Add-a-player-prop entry sheet for one game — opened from GamePickCard's
 * "Add Player Prop" button, in either a fresh draft or an already-submitted
 * parlay being edited. Mirrors web's per-game AddPropLegDialog.tsx: player
 * name (via type-ahead), prop type, pick (over/under/yes/no), and a
 * free-text line — no odds field, since there's no live player-prop odds
 * feed and it's manually entered on web too. `onAdd` is generic (a draft-
 * mode server mutation, or a submitted-edit-mode local append) rather than
 * build.tsx's toggle/swap flow, since an arbitrary number of distinct props
 * can be added (each is its own leg), unlike the single spread/total/
 * moneyline pick a game's 2x3 grid manages. */
export function AddPlayerPropModal({
  game,
  onClose,
  onAdd,
  isPending,
}: {
  game: Game | null;
  onClose: () => void;
  onAdd: (leg: AddPlayerPropLeg) => Promise<void> | void;
  /** True while onAdd's own async work (if any) is in flight — disables the
   * Add button so a second tap can't race the first. Omit for a synchronous onAdd. */
  isPending?: boolean;
}) {
  const accent = useAccentColor();
  const [playerName, setPlayerName] = useState("");
  const [propType, setPropType] = useState<string | null>(null);
  const [pick, setPick] = useState<(typeof PICK_OPTIONS)[number] | null>(null);
  const [line, setLine] = useState("");

  // Reset the form each time a different game's sheet opens.
  useEffect(() => {
    if (game) {
      setPlayerName("");
      setPropType(null);
      setPick(null);
      setLine("");
    }
  }, [game?.id]);

  if (!game) return null;

  const canAdd = playerName.trim().length > 0 && !!propType && !!pick;

  async function handleAdd() {
    if (!canAdd || isPending) return;
    try {
      await onAdd({
        gameId: game!.id,
        betType: "player_prop",
        pick: pick!,
        line: line.trim() || undefined,
        playerName: playerName.trim(),
        propType: propType!,
      });
      onClose();
    } catch (err) {
      Alert.alert("Couldn't add prop", err instanceof Error ? err.message : "Please try again.");
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Add Player Prop</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {game.awayTeam} @ {game.homeTeam}
          </Text>

          <Text style={styles.label}>Player</Text>
          <PlayerTypeahead value={playerName} onChange={setPlayerName} />

          <Text style={styles.label}>Prop Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PLAYER_PROP_TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setPropType(t.value)}
                style={[styles.chip, propType === t.value && { backgroundColor: accent, borderColor: accent }]}
              >
                <Text style={[styles.chipText, propType === t.value && styles.chipTextSelected]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Pick</Text>
          <View style={styles.pickRow}>
            {PICK_OPTIONS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPick(p)}
                style={[styles.pickBtn, pick === p && { backgroundColor: accent, borderColor: accent }]}
              >
                <Text style={[styles.pickBtnText, pick === p && styles.chipTextSelected]}>{PICK_LABELS[p]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Line (optional)</Text>
          <TextInput
            style={styles.input}
            value={line}
            onChangeText={setLine}
            placeholder="e.g. 74.5"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: accent },
                (!canAdd || isPending) && { opacity: 0.5 },
                pressed && canAdd && { opacity: 0.85 },
              ]}
              disabled={!canAdd || isPending}
              onPress={handleAdd}
            >
              <Text style={styles.addBtnText}>{isPending ? "Adding…" : "Add"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    gap: 4,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 13, color: "#94a3b8", marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginTop: 12, marginBottom: 6, textTransform: "uppercase" },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#cbd5e1" },
  chipTextSelected: { color: "#ffffff" },
  pickRow: { flexDirection: "row", gap: 8 },
  pickBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#2a3447",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  pickBtnText: { fontSize: 14, fontWeight: "600", color: "#cbd5e1" },
  input: {
    borderWidth: 1.5,
    borderColor: "#2a3447",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#f1f5f9",
    backgroundColor: "#141926",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#94a3b8" },
  addBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  addBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
});
