import { View, Text, Pressable, StyleSheet } from "react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import type { Game } from "@shared/schema";
import {
  awaySpreadDisplay,
  isGamePast,
  shortLegLabel,
  type SelectedLeg,
} from "@/lib/pickHelpers";

type MarketBtnProps = {
  primary: string;
  secondary?: string | null;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  flex?: number;
};

function MarketButton({
  primary,
  secondary,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
  flex = 1,
}: MarketBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.marketBtn,
        { flex },
        selected && styles.marketBtnSelected,
        disabled && styles.marketBtnDisabled,
        pressed && !disabled && styles.marketBtnPressed,
      ]}
    >
      <Text style={[styles.marketPrimary, selected && styles.marketPrimarySelected]} numberOfLines={1}>
        {primary}
      </Text>
      {secondary ? (
        <Text style={[styles.marketSecondary, selected && styles.marketSecondarySelected]} numberOfLines={1}>
          {secondary}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function GamePickCard({
  game,
  selectedLeg,
  onSelect,
  onClear,
}: {
  game: Game;
  selectedLeg?: SelectedLeg;
  onSelect: (leg: Omit<SelectedLeg, "gameId"> & { gameId?: number }) => void;
  onClear: () => void;
}) {
  const past = isGamePast(game);
  const awaySpread = awaySpreadDisplay(game.spread);
  const homeSpread = game.spread || null;
  const hasPick = !!selectedLeg;

  const select = (betType: string, pick: string) => {
    if (past) return;
    if (selectedLeg?.betType === betType && selectedLeg?.pick === pick) {
      onClear();
      return;
    }
    onSelect({ gameId: game.id, betType, pick });
  };

  return (
    <View
      style={[
        styles.card,
        past && styles.cardPast,
        hasPick && styles.cardPicked,
      ]}
    >
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {game.gameTime ? format(new Date(game.gameTime), "EEE, MMM d h:mm a") : "Time TBD"}
        </Text>
        {past ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{game.isFinished ? "Final" : "Started"}</Text>
          </View>
        ) : game.venue ? (
          <Text style={styles.venueText} numberOfLines={1}>
            {game.venue}
          </Text>
        ) : null}
      </View>

      {/* Away */}
      <View style={styles.teamRow}>
        <View style={styles.teamCol}>
          <Text style={styles.teamName} numberOfLines={1}>
            {game.awayTeam}
          </Text>
          {game.awayRecord ? <Text style={styles.record}>{game.awayRecord}</Text> : null}
        </View>
        <View style={styles.marketsCol}>
          <MarketButton
            primary={awaySpread || "—"}
            secondary={game.spread ? game.spreadOdds || "-110" : null}
            selected={selectedLeg?.betType === "spread" && selectedLeg?.pick === "away"}
            disabled={past || !game.spread}
            onPress={() => select("spread", "away")}
            accessibilityLabel={`${game.awayTeam} spread ${awaySpread || "unavailable"}`}
          />
          <MarketButton
            primary={game.moneylineAway || "—"}
            secondary="ML"
            selected={selectedLeg?.betType === "moneyline" && selectedLeg?.pick === "away"}
            disabled={past || !game.moneylineAway}
            onPress={() => select("moneyline", "away")}
            accessibilityLabel={`${game.awayTeam} moneyline ${game.moneylineAway || "unavailable"}`}
          />
        </View>
      </View>

      {/* Home */}
      <View style={[styles.teamRow, styles.teamRowHome]}>
        <View style={styles.teamCol}>
          <Text style={styles.teamName} numberOfLines={1}>
            {game.homeTeam}
          </Text>
          {game.homeRecord ? <Text style={styles.record}>{game.homeRecord}</Text> : null}
        </View>
        <View style={styles.marketsCol}>
          <MarketButton
            primary={homeSpread || "—"}
            secondary={game.spread ? game.spreadOdds || "-110" : null}
            selected={selectedLeg?.betType === "spread" && selectedLeg?.pick === "home"}
            disabled={past || !game.spread}
            onPress={() => select("spread", "home")}
            accessibilityLabel={`${game.homeTeam} spread ${homeSpread || "unavailable"}`}
          />
          <MarketButton
            primary={game.moneylineHome || "—"}
            secondary="ML"
            selected={selectedLeg?.betType === "moneyline" && selectedLeg?.pick === "home"}
            disabled={past || !game.moneylineHome}
            onPress={() => select("moneyline", "home")}
            accessibilityLabel={`${game.homeTeam} moneyline ${game.moneylineHome || "unavailable"}`}
          />
        </View>
      </View>

      {/* Totals */}
      <View style={styles.totalsRow}>
        <MarketButton
          primary={`O ${game.overUnder || "—"}`}
          secondary={game.overUnder ? game.overOdds || "-110" : null}
          selected={selectedLeg?.betType === "over" && selectedLeg?.pick === "over"}
          disabled={past || !game.overUnder}
          onPress={() => select("over", "over")}
          accessibilityLabel={`Over ${game.overUnder || "unavailable"}`}
        />
        <MarketButton
          primary={`U ${game.overUnder || "—"}`}
          secondary={game.overUnder ? game.underOdds || "-110" : null}
          selected={selectedLeg?.betType === "under" && selectedLeg?.pick === "under"}
          disabled={past || !game.overUnder}
          onPress={() => select("under", "under")}
          accessibilityLabel={`Under ${game.overUnder || "unavailable"}`}
        />
      </View>

      {game.isFinished && game.awayScore != null && game.homeScore != null && (
        <View style={styles.finalRow}>
          <Text style={styles.finalScore}>
            {game.awayScore} – {game.homeScore}
          </Text>
          <Text style={styles.finalLabel}>Final</Text>
        </View>
      )}

      {selectedLeg && (
        <View style={styles.selectionStrip}>
          <Ionicons name="checkmark-circle" size={18} color="#2563eb" />
          <Text style={styles.selectionLabel} numberOfLines={1}>
            {shortLegLabel(selectedLeg, game)}
          </Text>
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear pick for this game"
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1c2538",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 16,
    marginBottom: 12,
  },
  cardPast: { opacity: 0.45 },
  cardPicked: {
    borderColor: "#2563eb",
    borderLeftWidth: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  metaText: { fontSize: 12, color: "#94a3b8", flexShrink: 0 },
  venueText: { fontSize: 12, color: "#475569", flex: 1, textAlign: "right" },
  statusPill: {
    backgroundColor: "#2a3447",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  teamRowHome: { marginBottom: 12 },
  teamCol: { width: "36%", paddingRight: 4 },
  teamName: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  record: { fontSize: 12, color: "#64748b", marginTop: 2 },
  marketsCol: { flex: 1, flexDirection: "row", gap: 8 },
  totalsRow: { flexDirection: "row", gap: 8 },
  marketBtn: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a3447",
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  marketBtnSelected: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  marketBtnDisabled: { opacity: 0.4 },
  marketBtnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  marketPrimary: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  marketPrimarySelected: { color: "#ffffff" },
  marketSecondary: { fontSize: 11, color: "#64748b", marginTop: 2 },
  marketSecondarySelected: { color: "#bfdbfe" },
  finalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  finalScore: { fontSize: 14, fontWeight: "700", color: "#f1f5f9", fontVariant: ["tabular-nums"] },
  finalLabel: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  selectionStrip: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  selectionLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#f1f5f9" },
  clearBtn: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
});
