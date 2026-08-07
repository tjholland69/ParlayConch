import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  useLeagueStats,
  useLeagueMembersWithUsers,
  useWeekLockStatus,
} from "@/hooks/use-leagues";
import { useLeagueParlays, useApproveParlay, useRejectParlay } from "@/hooks/use-parlays";
import { useMarkParlaySent } from "@/hooks/use-parlay-transitions";
import { useActiveWeek } from "@/hooks/use-weeks";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/Avatar";
import { format } from "date-fns";
import { SPORTSBOOK_PROVIDERS, pickDeepLinkGame, type SportsbookProvider } from "@shared/sportsbook-providers";

type Tab = "parlays" | "members" | "stats";

const TAB_LABELS: Record<Tab, string> = {
  parlays: "Parlays",
  members: "Members",
  stats: "Stats",
};

const TAB_ICONS: Record<Tab, React.ComponentProps<typeof Ionicons>["name"]> = {
  parlays: "documents-outline",
  members: "people-outline",
  stats: "bar-chart-outline",
};

function ParlayCard({
  parlay,
  isAdmin,
  leagueId,
  weekId,
  preferredSportsbook,
}: {
  parlay: any;
  isAdmin: boolean;
  leagueId: number;
  weekId: number;
  preferredSportsbook: SportsbookProvider | undefined;
}) {
  const router = useRouter();
  const approveParlay = useApproveParlay(leagueId, weekId);
  const rejectParlay = useRejectParlay(leagueId, weekId);
  const markParlaySent = useMarkParlaySent(leagueId, weekId);

  const name =
    parlay.user?.settings?.displayName ??
    parlay.user?.firstName ??
    parlay.user?.email ??
    "Unknown";

  const statusIcon =
    parlay.status === "approved"
      ? ("checkmark-circle" as const)
      : parlay.status === "rejected"
      ? ("close-circle" as const)
      : parlay.status === "sent"
      ? ("paper-plane-outline" as const)
      : parlay.status === "placed"
      ? ("checkmark-done-circle" as const)
      : ("time-outline" as const);

  const statusColor =
    parlay.status === "approved"
      ? "#22c55e"
      : parlay.status === "rejected"
      ? "#ef4444"
      : parlay.status === "sent"
      ? "#f59e0b"
      : parlay.status === "placed"
      ? "#22c55e"
      : "#f59e0b";

  const statusLabel =
    parlay.status === "sent"
      ? "Sent — awaiting confirmation"
      : parlay.status === "placed"
      ? "Placed"
      : parlay.status;

  const canModerate = isAdmin && parlay.status === "pending";
  const canSendToSportsbook = isAdmin && parlay.status === "approved";

  async function handleSendToSportsbook() {
    if (!preferredSportsbook) {
      Alert.alert(
        "Choose a Sportsbook",
        "Set your preferred sportsbook in Settings first, then send this parlay.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Settings", onPress: () => router.push("/(tabs)/settings") },
        ],
      );
      return;
    }

    const provider = SPORTSBOOK_PROVIDERS[preferredSportsbook];
    const game = pickDeepLinkGame(parlay.legs ?? []);
    const deepLinkUrl = game ? provider.buildGameDeepLink(game) : `${provider.appScheme}://`;

    try {
      const canOpen = await Linking.canOpenURL(deepLinkUrl);
      if (canOpen) {
        await Linking.openURL(deepLinkUrl);
        markParlaySent.mutate(parlay.id);
        return;
      }
    } catch {
      // fall through to web fallback below
    }

    // App not installed or the deep link failed — best-effort web rescue.
    // Deliberately does NOT call markParlaySent: opening a plain website is
    // not real evidence the maestro will actually place the bet in-app, and
    // we don't want to trigger the "did you place this bet?" resume prompt
    // for a handoff that probably didn't happen.
    await Linking.openURL(provider.webFallbackUrl);
  }

  return (
    <View style={styles.parlayCard}>
      <View style={styles.parlayCardHeader}>
        <Avatar
          src={parlay.user?.profileImageUrl}
          name={name}
          size={36}
        />
        <View style={styles.parlayCardMeta}>
          <Text style={styles.parlayCardName} numberOfLines={1}>{name}</Text>
          <Text style={styles.parlayCardStatus}>{statusLabel}</Text>
        </View>
        <Ionicons name={statusIcon} size={22} color={statusColor} />
      </View>

      {parlay.legs && parlay.legs.length > 0 && (
        <View style={styles.legsSection}>
          {parlay.legs.map((leg: any, i: number) => {
            const isWin = leg.result === "win";
            const isLoss = leg.result === "loss";
            const dotColor = isWin ? "#22c55e" : isLoss ? "#ef4444" : "#374151";
            const label =
              leg.betType === "player_prop"
                ? `${leg.playerName ?? "Player"} — ${leg.propType ?? "prop"}`
                : `${leg.game?.homeTeam ?? "?"} vs ${leg.game?.awayTeam ?? "?"} — ${leg.pick}`;

            return (
              <View key={i} style={styles.legRow}>
                <View style={[styles.legDot, { backgroundColor: dotColor }]} />
                <Text style={styles.legText} numberOfLines={1}>{label}</Text>
                {leg.line != null && (
                  <Text style={styles.legLine}>{leg.line > 0 ? `+${leg.line}` : leg.line}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {canModerate && (
        <View style={styles.moderationRow}>
          <Pressable
            style={({ pressed }) => [styles.rejectButton, pressed && styles.moderationButtonPressed]}
            onPress={() => rejectParlay.mutate(parlay.id)}
            disabled={approveParlay.isPending || rejectParlay.isPending}
          >
            <Ionicons name="close" size={16} color="#ef4444" />
            <Text style={styles.rejectButtonText}>Reject</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.approveButton, pressed && styles.moderationButtonPressed]}
            onPress={() => approveParlay.mutate(parlay.id)}
            disabled={approveParlay.isPending || rejectParlay.isPending}
          >
            <Ionicons name="checkmark" size={16} color="#f1f5f9" />
            <Text style={styles.approveButtonText}>Approve</Text>
          </Pressable>
        </View>
      )}

      {canSendToSportsbook && (
        <View style={styles.moderationRow}>
          <Pressable
            style={({ pressed }) => [styles.sendButton, pressed && styles.moderationButtonPressed]}
            onPress={handleSendToSportsbook}
            disabled={markParlaySent.isPending}
          >
            {markParlaySent.isPending ? (
              <ActivityIndicator size="small" color="#f1f5f9" />
            ) : (
              <Ionicons name="send-outline" size={16} color="#f1f5f9" />
            )}
            <Text style={styles.sendButtonText}>Send to Sportsbook</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MemberCard({ member }: { member: any }) {
  const name = member.user?.settings?.displayName
    ? member.user.settings.displayName
    : member.user?.firstName
    ? `${member.user.firstName}${member.user.lastName ? " " + member.user.lastName : ""}`
    : member.user?.email ?? "Unknown";

  const roleColor =
    member.role === "admin"
      ? "#2563eb"
      : member.role === "lieutenant"
      ? "#0ea5e9"
      : "#475569";

  const roleLabel =
    member.role === "admin"
      ? "Parlay Maestro"
      : member.role === "lieutenant"
      ? "Parlay Lieutenant"
      : "Member";

  return (
    <View style={styles.memberCard}>
      <Avatar src={member.user?.profileImageUrl} name={name} size={40} />
      <View style={styles.memberMeta}>
        <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
        <Text style={[styles.memberRole, { color: roleColor }]}>{roleLabel}</Text>
      </View>
    </View>
  );
}

function StatCard({ stat }: { stat: any }) {
  const name =
    stat.user?.settings?.displayName ??
    stat.user?.firstName ??
    stat.user?.email ??
    "Unknown";

  const winRate =
    stat.winRate != null ? `${Math.round(stat.winRate * 100)}%` : "—";

  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <Avatar src={stat.user?.profileImageUrl} name={name} size={36} />
        <Text style={styles.statName} numberOfLines={1}>{name}</Text>
      </View>
      <View style={styles.statRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stat.wins ?? 0}</Text>
          <Text style={styles.statLabel}>Wins</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stat.losses ?? 0}</Text>
          <Text style={styles.statLabel}>Losses</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.statValuePrimary]}>{winRate}</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stat.parlays ?? 0}</Text>
          <Text style={styles.statLabel}>Parlays</Text>
        </View>
      </View>
    </View>
  );
}

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const [activeTab, setActiveTab] = useState<Tab>("parlays");
  const activeWeek = useActiveWeek();
  const { user } = useAuth();

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["/api/leagues", leagueId],
    queryFn: () => apiRequest("GET", `/api/leagues/${leagueId}`),
    enabled: !!leagueId,
  });

  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = useLeagueMembersWithUsers(leagueId);
  const isAdmin = !!members?.some((m: any) => m.userId === user?.id && m.role === "admin");
  const preferredSportsbook = (user?.settings as any)?.preferredSportsbook as SportsbookProvider | undefined;
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useLeagueStats(leagueId);

  const weekId = activeWeek?.id ?? 0;
  const {
    data: parlays,
    isLoading: parlaysLoading,
    refetch: refetchParlays,
  } = useLeagueParlays(leagueId, weekId);
  const { data: lockStatus } = useWeekLockStatus(leagueId, weekId);

  const leagueName = (league as any)?.name ?? "League";

  if (leagueLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: leagueName,
          headerStyle: { backgroundColor: "#1c2538" },
          headerTintColor: "#f1f5f9",
          headerTitleStyle: { fontWeight: "700", fontSize: 17 },
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        {/* League meta bar */}
        <View style={styles.metaBar}>
          <View style={styles.metaBarLeft}>
            {activeWeek && (
              <View style={styles.weekPill}>
                <Ionicons name="calendar-outline" size={12} color="#94a3b8" />
                <Text style={styles.weekPillText}>{activeWeek.label}</Text>
              </View>
            )}
            {lockStatus?.isLocked && (
              <View style={styles.lockPill}>
                <Ionicons name="lock-closed" size={12} color="#ef4444" />
                <Text style={styles.lockPillText}>Locked</Text>
              </View>
            )}
            {(league as any)?.isDemo && (
              <View style={styles.demoPill}>
                <Text style={styles.demoPillText}>DEMO</Text>
              </View>
            )}
          </View>
          {(activeWeek as any)?.deadline && (
            <Text style={styles.deadlineText}>
              {format(new Date((activeWeek as any).deadline), "MMM d, h:mm a")}
            </Text>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(["parlays", "members", "stats"] as Tab[]).map((tab) => {
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, active && styles.tabActive]}
                testID={`tab-${tab}`}
              >
                <Ionicons
                  name={TAB_ICONS[tab]}
                  size={15}
                  color={active ? "#2563eb" : "#475569"}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={
                activeTab === "parlays" ? parlaysLoading :
                activeTab === "members" ? membersLoading :
                statsLoading
              }
              onRefresh={
                activeTab === "parlays" ? refetchParlays :
                activeTab === "members" ? refetchMembers :
                refetchStats
              }
              tintColor="#2563eb"
            />
          }
        >
          {/* PARLAYS */}
          {activeTab === "parlays" && (
            <>
              {activeWeek && !lockStatus?.isLocked && (
                <Pressable
                  style={({ pressed }) => [styles.submitBanner, pressed && styles.submitBannerPressed]}
                  onPress={() => Linking.openURL("https://parlayconch.com")}
                >
                  <Ionicons name="create-outline" size={16} color="#2563eb" />
                  <Text style={styles.submitBannerText}>Submit or edit your pick at parlayconch.com</Text>
                  <Ionicons name="open-outline" size={14} color="#2563eb" />
                </Pressable>
              )}
              {parlaysLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : !parlays || parlays.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="documents-outline" size={28} color="#2563eb" />
                  </View>
                  <Text style={styles.emptyTitle}>No parlays yet</Text>
                  <Text style={styles.emptySubtitle}>
                    No picks have been submitted for this week.
                  </Text>
                </View>
              ) : (
                parlays.map((parlay: any) => (
                  <ParlayCard
                    key={parlay.id}
                    parlay={parlay}
                    isAdmin={isAdmin}
                    leagueId={leagueId}
                    weekId={weekId}
                    preferredSportsbook={preferredSportsbook}
                  />
                ))
              )}
            </>
          )}

          {/* MEMBERS */}
          {activeTab === "members" && (
            <>
              {membersLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : !members || members.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySubtitle}>No members found</Text>
                </View>
              ) : (
                members.map((member: any) => (
                  <MemberCard key={member.userId} member={member} />
                ))
              )}
            </>
          )}

          {/* STATS */}
          {activeTab === "stats" && (
            <>
              {statsLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : !stats || stats.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="bar-chart-outline" size={28} color="#2563eb" />
                  </View>
                  <Text style={styles.emptyTitle}>No stats yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Stats appear once parlays are graded.
                  </Text>
                </View>
              ) : (
                stats.map((stat: any) => (
                  <StatCard key={stat.userId} stat={stat} />
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  centered: {
    flex: 1,
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
    backgroundColor: "#1c2538",
    gap: 8,
  },
  metaBarLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  weekPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1e2a3b",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  weekPillText: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2c0e0e",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockPillText: { fontSize: 11, color: "#ef4444", fontWeight: "600" },
  demoPill: {
    backgroundColor: "#2d2000",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  demoPillText: { fontSize: 10, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.5 },
  deadlineText: { fontSize: 11, color: "#475569" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#1c2538",
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
  },
  tabLabel: { fontSize: 13, fontWeight: "600", color: "#475569" },
  tabLabelActive: { color: "#2563eb" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  tabLoader: { marginTop: 48 },
  submitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e2a3b",
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  submitBannerPressed: { opacity: 0.7 },
  submitBannerText: { flex: 1, fontSize: 13, color: "#93c5fd", fontWeight: "500" },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: { fontSize: 13, color: "#94a3b8", textAlign: "center" },

  /* Parlay card */
  parlayCard: {
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    marginBottom: 10,
    overflow: "hidden",
  },
  parlayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  parlayCardMeta: { flex: 1 },
  parlayCardName: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  parlayCardStatus: { fontSize: 12, color: "#94a3b8", marginTop: 1, textTransform: "capitalize" },
  legsSection: {
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  legRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legDot: { width: 7, height: 7, borderRadius: 4 },
  legText: { flex: 1, fontSize: 12, color: "#94a3b8" },
  legLine: { fontSize: 12, color: "#475569", fontWeight: "600" },
  moderationRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    padding: 10,
    gap: 8,
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  rejectButtonText: { fontSize: 13, fontWeight: "700", color: "#ef4444" },
  approveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#22c55e",
  },
  approveButtonText: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
  sendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  sendButtonText: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
  moderationButtonPressed: { opacity: 0.7 },

  /* Member card */
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 14,
    marginBottom: 8,
  },
  memberMeta: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  memberRole: { fontSize: 12, fontWeight: "600", marginTop: 2 },

  /* Stat card */
  statCard: {
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 14,
    marginBottom: 10,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  statName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", flex: 1 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 20, fontWeight: "800", color: "#f1f5f9" },
  statValuePrimary: { color: "#2563eb" },
  statLabel: { fontSize: 11, color: "#475569", marginTop: 2, fontWeight: "500" },
  statDivider: { width: 1, height: 32, backgroundColor: "#2a3447" },
});
