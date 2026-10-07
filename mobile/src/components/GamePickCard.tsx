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
  type TakenMarkets,
} from "@/lib/pickHelpers";

/** One-off for this card's team header: "Commanders" is the only team name
 * too long for its half of the card, so it gets a shorter stand-in here and
 * nowhere else. */
function headerTeamName(team: string) {
  return team.replace(/Commanders$/, "Commies");
}

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
  readOnly,
  takenBy,
  onAddProp,
}: {
  game: Game;
  selectedLeg?: SelectedLeg;
  onSelect: (leg: Omit<SelectedLeg, "gameId"> & { gameId?: number }) => void;
  onClear: () => void;
  /** Alternate-line stepper callback — re-prices the selected Spread/Over/
   * Under pick at a new points-moved value: positive buys points (safer
   * line, worse odds), negative sells them. Omitted markets (moneyline, or
   * no pick on this game) never show the control. */
  onAdjustPoints?: (pointsMoved: number) => void;
  /** Preview mode for a week that isn't open for picks yet — every market
   * renders disabled, same visual treatment as an already-started game. */
  readOnly?: boolean;
  /** Who (if anyone) already has each market on this game in the parlay.
   * One bet per market: once a member has it, nobody else can take either
   * side. */
  takenBy?: TakenMarkets;
  /** Opens the Add Player Prop sheet for this game. Omitted (e.g. read-only
   * preview mode) hides the affordance entirely. */
  onAddProp?: () => void;
}) {
  const past = readOnly || isGamePast(game);
  const awaySpread = awaySpreadDisplay(game.spread);
  const homeSpread = game.spread || null;
  const hasPick = !!selectedLeg;
  const spreadTaken = !!takenBy?.spread && selectedLeg?.betType !== "spread";
  const moneylineTaken = !!takenBy?.moneyline && selectedLeg?.betType !== "moneyline";
  const totalTaken = !!takenBy?.total && selectedLeg?.betType !== "over" && selectedLeg?.betType !== "under";
  const showPointsControl = !past && !!selectedLeg && !!onAdjustPoints && canBuyPoints(selectedLeg.betType);
  const currentPoints = selectedLeg ? derivePointsMoved(game, selectedLeg.betType, selectedLeg.pick, selectedLeg.line) : 0;
  const canSellPoints = currentPoints > -MAX_POINTS_MOVE;
  const canBuyMorePoints = currentPoints < MAX_POINTS_MOVE;

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
              {headerTeamName(game.awayTeam)}
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
              {headerTeamName(game.homeTeam)}
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
            disabled={past || !game.moneylineAway || moneylineTaken}
            onPress={() => select("moneyline", "away")}
            accessibilityLabel={`${game.awayTeam} moneyline ${game.moneylineAway || "unavailable"}`}
          />
          <MarketButton
            primary={game.moneylineHome || "—"}
            secondary="ML"
            selected={selectedLeg?.betType === "moneyline" && selectedLeg?.pick === "home"}
            disabled={past || !game.moneylineHome || moneylineTaken}
            onPress={() => select("moneyline", "home")}
            accessibilityLabel={`${game.homeTeam} moneyline ${game.moneylineHome || "unavailable"}`}
          />
        </View>
        {moneylineTaken && (
          <Text style={styles.takenText}>Moneyline taken by {takenBy!.moneyline}</Text>
        )}
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

      {/* Alternate line: the two step buttons sit either side of the line
          they change. Nothing else in the row is tappable, so no press
          highlight ever covers them. */}
      {showPointsControl && (
        <View style={styles.pointsBlock}>
          <Text style={styles.pointsLabel}>Alternate line</Text>
          <View style={styles.pointsRow}>
            <Pressable
              onPress={() => onAdjustPoints!(Math.max(-MAX_POINTS_MOVE, currentPoints - POINTS_STEP))}
              disabled={!canSellPoints}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Move the line half a point riskier, for better odds"
              testID={`button-points-minus-${game.id}`}
              style={({ pressed }) => [
                styles.pointsStepBtn,
                !canSellPoints && styles.pointsStepBtnDisabled,
                pressed && styles.pointsStepBtnPressed,
              ]}
            >
              <Ionicons name="remove" size={26} color="#ffffff" />
            </Pressable>
            <View style={styles.pointsReadout} accessibilityLiveRegion="polite">
              <Text style={styles.pointsValue} numberOfLines={1} testID={`text-points-line-${game.id}`}>
                {selectedLeg!.line ?? "—"}
              </Text>
              <Text style={styles.pointsHint} numberOfLines={1}>
                {currentPoints === 0
                  ? "Market line"
                  : `${currentPoints > 0 ? "Bought" : "Sold"} ${Math.abs(currentPoints)} pt${Math.abs(currentPoints) === 1 ? "" : "s"}`}
              </Text>
            </View>
            <Pressable
              onPress={() => onAdjustPoints!(Math.min(MAX_POINTS_MOVE, currentPoints + POINTS_STEP))}
              disabled={!canBuyMorePoints}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Move the line half a point safer, for worse odds"
              testID={`button-points-plus-${game.id}`}
              style={({ pressed }) => [
                styles.pointsStepBtn,
                !canBuyMorePoints && styles.pointsStepBtnDisabled,
                pressed && styles.pointsStepBtnPressed,
              ]}
            >
              <Ionicons name="add" size={26} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      )}

      {!past && onAddProp && (
        <Pressable
          onPress={onAddProp}
          style={({ pressed }) => [styles.addPropBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Add a player prop for this game"
        >
          <Ionicons name="add-circle-outline" size={15} color="#94a3b8" />
          <Text style={styles.addPropBtnText}>Add Player Prop</Text>
        </Pressable>
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
  addPropBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a3447",
    borderStyle: "dashed",
  },
  addPropBtnText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  pointsBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    gap: 8,
  },
  pointsLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 },
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointsReadout: { flex: 1, minWidth: 0, alignItems: "center" },
  pointsValue: { fontSize: 17, color: "#f1f5f9", fontWeight: "700", fontVariant: ["tabular-nums"] },
  pointsHint: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  pointsStepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  pointsStepBtnDisabled: { backgroundColor: "#2a3447", opacity: 0.5 },
  pointsStepBtnPressed: { backgroundColor: "#1d4ed8", transform: [{ scale: 0.96 }] },
});
