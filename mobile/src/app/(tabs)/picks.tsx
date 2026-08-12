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
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useLeagues, useWeekLockStatus } from "@/hooks/use-leagues";
import { useActiveWeek } from "@/hooks/use-weeks";
import { useMyParlay, useMyParlayHistory } from "@/hooks/use-parlays";
import { format, formatDistanceToNow, isPast } from "date-fns";
import type { ParlayWithLegs } from "@shared/schema";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// A parlay counts as "Open" as long as it hasn't reached one of these final
// outcomes — pending/approved/rejected/sent/placed still count as open.
const PAST_STATUSES = new Set(["win", "loss", "push", "void"]);

function ParlayTile({
  icon,
  iconColor,
  leagueName,
  statusLabel,
  metaLabel,
  bg,
  border,
  onPress,
  actionIcon,
  glow,
}: {
  icon: IconName;
  iconColor: string;
  leagueName: string;
  statusLabel: string;
  metaLabel?: string;
  bg: string;
  border: string;
  onPress?: () => void;
  actionIcon?: IconName;
  /** Won parlays pulse with a soft green glow — the mobile take on the web
   * app's animated "perfect week" glow (see client/src/lib/parlayVisuals.ts). */
  glow?: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!glow) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [glow, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow ? 0.35 + pulse.value * 0.4 : 0.25,
    shadowRadius: glow ? 8 + pulse.value * 6 : 8,
  }));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Animated.View style={[styles.shadowWrap, glow && styles.shadowWrapGlow, glowStyle]}>
        <View style={[styles.parlayCard, { backgroundColor: bg, borderColor: border }]}>
          {/* Left accent bar */}
          <View style={[styles.accentBar, { backgroundColor: iconColor }]} />

          <View style={styles.body}>
            <View style={styles.topRow}>
              <View style={styles.titleBlock}>
                <Ionicons name={icon} size={16} color={iconColor} />
                <Text style={styles.parlayLeagueName} numberOfLines={1}>
                  {leagueName}
                </Text>
              </View>
              <Ionicons name={actionIcon ?? "chevron-forward"} size={16} color="#374151" />
            </View>

            <Text style={styles.parlayStatusLabel}>{statusLabel}</Text>

            {metaLabel ? (
              <View style={styles.metaRow}>
                <Text style={styles.parlaySubLabel} numberOfLines={1}>
                  {metaLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** For a league with no parlay yet in the active week — "build a pick" prompt. */
function NeedsPickTile({ leagueId, weekId, leagueName }: { leagueId: number; weekId: number; leagueName: string }) {
  const router = useRouter();
  const { data: parlay, isLoading } = useMyParlay(leagueId, weekId);
  const { data: lockStatus } = useWeekLockStatus(leagueId, weekId);
  const isLocked = !!lockStatus?.isLocked;

  if (isLoading) {
    return (
      <View style={styles.shadowWrap}>
        <View style={[styles.parlayCard, styles.parlayCardLoading]}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      </View>
    );
  }
  if (parlay) return null; // a parlay showed up (e.g. just submitted) — history list will cover it

  if (isLocked) {
    return (
      <ParlayTile
        icon="lock-closed"
        iconColor="#ef4444"
        leagueName={leagueName}
        statusLabel="Missed — week locked"
        metaLabel="Tap to view league"
        bg="#1c0a0a"
        border="#3d1a1a"
        onPress={() => router.push({ pathname: "/leagues/[id]", params: { id: String(leagueId) } })}
      />
    );
  }

  return (
    <ParlayTile
      icon="alert-circle-outline"
      iconColor="#f59e0b"
      leagueName={leagueName}
      statusLabel="Not submitted"
      metaLabel="Tap to build your pick"
      bg="#1c1a0a"
      border="#3d2e00"
      actionIcon="create-outline"
      onPress={() => router.push({ pathname: "/leagues/[id]/build", params: { id: String(leagueId) } })}
    />
  );
}

const STATUS_META: Record<string, { icon: IconName; iconColor: string; label: string; bg: string; border: string }> = {
  win: { icon: "trophy", iconColor: "#22c55e", label: "Won", bg: "#0a1c14", border: "#22c55e" },
  loss: { icon: "close-circle", iconColor: "#ef4444", label: "Lost", bg: "#1c0a0a", border: "#3d1a1a" },
  void: { icon: "ban-outline", iconColor: "#475569", label: "Void", bg: "#141926", border: "#2a3447" },
  push: { icon: "swap-horizontal-outline", iconColor: "#94a3b8", label: "Push", bg: "#141926", border: "#2a3447" },
  approved: { icon: "checkmark-circle", iconColor: "#2563eb", label: "Approved", bg: "#0a1526", border: "#1a2e4d" },
  rejected: { icon: "close-circle-outline", iconColor: "#f59e0b", label: "Rejected", bg: "#1c1a0a", border: "#3d2e00" },
  sent: { icon: "paper-plane-outline", iconColor: "#0ea5e9", label: "Sent", bg: "#0a1620", border: "#1a3040" },
  placed: { icon: "paper-plane-outline", iconColor: "#0ea5e9", label: "Placed", bg: "#0a1620", border: "#1a3040" },
  pending: { icon: "time-outline", iconColor: "#94a3b8", label: "Pending review", bg: "#141926", border: "#2a3447" },
};

function HistoryTile({ parlay, leagueName }: { parlay: ParlayWithLegs; leagueName: string }) {
  const router = useRouter();
  const meta = STATUS_META[parlay.status ?? "pending"] ?? STATUS_META.pending;
  const legCount = parlay.legs?.length ?? 0;

  return (
    <ParlayTile
      icon={meta.icon}
      iconColor={meta.iconColor}
      leagueName={leagueName}
      statusLabel={meta.label}
      metaLabel={`${parlay.week?.label ?? "Week"} · ${legCount} ${legCount === 1 ? "leg" : "legs"}`}
      bg={meta.bg}
      border={meta.border}
      glow={parlay.status === "win"}
      onPress={() => router.push({ pathname: "/leagues/[id]", params: { id: String(parlay.leagueId) } })}
    />
  );
}

export default function PicksScreen() {
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const activeWeek = useActiveWeek();
  const { data: parlayHistory } = useMyParlayHistory();

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

  const leagueName = (leagueId: number) => leagues.find((l) => l.id === leagueId)?.name ?? "League";

  const leaguesNeedingPick = activeWeek
    ? leagues.filter((l) => !(parlayHistory ?? []).some((p) => p.leagueId === l.id && p.weekId === activeWeek.id))
    : [];

  const openHistory = (parlayHistory ?? []).filter((p) => !PAST_STATUSES.has(p.status ?? ""));
  const pastHistory = (parlayHistory ?? []).filter((p) => PAST_STATUSES.has(p.status ?? ""));

  const hasOpen = leaguesNeedingPick.length > 0 || openHistory.length > 0;
  const hasPast = pastHistory.length > 0;

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

      {hasOpen && (
        <>
          <Text style={styles.sectionLabel}>OPEN PARLAYS</Text>
          {leaguesNeedingPick.map((league) => (
            <NeedsPickTile
              key={`need-${league.id}`}
              leagueId={league.id}
              weekId={activeWeek!.id}
              leagueName={league.name}
            />
          ))}
          {openHistory.map((parlay) => (
            <HistoryTile key={`open-${parlay.id}`} parlay={parlay} leagueName={leagueName(parlay.leagueId)} />
          ))}
        </>
      )}

      {hasPast && (
        <>
          <Text style={[styles.sectionLabel, hasOpen && styles.sectionLabelSpaced]}>PAST PARLAYS</Text>
          {pastHistory.map((parlay) => (
            <HistoryTile key={`past-${parlay.id}`} parlay={parlay} leagueName={leagueName(parlay.leagueId)} />
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
  sectionLabelSpaced: { marginTop: 8 },
  /* Shadow lives on this outer, non-clipping wrapper — combining shadow*
   * props with overflow:"hidden" on the same view breaks rendering on iOS. */
  shadowWrap: {
    marginBottom: 14,
    borderRadius: 18,
    alignSelf: "stretch",
    minWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  shadowWrapGlow: {
    shadowColor: "#22c55e",
    elevation: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  parlayCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    minWidth: 0,
  },
  parlayCardLoading: { padding: 20, alignItems: "center", justifyContent: "center" },
  accentBar: {
    width: 5,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    flexShrink: 0,
  },
  body: { flex: 1, padding: 16, minWidth: 0 },
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
  parlayLeagueName: { fontSize: 16, fontWeight: "700", color: "#f1f5f9", flex: 1, minWidth: 0 },
  parlayStatusLabel: { fontSize: 13, color: "#94a3b8", marginBottom: 10, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, minWidth: 0 },
  parlaySubLabel: { fontSize: 12, color: "#475569", fontWeight: "600", flexShrink: 1 },
});
