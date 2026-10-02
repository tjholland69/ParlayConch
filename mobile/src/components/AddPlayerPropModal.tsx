import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import type { Game } from "@shared/schema";
import { PLAYER_PROP_TYPES } from "@shared/schema";
import { YES_NO_PROP_TYPES } from "@shared/multiBetValidation";
import { primaryPropType, propTypesForPosition } from "@shared/propPosition";
import { PlayerTypeahead } from "@/components/PlayerTypeahead";
import { useAccentColor } from "@/hooks/use-accent-color";

const PICK_OPTIONS = ["over", "under", "yes", "no"] as const;
type PickOption = (typeof PICK_OPTIONS)[number];
/** Scoring props are a yes/no call; every other prop is an over/under. */
const pickOptionsFor = (propType: string | null): readonly PickOption[] =>
  !propType ? PICK_OPTIONS : YES_NO_PROP_TYPES.has(propType) ? ["yes", "no"] : ["over", "under"];
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
 * moneyline pick a game's 2x3 grid manages.
 *
 * The player search only covers the two teams in this game, and picking a
 * player narrows the prop types to ones their position can have — a
 * receiver is never offered sacks or interceptions thrown. A name typed in
 * by hand has no known position, so it's offered every prop type. */
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
  const [playerPosition, setPlayerPosition] = useState<string | null>(null);
  const [propType, setPropType] = useState<string | null>(null);
  const [pick, setPick] = useState<PickOption | null>(null);
  const [line, setLine] = useState("");

  // Reset the form each time a different game's sheet opens.
  useEffect(() => {
    if (game) {
      setPlayerName("");
      setPlayerPosition(null);
      setPropType(null);
      setPick(null);
      setLine("");
    }
  }, [game?.id]);

  if (!game) return null;

  const canAdd = playerName.trim().length > 0 && !!propType && !!pick;
  const propOptions = playerPosition ? propTypesForPosition(playerPosition).primary : PLAYER_PROP_TYPES;
  const pickOptions = pickOptionsFor(propType);

  function changePropType(next: string) {
    setPropType(next);
    // Drop a pick the new prop type can't have (e.g. "over" on Anytime TD).
    if (pick && !pickOptionsFor(next).includes(pick)) setPick(null);
  }

  function changePlayer(name: string, player: { position?: string | null } | null) {
    setPlayerName(name);
    const position = player?.position ?? null;
    setPlayerPosition(position);
    // Start on the stat this position is usually bet on; this also moves
    // off a prop type the new player's position can't have.
    if (position) changePropType(primaryPropType(position));
  }

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
          <PlayerTypeahead gameId={game.id} value={playerName} onChange={changePlayer} />

          <Text style={styles.label}>Prop Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {propOptions.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => changePropType(t.value)}
                style={[styles.chip, propType === t.value && { backgroundColor: accent, borderColor: accent }]}
              >
                <Text style={[styles.chipText, propType === t.value && styles.chipTextSelected]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Pick</Text>
          <View style={styles.pickRow}>
            {pickOptions.map((p) => (
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
