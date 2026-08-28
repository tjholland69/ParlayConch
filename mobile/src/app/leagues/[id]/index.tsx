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
  useLeagueRecords,
  useLeagueMembersWithUsers,
  useWeekLockStatus,
  useLockWeekParlay,
  useUnlockWeekParlay,
  useInviteByEmail,
  type LeagueRecordEntry,
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
import { format } from "date-fns";
import { SPORTSBOOK_PROVIDERS, pickDeepLinkGame, type SportsbookProvider } from "@shared/sportsbook-providers";
import type { ParlayWithLegs } from "@shared/schema";
import { resolveResultDetail } from "@shared/legJustification";
import { getSlate } from "@shared/slate";
import { webLeagueSettingsUrl } from "@/lib/pickHelpers";
import { shadows } from "@/lib/theme";
import { getParlayVisualStyle, getWinPctColor } from "@/lib/parlayVisuals";
import { getBustedLeg } from "@/lib/parlayLoser";
import { getHeroLeg } from "@/lib/parlayHero";
import { ParlayMixBar } from "@/components/ParlayMixBar";
import { DisputeLegBadge } from "@/components/DisputeLegSheet";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

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

const LOSER_LABEL_TEXT: Record<string, string> = {
  parlay_loser: "Parlay Loser",
  asshole: "Asshole",
  jerry: "Jerry",
  dud: "Dud",
  doofus: "Doofus",
};

const HERO_LABEL_TEXT: Record<string, string> = {
  parlay_hero: "Parlay Hero",
  mvp: "MVP",
  legend: "Legend",
  big_time: "Big Time",
};

function ParlayCard({
  parlay,
  isAdmin,
  leagueId,
  weekId,
  preferredSportsbook,
  loserLabel,
  heroLabel,
}: {
  parlay: ParlayWithLegs;
  isAdmin: boolean;
  leagueId: number;
  weekId: number;
  preferredSportsbook: SportsbookProvider | undefined;
  loserLabel?: string | null;
  heroLabel?: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const approveParlay = useApproveParlay(leagueId, weekId);
  const rejectParlay = useRejectParlay(leagueId, weekId);
  const markParlaySent = useMarkParlaySent(leagueId, weekId);
  const [expandedLegIndex, setExpandedLegIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const name =
    parlay.user?.settings?.displayName ??
    parlay.user?.firstName ??
    parlay.user?.email ??
    "Unknown";

  const legs = parlay.legs ?? [];
  const wins = legs.filter((l) => l.result === "win").length;
  const losses = legs.filter((l) => l.result === "loss").length;
  const pushes = legs.filter((l) => l.result === "push").length;
  const resolved = wins + losses + pushes;
  const pending = legs.length - resolved;
  const pct = resolved > 0 ? Math.round((wins / resolved) * 100) : null;
  const visual = getParlayVisualStyle(pct, 1);
  const pctColor = pct !== null ? (([r, g, b]) => `rgb(${r}, ${g}, ${b})`)(getWinPctColor(pct)) : "#64748b";

  const bustedLeg = getBustedLeg(parlay);
  const heroLeg = getHeroLeg(parlay);
  const loserLabelText = LOSER_LABEL_TEXT[loserLabel ?? "parlay_loser"] ?? LOSER_LABEL_TEXT.parlay_loser;
  const heroLabelText = HERO_LABEL_TEXT[heroLabel ?? "parlay_hero"] ?? HERO_LABEL_TEXT.parlay_hero;
  const heroMemberName = heroLeg?.user
    ? heroLeg.user.settings?.displayName ?? heroLeg.user.firstName ?? heroLeg.user.email ?? "Unknown"
    : name;

  const decisiveLeg = bustedLeg ?? heroLeg;
  const decisiveFinishTime = decisiveLeg?.decidedAt ?? decisiveLeg?.game?.finishedAt ?? null;
  const decidedSlate = decisiveFinishTime ? getSlate(new Date(decisiveFinishTime)) : null;

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

    if (preferredSportsbook === "other") {
      Alert.alert(
        "Manual Send Required",
        "We don't have a direct link for a custom sportsbook yet — open your sportsbook app and place this parlay manually, then mark it sent.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark as Sent", onPress: () => markParlaySent.mutate(parlay.id) },
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
    <View style={styles.parlayCardShadowWrap}>
    <View style={[styles.parlayCard, { borderColor: visual.borderColor }]}>
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={({ pressed }) => [styles.parlayCardHeader, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? "Expand parlay" : "Collapse parlay"}
      >
        {/* Progress-bar background — flat fill sized to win%, RN has no cheap gradient without a native module. */}
        {pct !== null && pct > 0 && (
          <View
            pointerEvents="none"
            style={[styles.parlayCardProgressBar, { width: `${pct}%`, backgroundColor: visual.barColor }]}
          />
        )}

        <View style={styles.collapseChevron}>
          <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={16} color="#64748b" />
        </View>

        <View style={styles.parlayCardMeta}>
          <View style={styles.parlayCardNameRow}>
            <Text style={styles.parlayCardName} numberOfLines={1}>{name}</Text>
            {collapsed && (
              <View style={styles.legCountPill}>
                <Text style={styles.legCountPillText}>
                  {legs.length} leg{legs.length !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>

          {(bustedLeg || heroLeg || decidedSlate) && (
            <View style={styles.badgeRow}>
              {bustedLeg && (
                <View style={[styles.resultChip, styles.resultChipDestructive]}>
                  <Text style={[styles.resultChipText, styles.resultChipTextDestructive]} numberOfLines={1}>
                    {loserLabelText}: {name}
                  </Text>
                </View>
              )}
              {heroLeg && (
                <View style={[styles.resultChip, styles.resultChipSuccess]}>
                  <Text style={[styles.resultChipText, styles.resultChipTextSuccess]} numberOfLines={1}>
                    {heroLabelText}: {heroMemberName}
                  </Text>
                </View>
              )}
              {decidedSlate && (
                <View style={styles.resultChip}>
                  <Ionicons name="time-outline" size={10} color="#94a3b8" />
                  <Text style={styles.resultChipText}>{decidedSlate}</Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.parlayCardStatus}>{statusLabel}</Text>
        </View>

        {pct !== null && (
          <Text style={[styles.parlayCardFraction, { color: pctColor }]}>
            {wins}/{resolved}
            {pct !== null ? ` (${pct}%)` : ""}
            {pending > 0 ? ` · ${pending} pending` : ""}
          </Text>
        )}

        <Ionicons name={statusIcon} size={22} color={statusColor} />
      </Pressable>

      {!collapsed && (
        <View style={styles.mixBarWrap}>
          <ParlayMixBar legs={legs} />
        </View>
      )}

      {!collapsed && legs.length > 0 && (
        <View style={styles.legsSection}>
          {legs.map((leg: ParlayLegWithGame, i: number) => {
            const isWin = leg.result === "win";
            const isLoss = leg.result === "loss";
            const resultColor = isWin ? "#22c55e" : isLoss ? "#ef4444" : "#cbd5e1";
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
                  <View style={[styles.legDot, { backgroundColor: resultColor }]} />
                  <Text style={[styles.legText, { color: resultColor }]} numberOfLines={1} ellipsizeMode="tail">
                    {label}
                  </Text>
                  {/* leg.line already carries its own sign (e.g. "+3.5" for
                      underdog spreads, from game.spread) — don't add another. */}
                  {leg.line != null && <Text style={styles.legLine}>{leg.line}</Text>}
                  {leg.userId === user?.id && <DisputeLegBadge legId={leg.id} />}
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
    </View>
  );
}

function memberDisplayName(member: any): string {
  return member.user?.settings?.displayName
    ? member.user.settings.displayName
    : member.user?.firstName
    ? `${member.user.firstName}${member.user.lastName ? " " + member.user.lastName : ""}`
    : member.user?.email ?? "Unknown";
}

const BET_TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Types" },
  { key: "spread", label: "Spread" },
  { key: "moneyline", label: "ML" },
  { key: "over", label: "Over" },
  { key: "under", label: "Under" },
  { key: "player_prop", label: "Prop" },
];

const RESULT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Results" },
  { key: "win", label: "Won" },
  { key: "loss", label: "Lost" },
  { key: "push", label: "Push" },
  { key: "pending", label: "Pending" },
];

function FilterChipRow({
  options,
  selected,
  onSelect,
}: {
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((opt) => {
        const active = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function roleMeta(role: string | undefined) {
  const roleColor = role === "admin" ? "#2563eb" : role === "lieutenant" ? "#0ea5e9" : "#475569";
  const roleLabel = role === "admin" ? "Parlay Maestro" : role === "lieutenant" ? "Parlay Lieutenant" : "Member";
  return { roleColor, roleLabel };
}

type MemberSortKey = "powerScore" | "winRate" | "record";
type SortDir = "asc" | "desc";

const MEMBER_SORT_COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "powerScore", label: "Power" },
  { key: "winRate", label: "Win %" },
  { key: "record", label: "Record" },
];

function MemberRow({
  member,
}: {
  member: {
    userId: string;
    name: string;
    role?: string;
    wins: number;
    losses: number;
    winRate: number;
    powerScore: number;
  };
}) {
  const { roleColor, roleLabel } = roleMeta(member.role);

  return (
    <View style={styles.memberRow}>
      <View style={styles.memberIdentityCol}>
        <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
        <Text style={[styles.memberRole, { color: roleColor }]}>{roleLabel}</Text>
      </View>
      <Text style={styles.memberStatCol} numberOfLines={1}>{member.powerScore.toFixed(2)}</Text>
      <Text style={styles.memberStatCol} numberOfLines={1}>{Math.round(member.winRate)}%</Text>
      <Text style={styles.memberStatCol} numberOfLines={1}>{member.wins}-{member.losses}</Text>
    </View>
  );
}

function MembersTable({
  members,
  stats,
}: {
  members: any[];
  stats: any[] | undefined;
}) {
  const [sortKey, setSortKey] = useState<MemberSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir | null>(null);

  const statsByUserId = new Map((stats ?? []).map((s: any) => [s.userId, s]));

  const rows = members.map((member) => {
    const stat = statsByUserId.get(member.userId);
    return {
      userId: member.userId,
      name: memberDisplayName(member),
      role: member.role,
      wins: stat?.wins ?? 0,
      losses: stat?.losses ?? 0,
      winRate: stat?.winRate ?? 0,
      powerScore: stat?.powerScore ?? 0,
    };
  });

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const aVal = sortKey === "record" ? a.wins - a.losses : a[sortKey];
        const bVal = sortKey === "record" ? b.wins - b.losses : b[sortKey];
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      })
    : rows;

  function handleSortPress(key: MemberSortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  return (
    <View>
      <View style={styles.memberHeaderRow}>
        <View style={styles.memberIdentityCol} />
        {MEMBER_SORT_COLUMNS.map((col) => {
          const active = sortKey === col.key;
          return (
            <Pressable
              key={col.key}
              onPress={() => handleSortPress(col.key)}
              style={({ pressed }) => [styles.memberHeaderCol, pressed && { opacity: 0.7 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${col.label}`}
            >
              <Text style={[styles.memberHeaderText, active && styles.memberHeaderTextActive]} numberOfLines={1}>
                {col.label}
              </Text>
              <Ionicons
                name={active && sortDir === "asc" ? "caret-up" : active && sortDir === "desc" ? "caret-down" : "swap-vertical"}
                size={11}
                color={active ? "#2563eb" : "#475569"}
              />
            </Pressable>
          );
        })}
      </View>
      {sortedRows.map((row) => (
        <MemberRow key={row.userId} member={row} />
      ))}
    </View>
  );
}

/** Ionicons equivalent of the web app's per-record lucide icon (see
 * LEAGUE_RECORD_ICONS in client/src/pages/LeagueDetail.tsx) — keyed by the
 * record's stable `key`, not its (renameable) title/description text. */
const RECORD_ICONS: Record<string, IconName> = {
  highestSingleLegOdds: "flash-outline",
  highestSingleLegOddsWon: "checkmark-done-outline",
  highestParlayOdds: "trending-up-outline",
  mostParlayLosses: "trending-down-outline",
  juiceman: "water-outline",
  longestWinStreak: "flame-outline",
  longestLossStreak: "warning-outline",
  favoriteTeam: "shield-outline",
  favoritePlayer: "person-outline",
  favoriteBetType: "dice-outline",
};

function formatRecordDateRange(range: LeagueRecordEntry["dateRange"]): string | null {
  if (!range?.start || !range?.end) return null;
  const start = format(new Date(range.start), "MMM d");
  const end = format(new Date(range.end), "MMM d");
  return start === end ? start : `${start} – ${end}`;
}

function LeagueRecordTile({ record, members }: { record: LeagueRecordEntry; members: any[] | undefined }) {
  const icon = RECORD_ICONS[record.key] ?? "trophy-outline";
  const holder = record.holderUserId ? members?.find((m) => m.userId === record.holderUserId) : null;
  const holderName = holder ? memberDisplayName(holder) : null;
  const weekLabel = record.week ? `${record.week.label}, ${record.week.season}` : null;
  const dateRangeLabel = formatRecordDateRange(record.dateRange);
  const winLossLabel = record.winLoss
    ? `${record.winLoss.wins}-${record.winLoss.losses} (${((record.winLoss.wins / (record.winLoss.wins + record.winLoss.losses || 1)) * 100).toFixed(1)}%)`
    : null;

  return (
    <View style={styles.recordTile}>
      {record.title ? (
        <>
          <View style={styles.recordTitleRow}>
            <Ionicons name={icon} size={14} color="#2563eb" />
            <Text style={styles.recordTitle} numberOfLines={1}>{record.title}</Text>
          </View>
          {!!record.label && (
            <Text style={styles.recordLabel} numberOfLines={2}>{record.label}</Text>
          )}
        </>
      ) : (
        <View style={styles.recordTitleRow}>
          <Ionicons name={icon} size={13} color="#94a3b8" />
          <Text style={styles.recordLabel} numberOfLines={2}>{record.label}</Text>
        </View>
      )}
      <Text style={styles.recordValue} numberOfLines={1}>
        {record.value}
        {record.detail ? <Text style={styles.recordDetail}> ({record.detail})</Text> : null}
      </Text>
      {winLossLabel && <Text style={styles.recordMeta} numberOfLines={1}>Record: {winLossLabel}</Text>}
      {holderName && <Text style={styles.recordMeta} numberOfLines={1}>{holderName}</Text>}
      {weekLabel && <Text style={styles.recordMeta} numberOfLines={1}>{weekLabel}</Text>}
      {dateRangeLabel && <Text style={styles.recordMeta} numberOfLines={1}>{dateRangeLabel}</Text>}
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
  const [memberFilter, setMemberFilter] = useState("all");
  const [betTypeFilter, setBetTypeFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
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
        loserLabel?: string | null;
        heroLabel?: string | null;
      }>("GET", `/api/leagues/${leagueId}`),
    enabled: !!leagueId,
  });

  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = useLeagueMembersWithUsers(leagueId);
  const isAdmin = !!members?.some((m: any) => m.userId === user?.id && m.role === "admin");
  const preferredSportsbook = (user?.settings as any)?.preferredSportsbook as SportsbookProvider | undefined;
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useLeagueStats(leagueId);
  const { data: leagueRecords, isLoading: recordsLoading } = useLeagueRecords(leagueId);

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

  const memberOptions = [
    { key: "all", label: "All Members" },
    ...(members ?? []).map((m: any) => ({ key: m.userId, label: memberDisplayName(m) })),
  ];
  const filtersActive = memberFilter !== "all" || betTypeFilter !== "all" || resultFilter !== "all";
  const filteredParlays = (parlays ?? []).filter((parlay: ParlayWithLegs) => {
    const legs = parlay.legs ?? [];
    if (memberFilter !== "all" && parlay.userId !== memberFilter && !legs.some((l) => l.userId === memberFilter)) {
      return false;
    }
    if (betTypeFilter !== "all" && !legs.some((l) => l.betType === betTypeFilter)) return false;
    if (resultFilter !== "all") {
      if (resultFilter === "pending") {
        if (!legs.some((l) => !l.result)) return false;
      } else if (!legs.some((l) => l.result === resultFilter)) {
        return false;
      }
    }
    return true;
  });

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

        {/* Submitted-count / lock control is league-management chrome tied to
            the Parlays view — showing it under Members/Stats too was exactly
            the "full league info that doesn't belong here" clutter. */}
        {isAdmin && activeWeek && activeTab === "parlays" && (
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
          {(["parlays", "stats", "members"] as Tab[]).map((tab) => {
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
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.submitBannerText}>
                    {myParlay ? "Edit Your Pick" : "Build Your Pick"}
                  </Text>
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
              {!parlaysLoading && parlays && parlays.length > 0 && (
                <View style={styles.filterSection}>
                  <View style={styles.filterSectionHeader}>
                    <Text style={styles.filterSectionTitle}>Filter</Text>
                    {filtersActive && (
                      <Pressable
                        onPress={() => {
                          setMemberFilter("all");
                          setBetTypeFilter("all");
                          setResultFilter("all");
                        }}
                        hitSlop={8}
                        style={({ pressed }) => [styles.clearFiltersBtn, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.clearFiltersText}>Clear</Text>
                      </Pressable>
                    )}
                  </View>
                  <FilterChipRow options={memberOptions} selected={memberFilter} onSelect={setMemberFilter} />
                  <View style={styles.filterRowDivider} />
                  <FilterChipRow options={BET_TYPE_FILTERS} selected={betTypeFilter} onSelect={setBetTypeFilter} />
                  <View style={styles.filterRowDivider} />
                  <FilterChipRow options={RESULT_FILTERS} selected={resultFilter} onSelect={setResultFilter} />
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
              ) : filteredParlays.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="filter-outline" size={28} color="#2563eb" />
                  </View>
                  <Text style={styles.emptyTitle}>No parlays match</Text>
                  <Text style={styles.emptySubtitle}>Try clearing a filter.</Text>
                </View>
              ) : (
                filteredParlays.map((parlay: ParlayWithLegs) => (
                  <ParlayCard
                    key={parlay.id}
                    parlay={parlay}
                    isAdmin={isAdmin}
                    leagueId={leagueId}
                    weekId={weekId}
                    preferredSportsbook={preferredSportsbook}
                    loserLabel={league?.loserLabel}
                    heroLabel={league?.heroLabel}
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
              {membersLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : !members || members.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySubtitle}>No members found</Text>
                </View>
              ) : (
                <MembersTable members={members} stats={stats} />
              )}
              <Pressable
                style={({ pressed }) => [styles.webLinkRow, pressed && { opacity: 0.7 }]}
                onPress={openManageOnWeb}
              >
                <Ionicons name="globe-outline" size={14} color="#64748b" />
                <Text style={styles.webLinkText}>Manage roles & rules on the web</Text>
              </Pressable>
            </>
          )}

          {/* STATS — League Records, same "superlatives" tiles as the web app. */}
          {activeTab === "stats" && (
            <>
              {recordsLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : !leagueRecords || leagueRecords.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="bar-chart-outline" size={28} color="#2563eb" />
                  </View>
                  <Text style={styles.emptyTitle}>No records yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Records appear once decided picks pile up.
                  </Text>
                </View>
              ) : (
                <View style={styles.recordGrid}>
                  {leagueRecords.map((record) => (
                    <LeagueRecordTile key={record.key} record={record} members={members} />
                  ))}
                </View>
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
    paddingVertical: 10,
    minHeight: 44,
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
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
    shadowColor: "#2563eb",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  submitBannerPressed: { opacity: 0.8 },
  submitBannerText: { fontSize: 15, color: "#fff", fontWeight: "700", textAlign: "center" },
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
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
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
  filterSection: { marginBottom: 14, gap: 6 },
  filterSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  filterSectionTitle: { fontSize: 11, fontWeight: "700", color: "#475569", letterSpacing: 0.6, textTransform: "uppercase" },
  clearFiltersBtn: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  clearFiltersText: { fontSize: 12, fontWeight: "600", color: "#2563eb" },
  chipRow: { gap: 8, paddingRight: 8 },
  filterRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2a3447",
  },
  chip: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#1e2a3b", borderColor: "#2563eb" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  chipTextActive: { color: "#93c5fd" },
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

  /* Parlay card — shadow lives on this outer, non-clipping wrapper since
   * combining shadow* props with overflow:"hidden" (needed by parlayCard's
   * rounded corners) breaks shadow rendering on iOS. */
  parlayCardShadowWrap: {
    marginBottom: 10,
    borderRadius: 14,
    ...shadows.card,
  },
  parlayCard: {
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    overflow: "hidden",
  },
  parlayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    position: "relative",
    overflow: "hidden",
  },
  parlayCardProgressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  collapseChevron: {
    width: 28,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPressed: { opacity: 0.85 },
  parlayCardMeta: { flex: 1, minWidth: 0 },
  parlayCardNameRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  parlayCardName: { fontSize: 14, fontWeight: "700", color: "#f1f5f9", flexShrink: 1 },
  parlayCardStatus: { fontSize: 12, color: "#94a3b8", marginTop: 1, textTransform: "capitalize" },
  parlayCardFraction: { fontSize: 12, fontWeight: "700", flexShrink: 0 },
  legCountPill: {
    backgroundColor: "#141926",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  legCountPillText: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4, marginBottom: 2 },
  resultChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resultChipText: { fontSize: 10, fontWeight: "600", color: "#94a3b8" },
  resultChipDestructive: { borderColor: "#ef444466" },
  resultChipTextDestructive: { color: "#ef4444" },
  resultChipSuccess: { borderColor: "#22c55e66" },
  resultChipTextSuccess: { color: "#22c55e" },
  mixBarWrap: { paddingHorizontal: 14, paddingBottom: 12 },
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
  legText: { flex: 1, fontSize: 13, fontWeight: "600" },
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
    paddingVertical: 12,
    minHeight: 44,
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
    paddingVertical: 12,
    minHeight: 44,
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
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  sendButtonText: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
  moderationButtonPressed: { opacity: 0.7 },

  /* Member rows / sortable table */
  memberHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  memberHeaderCol: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  memberHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  memberHeaderTextActive: { color: "#2563eb" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  memberIdentityCol: { flex: 1.6, minWidth: 0 },
  memberStatCol: { flex: 1, fontSize: 13, fontWeight: "700", color: "#f1f5f9", textAlign: "center" },
  memberName: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  memberRole: { fontSize: 12, fontWeight: "600", marginTop: 2 },

  /* League Records grid (Stats tab) */
  recordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recordTile: {
    width: "47%",
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 12,
  },
  recordTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  recordTitle: { fontSize: 13, fontWeight: "800", color: "#f1f5f9", flexShrink: 1 },
  recordLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 8,
    flexShrink: 1,
  },
  recordValue: { fontSize: 17, fontWeight: "800", color: "#f1f5f9" },
  recordDetail: { fontSize: 11, fontWeight: "500", color: "#94a3b8" },
  recordMeta: { fontSize: 11, color: "#94a3b8", marginTop: 3 },
});
