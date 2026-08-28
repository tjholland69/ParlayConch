import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import type { Game } from "@shared/schema";
import { useTeams } from "@/hooks/use-teams";
import { useGameWeather } from "@/hooks/use-game-weather";
import {
  awaySpreadDisplay,
  isGamePast,
  shortLegLabel,
  type SelectedLeg,
} from "@/lib/pickHelpers";

function TeamLogo({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return null;
  return <Image source={{ uri: logoUrl }} style={styles.teamLogo} resizeMode="contain" />;
}

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
  readOnly,
}: {
  game: Game;
  selectedLeg?: SelectedLeg;
  onSelect: (leg: Omit<SelectedLeg, "gameId"> & { gameId?: number }) => void;
  onClear: () => void;
  /** Preview mode for a week that isn't open for picks yet — every market
   * renders disabled, same visual treatment as an already-started game. */
  readOnly?: boolean;
}) {
  const past = readOnly || isGamePast(game);
  const awaySpread = awaySpreadDisplay(game.spread);
  const homeSpread = game.spread || null;
  const hasPick = !!selectedLeg;

  const { data: teams } = useTeams();
  const homeTeamData = teams?.find((t) => t.abbreviation === game.homeTeam);
  const awayTeamData = teams?.find((t) => t.abbreviation === game.awayTeam);
  // The home team's stadium is the game's location (barring the rare
  // international game) — real `game.venue` data, when present, wins.
  const locationText =
    game.venue ||
    (homeTeamData ? [homeTeamData.stadiumName, homeTeamData.city].filter(Boolean).join(", ") : null);
  const isIndoors = homeTeamData?.stadiumType && homeTeamData.stadiumType !== "outdoor";
  const { data: weather } = useGameWeather(game.id, !past && !isIndoors);

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
        ) : locationText ? (
          <View style={styles.venueRow}>
            {isIndoors ? (
              <Ionicons name="home-outline" size={11} color="#475569" />
            ) : weather ? (
              <View style={styles.weatherRow}>
                <Ionicons name="partly-sunny-outline" size={12} color="#475569" />
                {weather.tempF != null && <Text style={styles.weatherText}>{Math.round(weather.tempF)}°</Text>}
                {weather.precipChancePct != null && weather.precipChancePct > 0 && (
                  <Text style={styles.weatherText}>· {Math.round(weather.precipChancePct)}%</Text>
                )}
              </View>
            ) : null}
            <Text style={styles.venueText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Team header — names/records sit above the pick grid so every row
          below shares identical geometry instead of being anchored to a team. */}
      <View style={styles.teamHeaderRow}>
        <View style={styles.teamHeaderCol}>
          <View style={styles.teamNameRow}>
            <Text style={styles.teamName} numberOfLines={1}>
              {game.awayTeam}
            </Text>
            <TeamLogo logoUrl={awayTeamData?.logoUrl} />
          </View>
          {game.awayRecord ? <Text style={styles.record}>{game.awayRecord}</Text> : null}
        </View>
        <Text style={styles.teamHeaderAt}>@</Text>
        <View style={[styles.teamHeaderCol, styles.teamHeaderColRight]}>
          <View style={[styles.teamNameRow, styles.teamNameRowRight]}>
            <TeamLogo logoUrl={homeTeamData?.logoUrl} />
            <Text style={styles.teamName} numberOfLines={1}>
              {game.homeTeam}
            </Text>
          </View>
          {game.homeRecord ? <Text style={styles.record}>{game.homeRecord}</Text> : null}
        </View>
      </View>

      {/* 2x3 pick grid — each row is one market, each column one side, so
          all 6 boxes read as a single matrix spanning the card's width. */}
      <View style={styles.pickGrid}>
        <View style={styles.pickGridRow}>
          <MarketButton
            primary={awaySpread || "—"}
            secondary={game.spread ? game.spreadOdds || "-110" : null}
            selected={selectedLeg?.betType === "spread" && selectedLeg?.pick === "away"}
            disabled={past || !game.spread}
            onPress={() => select("spread", "away")}
            accessibilityLabel={`${game.awayTeam} spread ${awaySpread || "unavailable"}`}
          />
          <MarketButton
            primary={homeSpread || "—"}
            secondary={game.spread ? game.spreadOdds || "-110" : null}
            selected={selectedLeg?.betType === "spread" && selectedLeg?.pick === "home"}
            disabled={past || !game.spread}
            onPress={() => select("spread", "home")}
            accessibilityLabel={`${game.homeTeam} spread ${homeSpread || "unavailable"}`}
          />
        </View>
        <View style={styles.pickGridRow}>
          <MarketButton
            primary={game.moneylineAway || "—"}
            secondary="ML"
            selected={selectedLeg?.betType === "moneyline" && selectedLeg?.pick === "away"}
            disabled={past || !game.moneylineAway}
            onPress={() => select("moneyline", "away")}
            accessibilityLabel={`${game.awayTeam} moneyline ${game.moneylineAway || "unavailable"}`}
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
        <View style={styles.pickGridRow}>
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
  venueRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end", minWidth: 0 },
  venueText: { fontSize: 12, color: "#475569", flexShrink: 1, textAlign: "right" },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
  weatherText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  statusPill: {
    backgroundColor: "#2a3447",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  teamHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  teamHeaderCol: { flex: 1, minWidth: 0 },
  teamHeaderColRight: { alignItems: "flex-end" },
  teamHeaderAt: { fontSize: 12, color: "#475569", fontWeight: "600" },
  teamNameRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  teamNameRowRight: { justifyContent: "flex-end" },
  teamLogo: { width: 20, height: 20, flexShrink: 0 },
  teamName: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  record: { fontSize: 12, color: "#64748b", marginTop: 2 },
  pickGrid: { gap: 8 },
  pickGridRow: { flexDirection: "row", gap: 8 },
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
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
});
