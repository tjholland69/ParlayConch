import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useLeagues } from "@/hooks/use-leagues";
import { useActiveWeek } from "@/hooks/use-weeks";
import { useMyParlay } from "@/hooks/use-parlays";
import { format, formatDistanceToNow, isPast } from "date-fns";

function ParlayStatusRow({ leagueId, weekId, leagueName, onPress }: {
  leagueId: number;
  weekId: number;
  leagueName: string;
  onPress: () => void;
}) {
  const { data: parlay, isLoading } = useMyParlay(leagueId, weekId);

  const statusConfig = (() => {
    if (!parlay) return {
      icon: "alert-circle-outline" as const,
      iconColor: "#f59e0b",
      label: "Not submitted",
      sublabel: "Tap to view league",
      bg: "#1c1a0a",
      border: "#3d2e00",
    };
    if (parlay.status === "approved") return {
      icon: "checkmark-circle" as const,
      iconColor: "#22c55e",
      label: "Approved",
      sublabel: `${parlay.legs?.length ?? 0} legs`,
      bg: "#0a1c14",
      border: "#1a3d28",
    };
    if (parlay.status === "rejected") return {
      icon: "close-circle" as const,
      iconColor: "#ef4444",
      label: "Rejected",
      sublabel: `${parlay.legs?.length ?? 0} legs`,
      bg: "#1c0a0a",
      border: "#3d1a1a",
    };
    return {
      icon: "time-outline" as const,
      iconColor: "#94a3b8",
      label: "Pending review",
      sublabel: `${parlay.legs?.length ?? 0} legs`,
      bg: "#141926",
      border: "#2a3447",
    };
  })();

  if (isLoading) {
    return (
      <View style={styles.parlayCard}>
        <ActivityIndicator size="small" color="#2563eb" />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.parlayCard,
        { backgroundColor: statusConfig.bg, borderColor: statusConfig.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.parlayCardLeft}>
        <Ionicons name={statusConfig.icon} size={24} color={statusConfig.iconColor} />
      </View>
      <View style={styles.parlayCardContent}>
        <Text style={styles.parlayLeagueName} numberOfLines={1}>{leagueName}</Text>
        <Text style={styles.parlayStatusLabel}>{statusConfig.label}</Text>
        {statusConfig.sublabel && (
          <Text style={styles.parlaySubLabel}>{statusConfig.sublabel}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#475569" />
    </Pressable>
  );
}

export default function PicksScreen() {
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const activeWeek = useActiveWeek();
  const router = useRouter();

  const deadline = activeWeek?.deadline ? new Date(activeWeek.deadline) : null;
  const deadlinePast = deadline ? isPast(deadline) : false;

  if (leaguesLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIcon}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#2563eb" />
        </View>
        <Text style={styles.emptyTitle}>No leagues yet</Text>
        <Text style={styles.emptySubtitle}>
          Join or create a league on the Leagues tab to start submitting picks.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Week header */}
      {activeWeek ? (
        <View style={styles.weekBanner}>
          <View style={styles.weekBannerLeft}>
            <Ionicons name="calendar" size={18} color="#2563eb" />
            <View>
              <Text style={styles.weekName}>{activeWeek.name}</Text>
              {deadline && (
                <Text style={[styles.deadlineText, deadlinePast && styles.deadlineTextPast]}>
                  {deadlinePast
                    ? "Deadline passed"
                    : `Closes ${formatDistanceToNow(deadline, { addSuffix: true })}`}
                </Text>
              )}
            </View>
          </View>
          {deadline && !deadlinePast && (
            <View style={styles.deadlinePill}>
              <Text style={styles.deadlinePillText}>
                {format(deadline, "MMM d, h:mm a")}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.noWeekBanner}>
          <Ionicons name="time-outline" size={16} color="#94a3b8" />
          <Text style={styles.noWeekText}>No active week right now</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>THIS WEEK'S STATUS</Text>

      {leagues.map((league) => (
        <ParlayStatusRow
          key={league.id}
          leagueId={league.id}
          weekId={activeWeek?.id ?? 0}
          leagueName={league.name}
          onPress={() => router.push(`/leagues/${league.id}`)}
        />
      ))}

      {/* Web app nudge */}
      <View style={styles.webNudge}>
        <Ionicons name="globe-outline" size={16} color="#475569" />
        <Text style={styles.webNudgeText}>
          Submit and edit picks at{" "}
          <Text style={styles.webNudgeLink}>parlayconch.com</Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  content: { padding: 20 },
  centered: {
    flex: 1,
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },
  weekBanner: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  weekBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  weekName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  deadlineText: { fontSize: 12, color: "#22c55e", marginTop: 2 },
  deadlineTextPast: { color: "#ef4444" },
  deadlinePill: {
    backgroundColor: "#1e2a3b",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deadlinePillText: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },
  noWeekBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c2538",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  noWeekText: { fontSize: 13, color: "#94a3b8" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    marginBottom: 12,
  },
  parlayCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141926",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  parlayCardLeft: { width: 32, alignItems: "center" },
  parlayCardContent: { flex: 1 },
  parlayLeagueName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 2 },
  parlayStatusLabel: { fontSize: 13, color: "#94a3b8" },
  parlaySubLabel: { fontSize: 12, color: "#475569", marginTop: 1 },
  pressed: { opacity: 0.75 },
  webNudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    padding: 14,
    backgroundColor: "#1c2538",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
  },
  webNudgeText: { fontSize: 13, color: "#475569", flex: 1 },
  webNudgeLink: { color: "#2563eb", fontWeight: "600" },
});
