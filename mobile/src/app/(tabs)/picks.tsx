import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useLeagues, useWeekLockStatus } from "@/hooks/use-leagues";
import { useActiveWeek } from "@/hooks/use-weeks";
import { useMyParlay } from "@/hooks/use-parlays";
import { format, formatDistanceToNow, isPast } from "date-fns";

function ParlayStatusRow({
  leagueId,
  weekId,
  leagueName,
}: {
  leagueId: number;
  weekId: number;
  leagueName: string;
}) {
  const router = useRouter();
  const { data: parlay, isLoading } = useMyParlay(leagueId, weekId);
  const { data: lockStatus } = useWeekLockStatus(leagueId, weekId);
  const isLocked = !!lockStatus?.isLocked;

  const statusConfig = (() => {
    if (!parlay && isLocked) {
      return {
        icon: "lock-closed" as const,
        iconColor: "#ef4444",
        label: "Missed — week locked",
        sublabel: "Tap to view league",
        bg: "#1c0a0a",
        border: "#3d1a1a",
        action: "view" as const,
      };
    }
    if (!parlay) {
      return {
        icon: "alert-circle-outline" as const,
        iconColor: "#f59e0b",
        label: "Not submitted",
        sublabel: "Tap to build your pick",
        bg: "#1c1a0a",
        border: "#3d2e00",
        action: "build" as const,
      };
    }
    if (parlay.status === "approved") {
      return {
        icon: "checkmark-circle" as const,
        iconColor: "#22c55e",
        label: "Approved",
        sublabel: `${parlay.legs?.length ?? 0} legs`,
        bg: "#0a1c14",
        border: "#1a3d28",
        action: "view" as const,
      };
    }
    if (parlay.status === "rejected") {
      return {
        icon: "close-circle" as const,
        iconColor: "#ef4444",
        label: "Rejected",
        sublabel: isLocked ? "Week locked" : "Tap to edit and resubmit",
        bg: "#1c0a0a",
        border: "#3d1a1a",
        action: isLocked ? ("view" as const) : ("build" as const),
      };
    }
    return {
      icon: "time-outline" as const,
      iconColor: "#94a3b8",
      label: "Pending review",
      sublabel: isLocked
        ? `${parlay.legs?.length ?? 0} legs`
        : `${parlay.legs?.length ?? 0} legs · tap to edit`,
      bg: "#141926",
      border: "#2a3447",
      action: isLocked ? ("view" as const) : ("build" as const),
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
      onPress={() => {
        if (statusConfig.action === "build") {
          router.push({
            pathname: "/leagues/[id]/build",
            params: { id: String(leagueId) },
          });
        } else {
          router.push({
            pathname: "/leagues/[id]",
            params: { id: String(leagueId) },
          });
        }
      }}
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
        <Text style={styles.parlayLeagueName} numberOfLines={1}>
          {leagueName}
        </Text>
        <Text style={styles.parlayStatusLabel}>{statusConfig.label}</Text>
        {statusConfig.sublabel ? (
          <Text style={styles.parlaySubLabel}>{statusConfig.sublabel}</Text>
        ) : null}
      </View>
      <Ionicons
        name={statusConfig.action === "build" ? "create-outline" : "chevron-forward"}
        size={16}
        color="#475569"
      />
    </Pressable>
  );
}

export default function PicksScreen() {
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const activeWeek = useActiveWeek();

  const deadline = (activeWeek as any)?.deadline
    ? new Date((activeWeek as any).deadline)
    : null;
  const deadlinePast = deadline ? isPast(deadline) : false;

  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline || deadlinePast) return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [deadline, deadlinePast]);

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
      {activeWeek ? (
        <View style={styles.weekBanner}>
          <View style={styles.weekBannerLeft}>
            <Ionicons name="calendar" size={18} color="#2563eb" />
            <View>
              <Text style={styles.weekName}>{activeWeek.label}</Text>
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

      {activeWeek && (
        <>
          <Text style={styles.sectionLabel}>THIS WEEK'S STATUS</Text>
          {leagues.map((league) => (
            <ParlayStatusRow
              key={league.id}
              leagueId={league.id}
              weekId={activeWeek.id}
              leagueName={league.name}
            />
          ))}
        </>
      )}
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
});
