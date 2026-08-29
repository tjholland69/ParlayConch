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
  canBuyPoints,
  derivePointsMoved,
  MAX_POINTS_MOVE,
  POINTS_STEP,
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
  onAdjustPoints,
  pointsPending,
  readOnly,
  takenBy,
}: {
  game: Game;
  selectedLeg?: SelectedLeg;
  onSelect: (leg: Omit<SelectedLeg, "gameId"> & { gameId?: number }) => void;
  onClear: () => void;
  /** "Buy points" slider callback — re-prices the currently selected Spread/
   * Over/Under leg at a new points-moved value (a safer line at worse odds).
   * Omitted markets (moneyline, or no leg selected yet) never show the control. */
  onAdjustPoints?: (pointsMoved: number) => void;
  /** True while an onAdjustPoints call is in flight — disables the stepper
   * so a second tap can't race the first. */
  pointsPending?: boolean;
  /** Preview mode for a week that isn't open for picks yet — every market
   * renders disabled, same visual treatment as an already-started game. */
  readOnly?: boolean;
  /** Who (if anyone) already has the Spread / Total market on this game —
   * once one member takes either side, no one else may take that market at
   * all, home or away / over or under. Moneyline is never exclusive. */
  takenBy?: { spread?: string; total?: string };
}) {
  const past = readOnly || isGamePast(game);
  const awaySpread = awaySpreadDisplay(game.spread);
  const homeSpread = game.spread || null;
  const hasPick = !!selectedLeg;
  const spreadTaken = !!takenBy?.spread && selectedLeg?.betType !== "spread";
  const totalTaken = !!takenBy?.total && selectedLeg?.betType !== "over" && selectedLeg?.betType !== "under";
  const showPointsControl = !past && !!selectedLeg && !!onAdjustPoints && canBuyPoints(selectedLeg.betType);
  const currentPoints = selectedLeg ? derivePointsMoved(game, selectedLeg.betType, selectedLeg.pick, selectedLeg.line) : 0;

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
            disabled={past || !game.spread || spreadTaken}
            onPress={() => select("spread", "away")}
            accessibilityLabel={`${game.awayTeam} spread ${awaySpread || "unavailable"}`}
          />
          <MarketButton
            primary={homeSpread || "—"}
            secondary={game.spread ? game.spreadOdds || "-110" : null}
            selected={selectedLeg?.betType === "spread" && selectedLeg?.pick === "home"}
            disabled={past || !game.spread || spreadTaken}
            onPress={() => select("spread", "home")}
            accessibilityLabel={`${game.homeTeam} spread ${homeSpread || "unavailable"}`}
          />
        </View>
        {spreadTaken && (
          <Text style={styles.takenText}>Spread taken by {takenBy!.spread}</Text>
        )}
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
            disabled={past || !game.overUnder || totalTaken}
            onPress={() => select("over", "over")}
            accessibilityLabel={`Over ${game.overUnder || "unavailable"}`}
          />
          <MarketButton
            primary={`U ${game.overUnder || "—"}`}
            secondary={game.overUnder ? game.underOdds || "-110" : null}
            selected={selectedLeg?.betType === "under" && selectedLeg?.pick === "under"}
            disabled={past || !game.overUnder || totalTaken}
            onPress={() => select("under", "under")}
            accessibilityLabel={`Under ${game.overUnder || "unavailable"}`}
          />
        </View>
        {totalTaken && (
          <Text style={styles.takenText}>Total taken by {takenBy!.total}</Text>
        )}
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

      {showPointsControl && (
        <View style={styles.pointsRow}>
          <View style={styles.pointsLabelBlock}>
            <Text style={styles.pointsLabel}>Buy Points</Text>
            <Text style={styles.pointsValue}>
              {currentPoints === 0 ? "No points bought" : `+${currentPoints} pts → ${selectedLeg!.line ?? ""}`}
            </Text>
          </View>
          <View style={styles.pointsSteppers}>
            <Pressable
              onPress={() => onAdjustPoints!(Math.max(0, currentPoints - POINTS_STEP))}
              disabled={pointsPending || currentPoints <= 0}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Buy fewer points"
              style={({ pressed }) => [
                styles.pointsStepBtn,
                (pointsPending || currentPoints <= 0) && styles.pointsStepBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="remove" size={16} color="#f1f5f9" />
            </Pressable>
            <Pressable
              onPress={() => onAdjustPoints!(Math.min(MAX_POINTS_MOVE, currentPoints + POINTS_STEP))}
              disabled={pointsPending || currentPoints >= MAX_POINTS_MOVE}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Buy more points"
              style={({ pressed }) => [
                styles.pointsStepBtn,
                (pointsPending || currentPoints >= MAX_POINTS_MOVE) && styles.pointsStepBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="add" size={16} color="#f1f5f9" />
            </Pressable>
          </View>
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
  takenText: { fontSize: 11, color: "#64748b", marginTop: -2 },
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
  pointsRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pointsLabelBlock: { flex: 1, minWidth: 0 },
  pointsLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 },
  pointsValue: { fontSize: 13, color: "#f1f5f9", fontWeight: "500", marginTop: 2 },
  pointsSteppers: { flexDirection: "row", gap: 8, flexShrink: 0 },
  pointsStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
  },
  pointsStepBtnDisabled: { opacity: 0.35 },
});
