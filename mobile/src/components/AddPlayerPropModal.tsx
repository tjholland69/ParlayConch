import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Game } from "@shared/schema";
import { PLAYER_PROP_TYPES } from "@shared/schema";
import { propPickOptions } from "@shared/multiBetValidation";
import { teamShortName } from "@shared/nflTeams";
import { primaryPropType, propTypesForPosition } from "@shared/propPosition";
import { stepLine } from "@shared/propLines";
import { PlayerTypeahead } from "@/components/PlayerTypeahead";
import { useAccentColor } from "@/hooks/use-accent-color";

const PICK_OPTIONS = ["over", "under", "yes"] as const;
type PickOption = (typeof PICK_OPTIONS)[number];
/** A touchdown-scorer prop is only ever bet Yes; every other prop is an
 * over/under (shared/multiBetValidation.ts). */
const pickOptionsFor = (propType: string | null): readonly PickOption[] =>
  !propType ? ["over", "under"] : (propPickOptions(propType) as readonly PickOption[]);
const PICK_LABELS: Record<PickOption, string> = {
  over: "Over",
  under: "Under",
  yes: "Yes",
};

export type AddPlayerPropLeg = {
  gameId: number;
  betType: "player_prop";
  pick: string;
  line?: string;
  playerName: string;
  propType: string;
  /** The player's team ("Chiefs"), when they were picked from the search. */
  playerTeam?: string | null;
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
  game: gameProp,
  anyPlayerGames,
  onClose,
  onAdd,
  isPending,
}: {
  game: Game | null;
  /** Opens the sheet with no game chosen: the search covers every team, and
   * the game is whichever of these the chosen player is in. */
  anyPlayerGames?: Game[] | null;
  onClose: () => void;
  onAdd: (leg: AddPlayerPropLeg) => Promise<void> | void;
  /** True while onAdd's own async work (if any) is in flight — disables the
   * Add button so a second tap can't race the first. Omit for a synchronous onAdd. */
  isPending?: boolean;
}) {
  const accent = useAccentColor();
  const [playerName, setPlayerName] = useState("");
  const [playerPosition, setPlayerPosition] = useState<string | null>(null);
  const [playerTeam, setPlayerTeam] = useState<string | null>(null);
  const [propType, setPropType] = useState<string | null>(null);
  const [pick, setPick] = useState<PickOption | null>(null);
  const [line, setLine] = useState("");
  // While the player search is open the rest of the form steps aside, so
  // the results sit right under the box and above the keyboard.
  const [searching, setSearching] = useState(false);

  const anyPlayer = !gameProp && !!anyPlayerGames;
  // Any-player mode: the game is the one the chosen player's team is in.
  const game = gameProp ?? (playerTeam ? anyPlayerGames?.find((g) => g.homeTeam === playerTeam || g.awayTeam === playerTeam) ?? null : null);

  // Reset the form each time the sheet opens on a different game (or mode).
  useEffect(() => {
    setPlayerName("");
    setPlayerPosition(null);
    setPlayerTeam(null);
    setPropType(null);
    setPick(null);
    setLine("");
    setSearching(false);
  }, [gameProp?.id, anyPlayer]);

  if (!gameProp && !anyPlayer) return null;

  const canAdd = !!game && playerName.trim().length > 0 && !!propType && !!pick;
  const propOptions = playerPosition ? propTypesForPosition(playerPosition).primary : PLAYER_PROP_TYPES;
  const pickOptions = pickOptionsFor(propType);

  function changePropType(next: string) {
    setPropType(next);
    // A prop with one side (a touchdown prop is always Yes) picks itself;
    // otherwise drop a pick the new prop type can't have.
    const options = pickOptionsFor(next);
    if (options.length === 1) setPick(options[0]);
    else if (pick && !options.includes(pick)) setPick(null);
  }

  function changePlayer(name: string, player: { position?: string | null; team?: string | null } | null) {
    setPlayerName(name);
    setPlayerTeam(player ? teamShortName(player.team) : null);
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
        playerTeam,
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
          <Text style={styles.subtitle} numberOfLines={2}>
            {game
              ? `${game.awayTeam} @ ${game.homeTeam}`
              : playerTeam
                ? `The ${playerTeam} don't have a game open for picks this week.`
                : "Search any player with a game this week."}
          </Text>

          <Text style={styles.label}>Player</Text>
          <PlayerTypeahead gameId={gameProp?.id} value={playerName} onChange={changePlayer} onFocusChange={setSearching} />

          {!searching && (
          <>
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
          {/* Half-point steps either side of whatever's typed; the first
              press on an empty box starts at the prop's usual line. */}
          <View style={styles.lineRow}>
            <Pressable
              onPress={() => setLine((l) => stepLine(l, -1, propType))}
              style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Lower line by half a point"
              testID="button-prop-line-down"
            >
              <Ionicons name="remove" size={20} color="#f1f5f9" />
            </Pressable>
            <TextInput
              style={[styles.input, styles.lineInput]}
              value={line}
              onChangeText={setLine}
              placeholder="e.g. 74.5"
              placeholderTextColor="#64748b"
              keyboardType="decimal-pad"
              autoCapitalize="none"
              autoCorrect={false}
              testID="input-prop-line"
            />
            <Pressable
              onPress={() => setLine((l) => stepLine(l, 1, propType))}
              style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Raise line by half a point"
              testID="button-prop-line-up"
            >
              <Ionicons name="add" size={20} color="#f1f5f9" />
            </Pressable>
          </View>

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
          </>
          )}
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
  lineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  lineInput: { flex: 1, textAlign: "center" },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2a3447",
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#94a3b8" },
  addBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  addBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
});
