import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  SectionList,
  Modal,
} from "react-native";
import { useState, useEffect, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useLeagues, useWeekLockStatus } from "@/hooks/use-leagues";
import { useActiveWeek, useWeeks } from "@/hooks/use-weeks";
import { useActiveWeekStatus, useMyParlay, useMyParlayHistory } from "@/hooks/use-parlays";
import { useEffectiveUserId } from "@/hooks/use-acting-as";
import { format, formatDistanceToNow, isPast } from "date-fns";
import type { ActiveWeekStatus, ParlayWithLegs, Week } from "@shared/schema";
import { sortParlayLegs } from "@shared/legOrder";
import { CHIP_MIN_HEIGHT, shadows } from "@/lib/theme";
import { getParlayVisualStyle, getWinPctColor } from "@/lib/parlayVisuals";
import { LegRow, legOwnerName } from "@/components/LegLookthrough";
import { estimateWeekDateRange } from "@shared/nflWeek";
import { isParlayInProgress, legTally } from "@shared/parlayProgress";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Approved and on its way (or already at the book) — these tiles glow.
const ACTIVE_STATUSES = new Set(["approved", "sent", "placed"]);

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
  ctaLabel,
  tint,
  progress,
  children,
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
   * app's animated "perfect week" glow (see client/src/lib/parlayVisuals.ts).
   * An active parlay (approved, sent or placed) holds the same glow steady. */
  glow?: "pulse" | "steady";
  /** Explicit CTA button below the tile's meta text — same action as tapping
   * the card, kept for tiles where the action shouldn't be implicit-only. */
  ctaLabel?: string;
  /** Faint wash over the card, e.g. the red-to-green result color. */
  tint?: string;
  /** How full an open parlay is, 0 to 1 (members with a pick in / members).
   * Fills the tile from the left like a loading bar, as the league tiles on
   * the web's Quick Picks do. */
  progress?: number;
  /** Shown under the tile's text, e.g. the expanded list of legs. */
  children?: React.ReactNode;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (glow !== "pulse") return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [glow, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow === "pulse" ? 0.35 + pulse.value * 0.4 : glow === "steady" ? 0.55 : 0.25,
    shadowRadius: glow === "pulse" ? 8 + pulse.value * 6 : glow === "steady" ? 12 : 8,
  }));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Animated.View style={[styles.shadowWrap, glow && styles.shadowWrapGlow, glowStyle]}>
        <View style={[styles.parlayCard, { backgroundColor: bg, borderColor: border }]}>
          {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
          {progress != null && progress > 0 ? (
            <View
              pointerEvents="none"
              style={[styles.progressFill, { width: `${Math.round(Math.min(1, progress) * 100)}%`, backgroundColor: iconColor }]}
            />
          ) : null}
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

            {/* Visual CTA only — same onPress as the card (no nested Pressable). */}
            {ctaLabel ? (
              <View style={styles.tileCtaBtn}>
                <Text style={styles.tileCtaBtnText}>{ctaLabel}</Text>
              </View>
            ) : null}

            {children}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** For a league where the member still owes a pick this week: either the
 * league's parlay is open and waiting on them, or nobody has started one. */
function NeedsPickTile({ leagueId, weekId, leagueName, status }: { leagueId: number; weekId: number; leagueName: string; status?: ActiveWeekStatus }) {
  const router = useRouter();
  const effectiveUserId = useEffectiveUserId();
  const { data: parlay, isLoading } = useMyParlay(leagueId, weekId);
  const { data: lockStatus } = useWeekLockStatus(leagueId, weekId);
  const isLocked = !!lockStatus?.isLocked;
  const openLeague = () => router.push({ pathname: "/leagues/[id]", params: { id: String(leagueId) } });
  const openBuild = () => router.push({ pathname: "/leagues/[id]/build", params: { id: String(leagueId) } });

  if (isLoading) {
    return (
      <View style={styles.shadowWrap}>
        <View style={[styles.parlayCard, styles.parlayCardLoading]}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      </View>
    );
  }
  // Their pick is in: the parlay shows in the list below instead.
  if (parlay?.legs.some((l) => l.userId === effectiveUserId)) return null;

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
        onPress={openLeague}
      />
    );
  }

  const legCount = parlay?.legs.length ?? 0;
  if (parlay && parlay.status !== "draft") {
    // Submitted without them. In a league with room for another parlay
    // this week they can still start one.
    return (
      <ParlayTile
        icon="alert-circle-outline"
        iconColor="#94a3b8"
        leagueName={leagueName}
        statusLabel="Parlay submitted without your pick"
        metaLabel={parlay.canStartAnother ? "Tap to start another parlay" : "Tap to view league"}
        bg="#141926"
        border="#2a3447"
        onPress={parlay.canStartAnother ? openBuild : openLeague}
      />
    );
  }

  return (
    <ParlayTile
      icon="alert-circle-outline"
      iconColor="#f59e0b"
      leagueName={leagueName}
      statusLabel={parlay ? "Parlay is Open!" : "No parlay yet this week"}
      metaLabel={parlay ? `${membersInLabel(status, legCount)} · yours isn't yet` : undefined}
      progress={parlay ? membersInProgress(status) : undefined}
      bg="#1c1a0a"
      border="#3d2e00"
      actionIcon="create-outline"
      ctaLabel={parlay ? "Make Your Pick" : "Create New Parlay"}
      onPress={openBuild}
    />
  );
}

const STATUS_META: Record<string, { icon: IconName; iconColor: string; label: string; bg: string; border: string }> = {
  draft: { icon: "add-circle-outline", iconColor: "#60a5fa", label: "Parlay is Open!", bg: "#0a1526", border: "#1a2e4d" },
  win: { icon: "trophy", iconColor: "#22c55e", label: "Won", bg: "#0a1c14", border: "#22c55e" },
  loss: { icon: "close-circle", iconColor: "#ef4444", label: "Lost", bg: "#1c0a0a", border: "#3d1a1a" },
  void: { icon: "ban-outline", iconColor: "#475569", label: "Void", bg: "#141926", border: "#2a3447" },
  push: { icon: "swap-horizontal-outline", iconColor: "#94a3b8", label: "Push", bg: "#141926", border: "#2a3447" },
  approved: { icon: "checkmark-circle", iconColor: "#22c55e", label: "Approved", bg: "#0a1c14", border: "#1f6b3c" },
  rejected: { icon: "close-circle-outline", iconColor: "#f59e0b", label: "Rejected", bg: "#1c1a0a", border: "#3d2e00" },
  sent: { icon: "paper-plane-outline", iconColor: "#22c55e", label: "Sent", bg: "#0a1c14", border: "#1f6b3c" },
  placed: { icon: "paper-plane-outline", iconColor: "#22c55e", label: "Placed", bg: "#0a1c14", border: "#1f6b3c" },
  // Light blue while it waits on approval, rather than reading as inactive.
  pending: { icon: "time-outline", iconColor: "#38bdf8", label: "Pending review", bg: "#10283a", border: "#2b7ba3" },
};

/** "3 of 5 members in", or the leg count until the week's status has loaded. */
function membersInLabel(status: ActiveWeekStatus | undefined, legCount: number): string {
  if (!status?.totalMembers) return `${legCount} ${legCount === 1 ? "leg" : "legs"} in`;
  return `${status.submittedCount} of ${status.totalMembers} members in`;
}

function membersInProgress(status: ActiveWeekStatus | undefined): number | undefined {
  return status?.totalMembers ? status.submittedCount / status.totalMembers : undefined;
}

function HistoryTile({ parlay, leagueName, status }: { parlay: ParlayWithLegs; leagueName: string; status?: ActiveWeekStatus }) {
  const router = useRouter();
  const effectiveUserId = useEffectiveUserId();
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[parlay.status ?? "pending"] ?? STATUS_META.pending;
  // Listed in the order that fits where the parlay is (shared/legOrder.ts).
  const legs = sortParlayLegs(parlay);
  const legCount = legs.length;
  const isDraft = parlay.status === "draft";
  const tally = legTally(legs);
  // Once a leg is decided the tile takes the same red-to-green win % color
  // as the league's rollup cards, instead of a flat color per status.
  const scale = !isDraft && tally.pct !== null ? getParlayVisualStyle(tally.pct) : null;
  const scaleColor = scale ? (([r, g, b]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`)(getWinPctColor(tally.pct!)) : null;
  const openLeague = () => router.push({ pathname: "/leagues/[id]", params: { id: String(parlay.leagueId) } });

  return (
    <ParlayTile
      icon={meta.icon}
      iconColor={scaleColor ?? meta.iconColor}
      leagueName={leagueName}
      statusLabel={isParlayInProgress(parlay) ? "In progress" : isDraft && status?.allSubmitted ? "Ready to Lock" : meta.label}
      progress={isDraft ? membersInProgress(status) : undefined}
      metaLabel={
        isDraft
          ? `${membersInLabel(status, legCount)} · your pick is saved`
          : [
              parlay.week?.label ?? "Week",
              `${legCount} ${legCount === 1 ? "leg" : "legs"}`,
              tally.resolved > 0 || tally.pending < legCount ? tally.label : null,
            ].filter(Boolean).join(" · ")
      }
      bg={scale ? "#1c2538" : meta.bg}
      border={scale?.borderColor ?? meta.border}
      tint={scale?.tintColor}
      glow={parlay.status === "win" ? "pulse" : ACTIVE_STATUSES.has(parlay.status ?? "") ? "steady" : undefined}
      actionIcon={isDraft ? "create-outline" : expanded ? "chevron-up" : "chevron-down"}
      onPress={() =>
        isDraft
          ? router.push({ pathname: "/leagues/[id]/build", params: { id: String(parlay.leagueId) } })
          : setExpanded((v) => !v)
      }
    >
      {expanded && !isDraft && (
        <View style={styles.tileLegs} testID={`legs-parlay-${parlay.id}`}>
          {legs.map((leg) => (
            <LegRow
              key={leg.id}
              leg={leg}
              ownerName={legOwnerName(leg.user)}
              week={parlay.week}
              disputable={leg.userId === effectiveUserId}
            />
          ))}
          <Pressable
            onPress={openLeague}
            hitSlop={6}
            style={({ pressed }) => [styles.tileLeagueLink, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={styles.tileLeagueLinkText}>Open league</Text>
            <Ionicons name="chevron-forward" size={13} color="#93c5fd" />
          </Pressable>
        </View>
      )}
    </ParlayTile>
  );
}

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** When a parlay was played: its first kickoff, else its week's estimated
 * dates. Used to file past parlays under a year and month. */
function parlayDate(parlay: ParlayWithLegs): Date {
  const kickoffs = (parlay.legs ?? [])
    .map((l) => (l.game?.gameTime ? new Date(l.game.gameTime).getTime() : null))
    .filter((t): t is number => t != null);
  if (kickoffs.length > 0) return new Date(Math.min(...kickoffs));
  if (parlay.week) return estimateWeekDateRange(parlay.week.season, parlay.week.weekNumber).start;
  return parlay.createdAt ? new Date(parlay.createdAt) : new Date(0);
}

const RESULT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Results" },
  { key: "win", label: "Won" },
  { key: "loss", label: "Lost" },
  { key: "push", label: "Push" },
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
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
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

/** Tapping the active-week banner opens a picker of every loaded week
 * (grouped by season, newest first) to filter the list down to one week.
 * Picking "Current Week" clears the filter back to the normal open/past view. */
function WeekFilterButton({
  activeWeek,
  loadedWeeks,
  weekFilter,
  onSelect,
  deadline,
  deadlinePast,
}: {
  activeWeek: Week;
  /** Every week currently revealed/fetched — weeks further back than this
   * haven't been loaded yet, so they're not offered until "Load" reveals them. */
  loadedWeeks: Week[];
  weekFilter: string;
  onSelect: (weekId: string) => void;
  deadline: Date | null;
  deadlinePast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selectedWeek = loadedWeeks.find((w) => String(w.id) === weekFilter);
  const displayWeek = selectedWeek ?? activeWeek;
  const isFiltered = weekFilter !== "all";

  const seasons = useMemo(() => {
    const bySeason = new Map<number, Week[]>();
    for (const w of loadedWeeks) {
      const arr = bySeason.get(w.season);
      if (arr) arr.push(w);
      else bySeason.set(w.season, [w]);
    }
    return [...bySeason.entries()]
      .sort(([a], [b]) => b - a)
      .map(([season, weeks]) => ({
        season,
        weeks: [...weeks].sort((a, b) => b.weekNumber - a.weekNumber),
      }));
  }, [loadedWeeks]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.weekBanner, pressed && { opacity: 0.85 }]}
        testID="button-picks-week-filter"
      >
        <View style={styles.weekBannerLeft}>
          <Ionicons name="calendar" size={18} color="#2563eb" />
          <View>
            <Text style={styles.weekName}>{displayWeek.label}</Text>
            {!isFiltered && deadline && (
              <Text style={[styles.deadlineText, deadlinePast && styles.deadlineTextPast]}>
                {deadlinePast
                  ? "Deadline passed"
                  : `Closes ${formatDistanceToNow(deadline, { addSuffix: true })}`}
              </Text>
            )}
            {isFiltered && <Text style={styles.deadlineText}>Filtered · tap to change</Text>}
          </View>
        </View>
        {!isFiltered && deadline && !deadlinePast && (
          <View style={styles.deadlinePill}>
            <Text style={styles.deadlinePillText}>{format(deadline, "MMM d, h:mm a")}</Text>
          </View>
        )}
        <Ionicons name="chevron-down" size={16} color="#64748b" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter by Week</Text>
            <ScrollView style={styles.sheetScroll}>
              <Pressable
                onPress={() => {
                  onSelect("all");
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.weekOption, pressed && { opacity: 0.7 }]}
                testID="option-week-current"
              >
                <Text style={styles.weekOptionText}>Current Week ({activeWeek.label})</Text>
                {!isFiltered && <Ionicons name="checkmark" size={18} color="#2563eb" />}
              </Pressable>
              {seasons.map(({ season, weeks }) => (
                <View key={season}>
                  <Text style={styles.weekSeasonLabel}>{season} Season</Text>
                  {weeks.map((w) => (
                    <Pressable
                      key={w.id}
                      onPress={() => {
                        onSelect(String(w.id));
                        setOpen(false);
                      }}
                      style={({ pressed }) => [styles.weekOption, pressed && { opacity: 0.7 }]}
                      testID={`option-week-${w.id}`}
                    >
                      <Text style={styles.weekOptionText} numberOfLines={1}>
                        {w.label}
                      </Text>
                      {weekFilter === String(w.id) && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function PicksScreen() {
  const router = useRouter();
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const { data: allWeeks } = useWeeks();
  const activeWeek = useActiveWeek();
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  // Every week on record, chronological (oldest first) — used to walk
  // backward from the active week one at a time as "load previous week" is
  // tapped, and forward one step for the read-only next-week preview.
  const chronoWeeks = useMemo(
    () => [...(allWeeks ?? [])].sort((a, b) => a.season - b.season || a.weekNumber - b.weekNumber),
    [allWeeks],
  );
  const activeWeekIndex = activeWeek ? chronoWeeks.findIndex((w) => w.id === activeWeek.id) : -1;
  const priorWeeks = activeWeekIndex >= 0 ? chronoWeeks.slice(0, activeWeekIndex).reverse() : [];
  const nextWeek = activeWeekIndex >= 0 ? chronoWeeks[activeWeekIndex + 1] : undefined;

  // Loaded a whole NFL season at a time (rather than one week per tap) so the
  // default view is "this year + last year in full" without fetching the
  // user's entire history up front. `null` means "not yet defaulted" — the
  // effect below sets it once `activeWeek`/`priorWeeks` are available, since
  // the default depends on data that isn't there yet on first paint.
  const [revealedPastWeeks, setRevealedPastWeeks] = useState<number | null>(null);
  useEffect(() => {
    if (revealedPastWeeks !== null || !activeWeek || priorWeeks.length === 0) return;
    // Every prior week whose season is this year's or last year's.
    const defaultCount = priorWeeks.filter((w) => w.season >= activeWeek.season - 1).length;
    setRevealedPastWeeks(defaultCount);
  }, [activeWeek, priorWeeks, revealedPastWeeks]);
  const effectiveRevealedPastWeeks = revealedPastWeeks ?? 0;
  const visiblePriorWeeks = priorWeeks.slice(0, effectiveRevealedPastWeeks);
  const hasMorePriorWeeks = effectiveRevealedPastWeeks < priorWeeks.length;
  // The oldest season not yet revealed — "Load {season} Season" pulls in
  // every remaining week from that season in one tap, not just one week.
  const nextHiddenSeason = priorWeeks[effectiveRevealedPastWeeks]?.season;

  const weekIdsToFetch = activeWeek
    ? [activeWeek.id, ...visiblePriorWeeks.map((w) => w.id)]
    : undefined;
  const { data: parlayHistory } = useMyParlayHistory(weekIdsToFetch);
  const { data: weekStatus } = useActiveWeekStatus();
  const effectiveUserId = useEffectiveUserId();

  // Selecting a week further back than what's currently loaded (via the week
  // filter picker) reveals it immediately rather than showing an empty list.
  useEffect(() => {
    if (weekFilter === "all") return;
    const targetId = Number(weekFilter);
    const targetIndex = priorWeeks.findIndex((w) => w.id === targetId);
    if (targetIndex >= 0 && targetIndex + 1 > effectiveRevealedPastWeeks) {
      setRevealedPastWeeks(targetIndex + 1);
    }
  }, [weekFilter, priorWeeks, effectiveRevealedPastWeeks]);

  const matchesWeek = (weekId: number) => weekFilter === "all" || weekId === Number(weekFilter);

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

  const leagueOptions = [
    { key: "all", label: "All Leagues" },
    ...leagues.map((l) => ({ key: String(l.id), label: l.name })),
  ];
  const matchesLeague = (id: number) => leagueFilter === "all" || String(id) === leagueFilter;

  // "Needs a pick" only ever applies to the active week — filtering to a
  // past week via the week picker shouldn't invent an open-pick prompt for it.
  // A member owes a pick when the league's parlay is open without theirs, or
  // none has been started. The server decides (the same answer the Leagues
  // tab uses); until that loads, fall back to "no parlay of mine this week".
  const leaguesNeedingPick = (activeWeek && matchesWeek(activeWeek.id)
    ? leagues.filter((l) => {
        const inOne = (parlayHistory ?? []).some(
          (p) => p.leagueId === l.id && p.weekId === activeWeek.id && (p.legs ?? []).some((leg) => leg.userId === effectiveUserId),
        );
        return !inOne && (weekStatus?.[l.id]?.currentUserNeedsPick ?? true);
      })
    : []
  ).filter((l) => matchesLeague(l.id));

  const openHistory = (parlayHistory ?? []).filter(
    (p) => !PAST_STATUSES.has(p.status ?? "") && matchesLeague(p.leagueId) && matchesWeek(p.weekId),
  );
  const pastHistory = (parlayHistory ?? []).filter(
    (p) =>
      PAST_STATUSES.has(p.status ?? "") &&
      matchesLeague(p.leagueId) &&
      matchesWeek(p.weekId) &&
      (resultFilter === "all" || p.status === resultFilter),
  );

  const hasOpen = leaguesNeedingPick.length > 0 || openHistory.length > 0;
  const hasPast = pastHistory.length > 0;
  const hasAnyPast = (parlayHistory ?? []).some((p) => PAST_STATUSES.has(p.status ?? ""));

  type ListRow =
    | { kind: "need"; leagueId: number; weekId: number; leagueName: string; key: string }
    | { kind: "history"; parlay: ParlayWithLegs; key: string }
    | { kind: "label"; level: "year" | "month"; text: string; key: string };

  const sections = useMemo(() => {
    const result: { title: string; data: ListRow[] }[] = [];
    if (hasOpen) {
      result.push({
        title: "OPEN PARLAYS",
        data: [
          ...leaguesNeedingPick.map((league) => ({
            kind: "need" as const,
            leagueId: league.id,
            weekId: activeWeek!.id,
            leagueName: league.name,
            key: `need-${league.id}`,
          })),
          ...openHistory.map((parlay) => ({
            kind: "history" as const,
            parlay,
            key: `open-${parlay.id}`,
          })),
        ],
      });
    }
    if (hasPast) {
      // Newest first, with a quiet label wherever the year or month changes.
      const dated = pastHistory
        .map((parlay) => ({ parlay, date: parlayDate(parlay) }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      const rows: ListRow[] = [];
      let lastYear: number | null = null;
      let lastMonth: number | null = null;
      for (const { parlay, date } of dated) {
        const year = date.getFullYear();
        const month = date.getMonth();
        if (year !== lastYear) {
          rows.push({ kind: "label", level: "year", text: String(year), key: `year-${year}` });
          lastMonth = null;
        }
        if (month !== lastMonth) {
          rows.push({ kind: "label", level: "month", text: MONTH_NAMES[month], key: `month-${year}-${month}` });
        }
        lastYear = year;
        lastMonth = month;
        rows.push({ kind: "history", parlay, key: `past-${parlay.id}` });
      }
      result.push({ title: "PAST PARLAYS", data: rows });
    }
    return result;
  }, [hasOpen, hasPast, leaguesNeedingPick, openHistory, pastHistory, activeWeek]);

  const listHeader = (
    <>
      {activeWeek ? (
        <WeekFilterButton
          activeWeek={activeWeek}
          loadedWeeks={visiblePriorWeeks}
          weekFilter={weekFilter}
          onSelect={setWeekFilter}
          deadline={deadline}
          deadlinePast={deadlinePast}
        />
      ) : (
        <View style={styles.noWeekBanner}>
          <Ionicons name="time-outline" size={16} color="#94a3b8" />
          <Text style={styles.noWeekText}>No active week right now</Text>
        </View>
      )}

      {leagues.length > 1 && (
        <FilterChipRow options={leagueOptions} selected={leagueFilter} onSelect={setLeagueFilter} />
      )}
      {leagues.length > 1 && hasAnyPast && <View style={styles.filterRowDivider} />}
      {hasAnyPast && (
        <FilterChipRow options={RESULT_FILTERS} selected={resultFilter} onSelect={setResultFilter} />
      )}
    </>
  );

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.key}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        !hasOpen && !hasPast && (leagueFilter !== "all" || resultFilter !== "all" || weekFilter !== "all") ? (
          <View style={styles.listEmpty}>
            <Ionicons name="filter-outline" size={28} color="#2563eb" />
            <Text style={styles.emptyTitle}>No parlays match</Text>
            <Text style={styles.emptySubtitle}>Try clearing a filter.</Text>
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <Text
          style={[
            styles.sectionLabel,
            section.title === "PAST PARLAYS" && hasOpen && styles.sectionLabelSpaced,
          ]}
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item }) =>
        item.kind === "label" ? (
          <View style={item.level === "year" ? styles.yearLabelRow : styles.monthLabelRow}>
            <Text style={item.level === "year" ? styles.yearLabel : styles.monthLabel}>{item.text}</Text>
            <View style={styles.groupLabelLine} />
          </View>
        ) : item.kind === "need" ? (
          <NeedsPickTile
            leagueId={item.leagueId}
            weekId={item.weekId}
            leagueName={item.leagueName}
            status={weekStatus?.[item.leagueId]}
          />
        ) : (
          <HistoryTile
            parlay={item.parlay}
            leagueName={leagueName(item.parlay.leagueId)}
            // Only the active week's parlay has a live "members in" count.
            status={item.parlay.weekId === activeWeek?.id ? weekStatus?.[item.parlay.leagueId] : undefined}
          />
        )
      }
      ListFooterComponent={
        <View style={styles.footerActions}>
          {hasMorePriorWeeks && (
            <Pressable
              onPress={() =>
                setRevealedPastWeeks(priorWeeks.filter((w) => w.season >= nextHiddenSeason).length)
              }
              style={({ pressed }) => [styles.loadMoreBtn, pressed && { opacity: 0.75 }]}
              testID="button-picks-load-previous-season"
            >
              <Ionicons name="chevron-down-circle-outline" size={16} color="#94a3b8" />
              <Text style={styles.loadMoreBtnText}>
                Load {nextHiddenSeason ?? "previous"} season
              </Text>
            </Pressable>
          )}
          {nextWeek && (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/leagues/[id]/build",
                  params: { id: String(leagues[0]?.id ?? ""), weekId: String(nextWeek.id), readOnly: "1" },
                })
              }
              style={({ pressed }) => [styles.nextWeekBtn, pressed && { opacity: 0.85 }]}
              testID="button-picks-view-next-week"
            >
              <Ionicons name="eye-outline" size={16} color="#93c5fd" />
              <Text style={styles.nextWeekBtnText}>Preview {nextWeek.label} (view only)</Text>
            </Pressable>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  progressFill: { position: "absolute", top: 0, bottom: 0, left: 0, opacity: 0.16 },
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
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  sheetScroll: { flexGrow: 0 },
  weekSeasonLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 4,
  },
  weekOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
  },
  weekOptionText: { fontSize: 15, color: "#f1f5f9", flex: 1, marginRight: 12 },
  chipRow: { gap: 8, paddingRight: 8, marginBottom: 14 },
  filterRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2a3447",
    marginBottom: 14,
  },
  chip: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: CHIP_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: "#1e2a3b", borderColor: "#2563eb" },
  chipPressed: { opacity: 0.75 },
  chipText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  chipTextActive: { color: "#93c5fd" },
  listEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  tileCtaBtn: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    minHeight: 44,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileCtaBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionLabelSpaced: { marginTop: 8 },
  yearLabelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 4 },
  monthLabelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, marginBottom: 12 },
  yearLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", letterSpacing: 1 },
  monthLabel: { fontSize: 10, fontWeight: "700", color: "#475569", letterSpacing: 1 },
  groupLabelLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#2a3447" },
  tileLegs: { marginTop: 12 },
  tileLeagueLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    minHeight: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a3447",
  },
  tileLeagueLinkText: { fontSize: 12, fontWeight: "600", color: "#93c5fd" },
  footerActions: { marginTop: 8, gap: 10 },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: CHIP_MIN_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    backgroundColor: "#1c2538",
  },
  loadMoreBtnText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  nextWeekBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: CHIP_MIN_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1a2e4d",
    backgroundColor: "#0a1526",
  },
  nextWeekBtnText: { fontSize: 13, fontWeight: "600", color: "#93c5fd" },
  /* Shadow lives on this outer, non-clipping wrapper — combining shadow*
   * props with overflow:"hidden" on the same view breaks rendering on iOS. */
  shadowWrap: {
    marginBottom: 14,
    borderRadius: 18,
    alignSelf: "stretch",
    minWidth: 0,
    ...shadows.card,
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
