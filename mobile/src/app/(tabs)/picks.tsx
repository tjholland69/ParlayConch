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
import { useMyParlay, useMyParlayHistory } from "@/hooks/use-parlays";
import { format, formatDistanceToNow, isPast } from "date-fns";
import type { ParlayWithLegs, Week } from "@shared/schema";
import { CHIP_MIN_HEIGHT, shadows } from "@/lib/theme";

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
  ctaLabel,
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
  /** Explicit CTA button below the tile's meta text — same action as tapping
   * the card, kept for tiles where the action shouldn't be implicit-only. */
  ctaLabel?: string;
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

            {/* Visual CTA only — same onPress as the card (no nested Pressable). */}
            {ctaLabel ? (
              <View style={styles.tileCtaBtn}>
                <Text style={styles.tileCtaBtnText}>{ctaLabel}</Text>
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
      bg="#1c1a0a"
      border="#3d2e00"
      actionIcon="create-outline"
      ctaLabel="Create New Parlay"
      onPress={() => router.push({ pathname: "/leagues/[id]/build", params: { id: String(leagueId) } })}
    />
  );
}

const STATUS_META: Record<string, { icon: IconName; iconColor: string; label: string; bg: string; border: string }> = {
  draft: { icon: "add-circle-outline", iconColor: "#60a5fa", label: "In progress", bg: "#0a1526", border: "#1a2e4d" },
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
  const isDraft = parlay.status === "draft";

  return (
    <ParlayTile
      icon={meta.icon}
      iconColor={meta.iconColor}
      leagueName={leagueName}
      statusLabel={meta.label}
      metaLabel={
        isDraft
          ? `${legCount} ${legCount === 1 ? "leg" : "legs"} queued · Tap to continue`
          : `${parlay.week?.label ?? "Week"} · ${legCount} ${legCount === 1 ? "leg" : "legs"}`
      }
      bg={meta.bg}
      border={meta.border}
      glow={parlay.status === "win"}
      actionIcon={isDraft ? "create-outline" : undefined}
      onPress={() =>
        isDraft
          ? router.push({ pathname: "/leagues/[id]/build", params: { id: String(parlay.leagueId) } })
          : router.push({ pathname: "/leagues/[id]", params: { id: String(parlay.leagueId) } })
      }
    />
  );
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
  const leaguesNeedingPick = (activeWeek && matchesWeek(activeWeek.id)
    ? leagues.filter((l) => !(parlayHistory ?? []).some((p) => p.leagueId === l.id && p.weekId === activeWeek.id))
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
    | { kind: "history"; parlay: ParlayWithLegs; key: string };

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
      result.push({
        title: "PAST PARLAYS",
        data: pastHistory.map((parlay) => ({
          kind: "history" as const,
          parlay,
          key: `past-${parlay.id}`,
        })),
      });
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
        item.kind === "need" ? (
          <NeedsPickTile
            leagueId={item.leagueId}
            weekId={item.weekId}
            leagueName={item.leagueName}
          />
        ) : (
          <HistoryTile parlay={item.parlay} leagueName={leagueName(item.parlay.leagueId)} />
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
