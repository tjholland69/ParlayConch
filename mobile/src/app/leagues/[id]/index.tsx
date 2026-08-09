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
  Modal,
  TextInput,
  Share,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import { apiRequest, API_BASE_URL } from "@/lib/api";
import {
  useLeagueStats,
  useLeagueMembersWithUsers,
  useWeekLockStatus,
  useLockWeekParlay,
  useUnlockWeekParlay,
  useInviteByEmail,
} from "@/hooks/use-leagues";
import {
  useLeagueParlays,
  useApproveParlay,
  useRejectParlay,
  useMyParlay,
} from "@/hooks/use-parlays";
import { useMarkParlaySent } from "@/hooks/use-parlay-transitions";
import { useActiveWeek } from "@/hooks/use-weeks";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/Avatar";
import { format } from "date-fns";
import { SPORTSBOOK_PROVIDERS, pickDeepLinkGame, type SportsbookProvider } from "@shared/sportsbook-providers";
import type { ParlayWithLegs } from "@shared/schema";
import { resolveResultDetail } from "@shared/legJustification";
import { webLeagueSettingsUrl } from "@/lib/pickHelpers";

type ParlayLegWithGame = ParlayWithLegs["legs"][number];

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
  parlay: ParlayWithLegs;
  isAdmin: boolean;
  leagueId: number;
  weekId: number;
  preferredSportsbook: SportsbookProvider | undefined;
}) {
  const router = useRouter();
  const approveParlay = useApproveParlay(leagueId, weekId);
  const rejectParlay = useRejectParlay(leagueId, weekId);
  const markParlaySent = useMarkParlaySent(leagueId, weekId);
  const [expandedLegIndex, setExpandedLegIndex] = useState<number | null>(null);

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
          {parlay.legs.map((leg: ParlayLegWithGame, i: number) => {
            const isWin = leg.result === "win";
            const isLoss = leg.result === "loss";
            const dotColor = isWin ? "#22c55e" : isLoss ? "#ef4444" : "#374151";
            const label =
              leg.betType === "player_prop"
                ? `${leg.playerName ?? "Player"} — ${leg.propType ?? "prop"}`
                : `${leg.game?.homeTeam ?? "?"} vs ${leg.game?.awayTeam ?? "?"} — ${leg.pick}`;
            const expanded = expandedLegIndex === i;

            return (
              <View key={i}>
                <Pressable
                  onPress={() => leg.result && setExpandedLegIndex(expanded ? null : i)}
                  style={({ pressed }) => [styles.legRow, pressed && styles.pressed]}
                >
                  <View style={[styles.legDot, { backgroundColor: dotColor }]} />
                  <Text style={styles.legText} numberOfLines={1}>{label}</Text>
                  {leg.line != null && (
                    <Text style={styles.legLine}>{parseFloat(leg.line) > 0 ? `+${leg.line}` : leg.line}</Text>
                  )}
                </Pressable>
                {expanded && leg.result && (
                  <Animated.View
                    entering={FadeIn.duration(150)}
                    exiting={FadeOut.duration(100)}
                    style={styles.legDetailRow}
                  >
                    <Text style={styles.legDetailText}>{resolveResultDetail(leg, leg.game)}</Text>
                  </Animated.View>
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

function StatCard({ stat }: { stat: {
  userId: string;
  username: string;
  profileImageUrl?: string | null;
  wins: number;
  losses: number;
  winRate: number;
  powerScore?: number;
  bar?: number;
} }) {
  const name = stat.username || "Unknown";
  // API winRate is already 0–100
  const winRate = stat.winRate != null ? `${Math.round(stat.winRate)}%` : "—";
  const power = (stat.powerScore ?? 0).toFixed(2);
  const barVal = stat.bar ?? 0;
  const barText = `${barVal > 0 ? "+" : ""}${barVal.toFixed(2)}`;
  const barColor = barVal > 0 ? "#22c55e" : barVal < 0 ? "#ef4444" : "#f1f5f9";

  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <Avatar src={stat.profileImageUrl} name={name} size={36} />
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
          <Text style={styles.statLabel}>Win%</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{power}</Text>
          <Text style={styles.statLabel}>Power</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: barColor }]}>{barText}</Text>
          <Text style={styles.statLabel}>BAR</Text>
        </View>
      </View>
    </View>
  );
}

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("parlays");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const activeWeek = useActiveWeek();
  const { user } = useAuth();

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["/api/leagues", leagueId],
    queryFn: () =>
      apiRequest<{
        name?: string;
        isDemo?: boolean;
        inviteCode?: string;
        memberCount?: number;
      }>("GET", `/api/leagues/${leagueId}`),
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
  const { data: lockStatus, refetch: refetchLock } = useWeekLockStatus(leagueId, weekId);
  const { data: myParlay } = useMyParlay(leagueId, weekId);
  const lockWeek = useLockWeekParlay(leagueId, weekId);
  const unlockWeek = useUnlockWeekParlay(leagueId, weekId);
  const inviteByEmail = useInviteByEmail(leagueId);

  const leagueName = league?.name ?? "League";
  const isLocked = !!lockStatus?.isLocked;
  const canBuild = !!activeWeek && !isLocked;

  function openManageOnWeb() {
    WebBrowser.openBrowserAsync(webLeagueSettingsUrl(leagueId, API_BASE_URL));
  }

  function handleLockPress() {
    if (!lockStatus) return;
    if (lockStatus.allSubmitted) {
      lockWeek.mutate(false, {
        onError: (err: Error) => Alert.alert("Couldn't lock", err.message),
      });
      return;
    }
    Alert.alert(
      "Lock this week?",
      `${lockStatus.submittedCount} of ${lockStatus.totalMembers} members have submitted. Members without a pick will be marked void.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Lock week",
          style: "destructive",
          onPress: () =>
            lockWeek.mutate(true, {
              onError: (err: Error) => Alert.alert("Couldn't lock", err.message),
            }),
        },
      ],
    );
  }

  function handleUnlockPress() {
    Alert.alert("Unlock this week?", "Members will be able to submit or edit picks again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlock",
        onPress: () =>
          unlockWeek.mutate(undefined, {
            onError: (err: Error) => Alert.alert("Couldn't unlock", err.message),
          }),
      },
    ]);
  }

  async function shareInviteCode() {
    const code = league?.inviteCode;
    if (!code) return;
    await Share.share({ message: `Join my Parlay.Conch league with code: ${code}` });
  }

  function submitInvites() {
    const emails = inviteEmails
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) {
      Alert.alert("Add emails", "Enter at least one email address.");
      return;
    }
    if (emails.length > 5) {
      Alert.alert("Too many", "Invite up to 5 emails at a time.");
      return;
    }
    inviteByEmail.mutate(emails, {
      onSuccess: (data) => {
        const added = data.results.filter((r) => r.status === "added").length;
        const invited = data.results.filter((r) => r.status === "invited").length;
        const already = data.results.filter((r) => r.status === "already_member").length;
        Alert.alert(
          "Invites sent",
          [
            added ? `${added} added` : null,
            invited ? `${invited} emailed` : null,
            already ? `${already} already members` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Done",
        );
        setInviteEmails("");
        setInviteOpen(false);
      },
      onError: (err: Error) => Alert.alert("Invite failed", err.message),
    });
  }

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
          headerRight: () => (
            <Pressable
              onPress={() =>
                Alert.alert(leagueName, undefined, [
                  ...(isAdmin
                    ? [{ text: "Invite members", onPress: () => setInviteOpen(true) }]
                    : []),
                  { text: "Manage on web", onPress: openManageOnWeb },
                  { text: "Cancel", style: "cancel" as const },
                ])
              }
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#f1f5f9" />
            </Pressable>
          ),
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
            {isLocked ? (
              <View style={styles.lockPill}>
                <Ionicons name="lock-closed" size={12} color="#ef4444" />
                <Text style={styles.lockPillText}>Locked</Text>
              </View>
            ) : (
              <View style={styles.openPill}>
                <Ionicons name="lock-open-outline" size={12} color="#22c55e" />
                <Text style={styles.openPillText}>Open</Text>
              </View>
            )}
            {league?.isDemo && (
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

        {isAdmin && activeWeek && (
          <View style={styles.adminBar}>
            <Text style={styles.adminBarText}>
              {lockStatus?.submittedCount ?? 0} / {lockStatus?.totalMembers ?? members?.length ?? "—"} submitted
            </Text>
            {isLocked ? (
              <Pressable
                onPress={handleUnlockPress}
                disabled={unlockWeek.isPending}
                style={({ pressed }) => [styles.adminActionBtn, pressed && { opacity: 0.7 }]}
              >
                {unlockWeek.isPending ? (
                  <ActivityIndicator size="small" color="#f1f5f9" />
                ) : (
                  <>
                    <Ionicons name="lock-open-outline" size={14} color="#f1f5f9" />
                    <Text style={styles.adminActionText}>Unlock</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={handleLockPress}
                disabled={lockWeek.isPending}
                style={({ pressed }) => [
                  styles.adminActionBtn,
                  lockStatus?.allSubmitted ? styles.adminActionReady : styles.adminActionMuted,
                  pressed && { opacity: 0.7 },
                ]}
              >
                {lockWeek.isPending ? (
                  <ActivityIndicator size="small" color="#f1f5f9" />
                ) : (
                  <>
                    <Ionicons name="lock-closed-outline" size={14} color="#f1f5f9" />
                    <Text style={styles.adminActionText}>Lock week</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}

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
              onRefresh={() => {
                if (activeTab === "parlays") {
                  refetchParlays();
                  refetchLock();
                } else if (activeTab === "members") {
                  refetchMembers();
                } else {
                  refetchStats();
                }
              }}
              tintColor="#2563eb"
            />
          }
        >
          {/* PARLAYS */}
          {activeTab === "parlays" && (
            <>
              {canBuild && (
                <Pressable
                  style={({ pressed }) => [styles.submitBanner, pressed && styles.submitBannerPressed]}
                  onPress={() =>
                    router.push({
                      pathname: "/leagues/[id]/build",
                      params: { id: String(leagueId) },
                    })
                  }
                >
                  <Ionicons name="create-outline" size={16} color="#2563eb" />
                  <Text style={styles.submitBannerText}>
                    {myParlay ? "Edit your pick" : "Build your pick"}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                </Pressable>
              )}
              {isLocked && !myParlay && (
                <View style={styles.missedBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
                  <Text style={styles.missedBannerText}>
                    This week is locked and you didn't submit a pick.
                  </Text>
                </View>
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
                    {canBuild
                      ? "Be the first to submit a pick this week."
                      : "No picks have been submitted for this week."}
                  </Text>
                </View>
              ) : (
                parlays.map((parlay: ParlayWithLegs) => (
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
              {isAdmin && (
                <Pressable
                  style={({ pressed }) => [styles.submitBanner, pressed && styles.submitBannerPressed]}
                  onPress={() => setInviteOpen(true)}
                >
                  <Ionicons name="person-add-outline" size={16} color="#2563eb" />
                  <Text style={styles.submitBannerText}>Invite members</Text>
                  <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.webLinkRow, pressed && { opacity: 0.7 }]}
                onPress={openManageOnWeb}
              >
                <Ionicons name="globe-outline" size={14} color="#64748b" />
                <Text style={styles.webLinkText}>Manage roles & rules on the web</Text>
              </Pressable>
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

      <Modal
        visible={inviteOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setInviteOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setInviteOpen(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Invite members</Text>
            <Text style={styles.modalSubtitle}>
              Email up to 5 people, or share the invite code.
            </Text>

            {league?.inviteCode ? (
              <Pressable
                style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.8 }]}
                onPress={shareInviteCode}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.codeLabel}>Invite code</Text>
                  <Text style={styles.codeValue}>{league.inviteCode}</Text>
                </View>
                <Ionicons name="share-outline" size={20} color="#2563eb" />
              </Pressable>
            ) : null}

            <TextInput
              style={styles.emailInput}
              value={inviteEmails}
              onChangeText={setInviteEmails}
              placeholder="email@example.com, friend@…"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setInviteOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalConfirm,
                  pressed && { opacity: 0.85 },
                  inviteByEmail.isPending && { opacity: 0.5 },
                ]}
                onPress={submitInvites}
                disabled={inviteByEmail.isPending}
              >
                {inviteByEmail.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Send invites</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0a1c14",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openPillText: { fontSize: 11, color: "#22c55e", fontWeight: "600" },
  demoPill: {
    backgroundColor: "#2d2000",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  demoPillText: { fontSize: 10, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.5 },
  deadlineText: { fontSize: 11, color: "#475569" },
  adminBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1c2538",
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
    gap: 12,
  },
  adminBarText: { fontSize: 13, color: "#94a3b8", fontWeight: "500", flex: 1 },
  adminActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  adminActionReady: { backgroundColor: "#16a34a" },
  adminActionMuted: { backgroundColor: "#334155" },
  adminActionText: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
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
  missedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c1a0a",
    borderWidth: 1,
    borderColor: "#3d2e00",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  missedBannerText: { flex: 1, fontSize: 13, color: "#fbbf24", fontWeight: "500" },
  webLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingVertical: 4,
  },
  webLinkText: { fontSize: 13, color: "#64748b", fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  modalSubtitle: { fontSize: 13, color: "#94a3b8", marginBottom: 4 },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141926",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 14,
    gap: 12,
  },
  codeLabel: { fontSize: 11, color: "#64748b", fontWeight: "600", marginBottom: 2 },
  codeValue: { fontSize: 18, fontWeight: "800", color: "#f1f5f9", letterSpacing: 1 },
  emailInput: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    backgroundColor: "#141926",
    color: "#f1f5f9",
    padding: 14,
    fontSize: 15,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#94a3b8" },
  modalConfirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
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
  pressed: { opacity: 0.6 },
  legDetailRow: {
    paddingLeft: 15,
    paddingRight: 4,
    paddingBottom: 4,
  },
  legDetailText: { fontSize: 11, color: "#64748b", fontStyle: "italic" },
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
  statValue: { fontSize: 15, fontWeight: "800", color: "#f1f5f9" },
  statValuePrimary: { color: "#2563eb" },
  statLabel: { fontSize: 10, color: "#475569", marginTop: 2, fontWeight: "500" },
  statDivider: { width: 1, height: 28, backgroundColor: "#2a3447" },
});
