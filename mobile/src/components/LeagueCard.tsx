import { Pressable, View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { BUTTON_MIN_HEIGHT, shadows } from "@/lib/theme";
import { useWeekLockStatus } from "@/hooks/use-leagues";

interface LeagueCardProps {
  league: {
    id: number;
    name: string;
    description?: string | null;
    inviteCode: string;
    isDemo?: boolean | null;
    memberCount?: number;
    isAdmin?: boolean;
    role?: string;
  };
  /** All-time win rate + total parlays won — same top-level stats web shows on its Leagues list. */
  stat?: { winRate: number; totalDecided: number; parlaysWon: number };
  /** Shows a "Create New Parlay" button on the card when this league still needs a pick for the active week. */
  needsPick?: boolean;
  /** Active week id, used to hold the button back once that week's deadline has locked. */
  activeWeekId?: number;
}

export function LeagueCard({ league, stat, needsPick, activeWeekId }: LeagueCardProps) {
  const router = useRouter();
  const { data: lockStatus } = useWeekLockStatus(league.id, activeWeekId ?? 0);
  const showCreateParlay = needsPick && !lockStatus?.isLocked;

  const statColor =
    stat && stat.winRate >= 60 ? "#4ade80" : stat && stat.winRate >= 40 ? "#facc15" : "#f87171";

  const roleLabel = league.isAdmin
    ? "Parlay Maestro"
    : league.role === "lieutenant"
    ? "Parlay Lieutenant"
    : "Member";

  const roleColor = league.isAdmin
    ? "#2563eb"
    : league.role === "lieutenant"
    ? "#0ea5e9"
    : "#475569";

  return (
    /* Shadow on a non-clipping wrapper — shadow* + overflow:"hidden" breaks on iOS. */
    <View style={styles.shadowWrap}>
      <View style={styles.card}>
        <View style={styles.accentBar} />
        <View style={[styles.accentBarFill, { backgroundColor: roleColor }]} />

        <View style={styles.body}>
          <Pressable
            onPress={() => router.push(`/leagues/${league.id}`)}
            style={({ pressed }) => [styles.mainPress, pressed && styles.pressed]}
            testID={`card-league-${league.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Open ${league.name}`}
          >
            <View style={styles.topRow}>
              <View style={styles.titleBlock}>
                <Text style={styles.name} numberOfLines={1}>
                  {league.name}
                </Text>
                {league.isDemo && (
                  <View style={styles.demoPill}>
                    <Text style={styles.demoPillText}>DEMO</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#374151" style={styles.chevron} />
            </View>

            {league.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {league.description}
              </Text>
            ) : null}

            <View style={styles.roleRow}>
              <View style={styles.metaItem}>
                <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
                <Text style={[styles.metaText, { color: roleColor }]} numberOfLines={1}>
                  {roleLabel}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              {league.memberCount !== undefined && (
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={13} color="#475569" />
                  <Text style={styles.metaTextMuted} numberOfLines={1}>
                    {league.memberCount}{" "}
                    {league.memberCount === 1 ? "member" : "members"}
                  </Text>
                </View>
              )}

              {league.isAdmin && (
                <View style={styles.metaItem}>
                  <Ionicons name="key-outline" size={13} color="#475569" />
                  <Text style={styles.inviteCode}>{league.inviteCode}</Text>
                </View>
              )}
            </View>

            {stat && stat.totalDecided > 0 && (
              <View style={styles.statRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="trending-up-outline" size={13} color={statColor} />
                  <Text style={[styles.statText, { color: statColor }]} numberOfLines={1}>
                    {stat.winRate.toFixed(1)}% picks won
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="trophy-outline" size={13} color="#475569" />
                  <Text style={styles.metaTextMuted} numberOfLines={1}>
                    {stat.parlaysWon} parlay{stat.parlaysWon !== 1 ? "s" : ""} won
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Sibling of the card Pressable — nested Pressables were flaky. */}
          {showCreateParlay && (
            <Button
              fullWidth
              size="sm"
              style={styles.createParlayBtn}
              onPress={() => router.push(`/leagues/${league.id}/build`)}
              testID={`button-create-parlay-${league.id}`}
            >
              <Ionicons name="add-circle-outline" size={15} color="#ffffff" />
              <Text style={styles.createParlayBtnText}>Create New Parlay</Text>
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    marginBottom: 20,
    borderRadius: 18,
    alignSelf: "stretch",
    minWidth: 0,
    ...shadows.card,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#1c2538",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2a3447",
    overflow: "hidden",
    minWidth: 0,
  },
  /* Invisible spacer + absolute fill so the accent spans full card height
   * without living inside the Pressable (CTA is a sibling below). */
  accentBar: {
    width: 5,
    flexShrink: 0,
  },
  accentBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  body: {
    flex: 1,
    padding: 20,
    paddingLeft: 15,
    minWidth: 0,
    gap: 12,
  },
  mainPress: { minWidth: 0 },
  pressed: { opacity: 0.85 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    minWidth: 0,
  },
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f1f5f9",
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 6,
  },
  demoPill: {
    backgroundColor: "#2d2000",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  demoPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#f59e0b",
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 10,
    lineHeight: 18,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 8,
    minWidth: 0,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    flexShrink: 1,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    minWidth: 0,
  },
  statText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  roleDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  metaText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  metaTextMuted: { fontSize: 12, color: "#475569", flexShrink: 1 },
  inviteCode: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    letterSpacing: 1,
    flexShrink: 1,
  },
  createParlayBtn: {
    minHeight: BUTTON_MIN_HEIGHT,
    borderRadius: 10,
  },
  createParlayBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
});
