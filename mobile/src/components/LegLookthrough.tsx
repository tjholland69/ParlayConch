import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Game, ParlayLegWithParlayContext } from "@shared/schema";
import { legLookthroughLabel, withPlusSign } from "@shared/formatPick";
import { DisputeLegSheet } from "@/components/DisputeLegSheet";
import { resolveResultDetail } from "@shared/legJustification";
import { getSlate } from "@shared/slate";

type UserLike = {
  firstName?: string | null;
  email?: string | null;
  settings?: { displayName?: string | null } | null;
} | null | undefined;

export function legOwnerName(user: UserLike, fallback = "Unknown"): string {
  return user?.settings?.displayName ?? user?.firstName ?? user?.email ?? fallback;
}

/** The fields LegRow reads. `ReactNode` is still used by the sheet below. */
export type LegRowLeg = {
  id: number;
  parlayId: number;
  gameId: number | null;
  userId: string | null;
  betType: string;
  pick: string;
  line: string | null;
  odds: string | null;
  propType: string | null;
  playerName: string | null;
  gameSegment?: string | null;
  result: string | null;
  resultDetail?: string | null;
  game: Game | null;
};

const RESULT_COLORS: Record<string, string> = { win: "#22c55e", loss: "#ef4444", push: "#94a3b8" };
const RESULT_LABELS: Record<string, string> = { win: "Won", loss: "Lost", push: "Push" };

function kickoffLabel(gameTime: Date | string): string {
  return new Date(gameTime).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One parlay leg, the same two lines everywhere a leg is listed:
 *   Bet Owner · the bet ("Lamar Jackson - Rush Yds O 25")        Result
 *   Week + Year · AWAY@HOME · Slate
 * The right side holds the result and nothing else. Tapping the row opens
 * the game details underneath. On the member's own bet (`disputable`) the
 * bet text is a link that opens the dispute sheet.
 */
export function LegRow({
  leg,
  ownerName,
  week,
  disputable,
}: {
  leg: LegRowLeg;
  ownerName: string;
  week?: { label: string; season: number } | null;
  /** The viewer's own bet: tapping the bet text disputes it. */
  disputable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const game = leg.game;
  const label = legLookthroughLabel(leg, game);
  const odds = withPlusSign(leg.odds);
  const resultColor = RESULT_COLORS[leg.result ?? ""] ?? "#cbd5e1";
  const secondLine = [
    week ? `${week.label} ${week.season}` : null,
    game ? `${game.awayTeam}@${game.homeTeam}` : null,
    game?.gameTime ? getSlate(new Date(game.gameTime)) : null,
  ].filter(Boolean).join("  ·  ");
  const score =
    game?.awayScore != null && game?.homeScore != null
      ? `${game.awayTeam} ${game.awayScore} – ${game.homeTeam} ${game.homeScore}${game.isFinished ? " (Final)" : ""}`
      : null;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => pressed && styles.pressed}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide game details" : "Show game details"}
        testID={`row-leg-${leg.id}`}
      >
        <View style={styles.line}>
          <View style={[styles.dot, { backgroundColor: resultColor }]} />
          <Text style={styles.owner} numberOfLines={1}>{ownerName}</Text>
          {disputable ? (
            <Text
              style={[styles.pick, styles.pickLink, { color: resultColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              onPress={() => setDisputeOpen(true)}
              suppressHighlighting
              accessibilityRole="link"
              accessibilityLabel={`${label}. Dispute this bet`}
              testID={`link-dispute-leg-${leg.id}`}
            >
              {label}
            </Text>
          ) : (
            <Text style={[styles.pick, { color: resultColor }]} numberOfLines={1} ellipsizeMode="tail">
              {label}
            </Text>
          )}
          <Text style={[styles.result, { color: resultColor }]} testID={`text-leg-result-${leg.id}`}>
            {RESULT_LABELS[leg.result ?? ""] ?? "Pending"}
          </Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.meta} numberOfLines={1}>{secondLine || "—"}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={12} color="#475569" />
        </View>
      </Pressable>
      {open && (
        <View style={styles.details}>
          {game?.gameTime ? <Text style={styles.detailText}>Kickoff: {kickoffLabel(game.gameTime)} ET</Text> : null}
          {odds ? <Text style={styles.detailText}>Odds: {odds}</Text> : null}
          {score ? <Text style={styles.detailText}>{score}</Text> : null}
          <Text style={styles.detailText}>
            {leg.result ? `${leg.result.toUpperCase()}: ${resolveResultDetail(leg, game)}` : "Not settled yet"}
          </Text>
          <Text style={styles.detailIds}>
            parlay {leg.parlayId} · leg {leg.id} · game {leg.gameId ?? "—"}
          </Text>
        </View>
      )}
      {disputable && <DisputeLegSheet legId={leg.id} visible={disputeOpen} onClose={() => setDisputeOpen(false)} />}
    </View>
  );
}

/** A member with no bet in a locked parlay: listed with the legs, as Void. */
export function VoidLegRow({ ownerName }: { ownerName: string }) {
  return (
    <View style={[styles.row, styles.voidRow]}>
      <View style={styles.line}>
        <View style={[styles.dot, { backgroundColor: "#475569" }]} />
        <Text style={styles.owner} numberOfLines={1}>{ownerName}</Text>
        <Text style={[styles.pick, { color: "#64748b" }]} numberOfLines={1}>No pick</Text>
        <Text style={[styles.result, { color: "#64748b" }]}>Void</Text>
      </View>
    </View>
  );
}

/**
 * The lookthrough: a bottom sheet listing the legs behind a tapped number.
 * One look for the Dash tiles, the league Stats records and anywhere else a
 * stat drills into its legs. Pass `children` to show something other than
 * legs (e.g. a list of missed weeks) in the same sheet.
 */
export function LegLookthroughSheet({
  visible,
  title,
  legs,
  isLoading,
  onClose,
  emptyText = "No legs found.",
  children,
}: {
  visible: boolean;
  title: string;
  legs?: ParlayLegWithParlayContext[];
  isLoading?: boolean;
  onClose: () => void;
  emptyText?: string;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>{title}</Text>
            {legs && legs.length > 0 && !isLoading ? (
              <Text style={styles.sheetCount}>{legs.length} leg{legs.length !== 1 ? "s" : ""}</Text>
            ) : null}
          </View>
          {isLoading ? (
            <ActivityIndicator color="#2563eb" style={styles.loader} />
          ) : children ? (
            children
          ) : !legs || legs.length === 0 ? (
            <Text style={styles.empty}>{emptyText}</Text>
          ) : (
            <ScrollView style={styles.scroll}>
              {legs.map((leg) => (
                <LegRow
                  key={leg.id}
                  leg={leg}
                  ownerName={leg.user ? legOwnerName(leg.user) : leg.parlay.isOwnParlay ? "You" : legOwnerName(leg.parlay.owner)}
                  week={leg.parlay.week}
                />
              ))}
            </ScrollView>
          )}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#2a3447" },
  line: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  owner: { fontSize: 12, fontWeight: "700", color: "#94a3b8", maxWidth: "26%", flexShrink: 0 },
  pick: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "600" },
  pickLink: { textDecorationLine: "underline" },
  result: { fontSize: 12, fontWeight: "700", flexShrink: 0, minWidth: 48, textAlign: "right" },
  voidRow: { opacity: 0.7 },
  meta: { flex: 1, minWidth: 0, fontSize: 11, color: "#64748b", marginLeft: 13 },
  pressed: { opacity: 0.65 },
  details: { marginTop: 6, marginLeft: 13, paddingLeft: 10, borderLeftWidth: 2, borderColor: "#2a3447", gap: 2 },
  detailText: { fontSize: 12, color: "#94a3b8" },
  detailIds: { fontSize: 10, color: "#475569", marginTop: 2 },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    maxHeight: "80%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#374151", alignSelf: "center", marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  sheetCount: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  scroll: { flexGrow: 0 },
  loader: { marginVertical: 32 },
  empty: { fontSize: 13, color: "#94a3b8", paddingVertical: 20 },
  closeBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 15, fontWeight: "600", color: "#94a3b8" },
});
