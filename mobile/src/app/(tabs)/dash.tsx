import { View, Text, ScrollView, RefreshControl, Pressable, Modal, TextInput, StyleSheet } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardSummary, useDashboardPatterns, useDashboardPerformance, useCustomIndexes, useCustomIndexPerformance, type DashboardDateRange, type WinRateTimeSeriesPoint } from "@/hooks/use-dashboard";
import { useLeagues } from "@/hooks/use-leagues";
import { DashboardStack, DashboardLoading, DashboardEmptyState } from "@/components/DashboardSlider";
import { SimpleLineChart } from "@/components/charts/SimpleLineChart";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { InfoButton } from "@/components/InfoTip";
import { Button } from "@/components/ui/Button";
import { shadows } from "@/lib/theme";
import { useAccentColor } from "@/hooks/use-accent-color";
import { abbreviatePlayerName } from "@/lib/pickHelpers";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function StatTile({
  icon,
  label,
  value,
  valueColor,
  info,
  glowColor,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  info?: { title: string; description: string };
  /** Hero stats (Power Score, BAR) get a colored glow instead of a flat shadow. */
  glowColor?: string;
}) {
  return (
    <View style={[styles.statTile, glowColor ? shadows.glow(glowColor, 0.3) : shadows.card]}>
      {info && (
        <View style={styles.statTileInfo}>
          <InfoButton title={info.title} description={info.description} />
        </View>
      )}
      <View style={styles.statTileHeader}>
        <Ionicons name={icon} size={13} color="#94a3b8" />
        <Text style={styles.statTileLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statTileValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function SummarySlide({ leagueId }: { leagueId?: number }) {
  const accent = useAccentColor();
  const { data, isLoading, error } = useDashboardSummary(leagueId);

  if (isLoading) return <DashboardLoading message="Loading summary…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load your summary right now." />;

  const bar = data.bar ?? 0;

  return (
    <View>
      <Text style={styles.slideTitle}>Summary</Text>
      <View style={styles.statGrid}>
        <StatTile icon="people-outline" label="Leagues" value={String(data.leagueCount)} />
        <StatTile icon="checkmark-done-outline" label="Parlays Owned" value={String(data.parlaysPlaced)} />
        <StatTile icon="trophy-outline" label="Leg Wins" value={String(data.legWins)} />
        <StatTile icon="close-circle-outline" label="Leg Losses" value={String(data.legLosses)} />
        <StatTile icon="trending-up-outline" label="Leg Win Rate" value={`${data.legWinRate.toFixed(1)}%`} />
        <StatTile icon="pulse-outline" label="Participation" value={`${(data.participationRate * 100).toFixed(0)}%`} />
        <StatTile
          icon="flash-outline"
          label="Power Score"
          value={data.powerScore.toFixed(2)}
          glowColor={accent}
          info={{
            title: "Power Score",
            description:
              "Average value earned per settled leg. Winning legs score based on their odds — a +150 underdog win scores 1.5, a -150 favorite win scores about 0.67 — while losing legs score 0. Pushes and voided legs don't count. It rewards value-weighted wins, not just win rate.",
          }}
        />
        <StatTile
          icon="bar-chart-outline"
          label="BAR"
          value={`${bar > 0 ? "+" : ""}${bar.toFixed(2)}`}
          valueColor={bar > 0 ? accent : bar < 0 ? "#ef4444" : undefined}
          glowColor={bar > 0 ? accent : bar < 0 ? "#ef4444" : undefined}
          info={{
            title: "Bets Above Replacement",
            description:
              "How much value you're adding compared to an average bettor in your league — your Power Score weighted by how consistently you submit picks each week, minus the league average Power Score weighted by its average participation. Positive means you're outperforming the league average; negative means below it.",
          }}
        />
      </View>
    </View>
  );
}

function StatRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statRowLeft}>
        <Ionicons name={icon} size={15} color="#94a3b8" />
        <Text style={styles.statRowLabel}>{label}</Text>
      </View>
      <Text style={styles.statRowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Player Prop",
};

function AnalyticsSlide({ leagueId }: { leagueId?: number }) {
  const { data, isLoading, error } = useDashboardPatterns(leagueId);

  if (isLoading) return <DashboardLoading message="Loading analytics…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load your analytics right now." />;
  if (data.wins + data.losses + data.pushes === 0) {
    return <DashboardEmptyState message="Place some parlay legs to see your personal analytics." />;
  }

  return (
    <View>
      <View style={styles.slideTitleRow}>
        <Text style={styles.slideTitle}>My Analytics</Text>
        <Text style={styles.slideTitleMeta}>{data.totalLegs} submissions</Text>
      </View>
      <View style={styles.statRowList}>
        <StatRow
          icon="trophy-outline"
          label="Record"
          value={`${data.wins}-${data.losses}-${data.pushes} (${data.winRate.toFixed(1)}%)`}
        />
        {data.topBetType && (
          <StatRow
            icon="shuffle-outline"
            label="Top Bet Type"
            value={`${BET_TYPE_LABELS[data.topBetType.type] ?? data.topBetType.type} (${data.topBetType.count})`}
          />
        )}
        {data.favoriteTeam && (
          <StatRow icon="shield-outline" label="Favorite Team" value={`${data.favoriteTeam.team} (${data.favoriteTeam.count})`} />
        )}
        {data.overUnderPreference && (
          <StatRow
            icon="swap-vertical-outline"
            label="Over/Under Lean"
            value={`${data.overUnderPreference.pick === "over" ? "Over" : "Under"} (${data.overUnderPreference.overCount}-${data.overUnderPreference.underCount})`}
          />
        )}
        {data.favoritePlayer && (
          <StatRow icon="person-outline" label="Favorite Prop Player" value={`${abbreviatePlayerName(data.favoritePlayer.name)} (${data.favoritePlayer.count})`} />
        )}
        {data.favoriteDay && (
          <StatRow icon="calendar-outline" label="Most Active Day" value={`${data.favoriteDay.day} (${data.favoriteDay.count})`} />
        )}
        {data.slateBreakdown.some((s) => s.count > 0) && (
          <View style={styles.slateCard}>
            <View style={styles.slateCardHeader}>
              <Ionicons name="time-outline" size={15} color="#94a3b8" />
              <Text style={styles.slateCardTitle}>Slate Breakdown</Text>
            </View>
            <View style={{ gap: 6 }}>
              {data.slateBreakdown.map((s) => (
                <View key={s.slate} style={styles.slateRow}>
                  <Text style={styles.slateRowLabel}>{s.slate}</Text>
                  <Text style={styles.slateRowValue}>{s.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/** The dashed overlay line's source: the plain league average (default) from
 * the same series already being charted, or a swapped-in custom index's own
 * series. A custom index's performance is computed independently of the Dash
 * page's own league/date-range filters, so its weeks aren't guaranteed to
 * line up positionally with the base series — match by weekLabel instead of
 * zipping arrays, `null` for any base week the index has no data for. */
function resolveIndexPoints(
  decided: { weekLabel: string; indexWinRate: number | null }[],
  customIndexPoints: WinRateTimeSeriesPoint[] | undefined,
): (number | null)[] {
  if (!customIndexPoints) return decided.map((p) => p.indexWinRate);
  const byWeekLabel = new Map(customIndexPoints.map((p) => [p.weekLabel, p.indexWinRate]));
  return decided.map((p) => byWeekLabel.get(p.weekLabel) ?? null);
}

function PerformanceSlide({
  leagueId,
  dateRange,
  selectedIndexId,
}: {
  leagueId?: number;
  dateRange?: DashboardDateRange;
  selectedIndexId: number | null;
}) {
  const accent = useAccentColor();
  const { data, isLoading, error } = useDashboardPerformance(leagueId, dateRange);
  const { data: customIndexData } = useCustomIndexPerformance(selectedIndexId);

  if (isLoading) return <DashboardLoading message="Loading performance…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load performance data right now." />;

  const decided = data.points.filter((p) => p.myWinRate !== null);
  const points = decided.map((p) => ({ label: p.weekLabel, value: p.myWinRate as number }));
  const indexPoints = resolveIndexPoints(decided, customIndexData?.points);

  if (points.length === 0) {
    return <DashboardEmptyState message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  return (
    <View>
      <Text style={styles.slideTitle}>Performance Over Time</Text>
      <SimpleLineChart points={points} indexPoints={indexPoints} color={accent} formatValue={(v) => `${v.toFixed(1)}%`} />
    </View>
  );
}

function WeekOverWeekSlide({
  leagueId,
  dateRange,
  selectedIndexId,
}: {
  leagueId?: number;
  dateRange?: DashboardDateRange;
  selectedIndexId: number | null;
}) {
  const accent = useAccentColor();
  const { data, isLoading, error } = useDashboardPerformance(leagueId, dateRange);
  const { data: customIndexData } = useCustomIndexPerformance(selectedIndexId);

  if (isLoading) return <DashboardLoading message="Loading performance…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load performance data right now." />;

  const decided = data.points.filter((p) => p.allWeekWinRate !== null);
  const points = decided.map((p) => ({ label: p.weekLabel, value: p.allWeekWinRate as number }));
  // Same cumulative trendline shown on the "Performance Over Time" line chart above,
  // not the per-week index rate — the trend should read consistently between slides.
  const indexPoints = resolveIndexPoints(decided, customIndexData?.points);

  if (points.length === 0) {
    return <DashboardEmptyState message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  return (
    <View>
      <Text style={styles.slideTitle}>Weekly</Text>
      <SimpleBarChart points={points} indexPoints={indexPoints} color={accent} formatValue={(v) => `${v.toFixed(1)}%`} />
    </View>
  );
}

/** Dropdown filter — defaults to "All Leagues" (combined across every league
 * the user belongs to) and scopes every slide's data to one league when set. */
function LeagueFilter({
  leagues,
  selectedLeagueId,
  onSelect,
}: {
  leagues: { id: number; name: string }[];
  selectedLeagueId?: number;
  onSelect: (leagueId: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const accent = useAccentColor();
  const selectedName = leagues.find((l) => l.id === selectedLeagueId)?.name ?? "All Leagues";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.leagueFilterBtn,
          { backgroundColor: accent, shadowColor: accent },
          pressed && { opacity: 0.85 },
        ]}
        testID="button-dashboard-league-filter"
      >
        <View style={styles.leagueFilterRow}>
          <Ionicons name="people-outline" size={16} color="#ffffff" />
          <Text style={styles.leagueFilterText} numberOfLines={1}>
            {selectedName}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#ffffff" />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter by League</Text>

            <Pressable
              onPress={() => {
                onSelect(undefined);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.leagueOption, pressed && { opacity: 0.7 }]}
              testID="option-league-all"
            >
              <Text style={styles.leagueOptionText}>All Leagues</Text>
              {selectedLeagueId === undefined && <Ionicons name="checkmark" size={18} color={accent} />}
            </Pressable>

            {leagues.map((league) => (
              <Pressable
                key={league.id}
                onPress={() => {
                  onSelect(league.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.leagueOption, pressed && { opacity: 0.7 }]}
                testID={`option-league-${league.id}`}
              >
                <Text style={styles.leagueOptionText} numberOfLines={1}>
                  {league.name}
                </Text>
                {selectedLeagueId === league.id && <Ionicons name="checkmark" size={18} color={accent} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Dropdown to swap the charts' dashed overlay line between the plain league
 * average (default) and one of the user's own custom indexes — selecting
 * only, building/editing an index stays web-only. */
function IndexFilter({
  indexes,
  selectedIndexId,
  onSelect,
}: {
  indexes: { id: number; displayName: string }[];
  selectedIndexId: number | null;
  onSelect: (indexId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const accent = useAccentColor();
  const selectedName = indexes.find((i) => i.id === selectedIndexId)?.displayName ?? "Overall Average";

  if (indexes.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.leagueFilterBtn, styles.indexFilterBtn, pressed && { opacity: 0.85 }]}
        testID="button-dashboard-index-filter"
      >
        <View style={styles.leagueFilterRow}>
          <Ionicons name="analytics-outline" size={16} color={accent} />
          <Text style={[styles.leagueFilterText, { color: accent }]} numberOfLines={1}>
            {selectedName}
          </Text>
          <Ionicons name="chevron-down" size={16} color={accent} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Compare Against</Text>

            <Pressable
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.leagueOption, pressed && { opacity: 0.7 }]}
              testID="option-index-overall"
            >
              <Text style={styles.leagueOptionText}>Overall Average</Text>
              {selectedIndexId === null && <Ionicons name="checkmark" size={18} color={accent} />}
            </Pressable>

            {indexes.map((index) => (
              <Pressable
                key={index.id}
                onPress={() => {
                  onSelect(index.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.leagueOption, pressed && { opacity: 0.7 }]}
                testID={`option-index-${index.id}`}
              >
                <Text style={styles.leagueOptionText} numberOfLines={1}>
                  {index.displayName}
                </Text>
                {selectedIndexId === index.id && <Ionicons name="checkmark" size={18} color={accent} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

type DateRangeMode = "all" | "year" | "priorYear" | "custom";

const DATE_RANGE_LABELS: Record<DateRangeMode, string> = {
  all: "All Time",
  year: "Current Year",
  priorYear: "Prior Year",
  custom: "Custom",
};

/** NFL season year for a given date — e.g. both "2025-11-01" and "2026-01-20"
 * (the Super Bowl LX window) belong to the 2025 season, since the season runs
 * Sept of its start year through the following February. Calendar year alone
 * can't tell "Current Year" from "Prior Year" apart during Jan/Feb. */
function nflSeasonYear(date: Date): number {
  return date.getMonth() <= 1 ? date.getFullYear() - 1 : date.getFullYear();
}

function resolveDateRange(mode: DateRangeMode, customRange: DashboardDateRange): DashboardDateRange | undefined {
  const now = new Date();
  if (mode === "year") {
    return { season: nflSeasonYear(now) };
  }
  if (mode === "priorYear") {
    return { season: nflSeasonYear(now) - 1 };
  }
  if (mode === "custom") {
    return customRange.startDate || customRange.endDate ? customRange : undefined;
  }
  return undefined;
}

/** Matches YYYY-MM-DD, e.g. "2026-01-31". */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function DateRangeFilter({
  mode,
  customRange,
  onModeChange,
  onCustomRangeChange,
}: {
  mode: DateRangeMode;
  customRange: DashboardDateRange;
  onModeChange: (mode: DateRangeMode) => void;
  onCustomRangeChange: (range: DashboardDateRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(customRange.startDate ?? "");
  const [draftEnd, setDraftEnd] = useState(customRange.endDate ?? "");
  const insets = useSafeAreaInsets();
  const accent = useAccentColor();

  function openCustom() {
    setDraftStart(customRange.startDate ?? "");
    setDraftEnd(customRange.endDate ?? "");
    setCustomOpen(true);
  }

  function applyCustom() {
    const startValid = !draftStart || ISO_DATE_RE.test(draftStart);
    const endValid = !draftEnd || ISO_DATE_RE.test(draftEnd);
    if (!startValid || !endValid) return;
    onCustomRangeChange({ startDate: draftStart || undefined, endDate: draftEnd || undefined });
    onModeChange("custom");
    setCustomOpen(false);
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateFilterRow}>
        {(Object.keys(DATE_RANGE_LABELS) as DateRangeMode[]).map((key) => {
          const active = mode === key;
          return (
            <Pressable
              key={key}
              onPress={() => (key === "custom" ? openCustom() : onModeChange(key))}
              style={[styles.dateChip, active && [styles.dateChipActive, { borderColor: accent }]]}
              testID={`button-dashboard-date-${key}`}
            >
              <Text style={[styles.dateChipText, active && styles.dateChipTextActive]} numberOfLines={1}>
                {key === "custom" && mode === "custom" && (customRange.startDate || customRange.endDate)
                  ? `${customRange.startDate ?? "…"} → ${customRange.endDate ?? "…"}`
                  : DATE_RANGE_LABELS[key]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={customOpen} transparent animationType="slide" onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCustomOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Custom Date Range</Text>
            <Text style={styles.dateInputLabel}>Start date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              value={draftStart}
              onChangeText={setDraftStart}
              placeholder="2026-01-01"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              testID="input-dashboard-date-start"
            />
            <Text style={styles.dateInputLabel}>End date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              value={draftEnd}
              onChangeText={setDraftEnd}
              placeholder="2026-12-31"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              testID="input-dashboard-date-end"
            />
            <Button fullWidth style={styles.dateApplyBtn} onPress={applyCustom} testID="button-dashboard-date-apply">
              Apply
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function DashScreen() {
  const accent = useAccentColor();
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | undefined>(undefined);
  const [dateMode, setDateMode] = useState<DateRangeMode>("all");
  const [customRange, setCustomRange] = useState<DashboardDateRange>({});
  const dateRange = resolveDateRange(dateMode, customRange);
  const [selectedIndexId, setSelectedIndexId] = useState<number | null>(null);
  const { data: allIndexes } = useCustomIndexes();
  // "All Leagues" (selectedLeagueId undefined) has no single league to scope
  // by, so show every index visible to the user; otherwise only ones whose
  // saved filters include this league or apply to all of the user's leagues.
  const availableIndexes = (allIndexes ?? []).filter(
    (idx) => selectedLeagueId === undefined || !idx.filters?.leagueIds?.length || idx.filters.leagueIds.includes(selectedLeagueId)
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={accent} />}
      >
        {leagues && leagues.length > 1 && (
          <View style={styles.leagueFilterWrap}>
            <LeagueFilter
              leagues={leagues}
              selectedLeagueId={selectedLeagueId}
              onSelect={setSelectedLeagueId}
            />
          </View>
        )}

        <DateRangeFilter
          mode={dateMode}
          customRange={customRange}
          onModeChange={setDateMode}
          onCustomRangeChange={setCustomRange}
        />

        <IndexFilter
          indexes={availableIndexes}
          selectedIndexId={selectedIndexId}
          onSelect={setSelectedIndexId}
        />

        <DashboardStack
          slides={[
            { label: "Summary", content: <SummarySlide leagueId={selectedLeagueId} /> },
            { label: "My Analytics", content: <AnalyticsSlide leagueId={selectedLeagueId} /> },
            { label: "Performance", content: <PerformanceSlide leagueId={selectedLeagueId} dateRange={dateRange} selectedIndexId={selectedIndexId} /> },
            { label: "Weekly", content: <WeekOverWeekSlide leagueId={selectedLeagueId} dateRange={dateRange} selectedIndexId={selectedIndexId} /> },
          ]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  slideTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9", marginBottom: 12 },
  slideTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  slideTitleMeta: { fontSize: 11, color: "#475569", fontWeight: "600" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: {
    width: "47%",
    backgroundColor: "#141926",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    position: "relative",
  },
  statTileInfo: { position: "absolute", top: 2, right: 2, zIndex: 1 },
  statTileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6, paddingHorizontal: 16 },
  statTileLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 1, textAlign: "center" },
  statTileValue: { fontSize: 18, fontWeight: "700", color: "#f1f5f9", textAlign: "center" },
  statRowList: { gap: 8 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141926",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  statRowLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  statRowLabel: { fontSize: 13, color: "#94a3b8" },
  statRowValue: { fontSize: 13, fontWeight: "700", color: "#f1f5f9", flexShrink: 1, textAlign: "right" },
  slateCard: {
    backgroundColor: "#141926",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    padding: 12,
  },
  slateCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  slateCardTitle: { fontSize: 13, color: "#94a3b8" },
  slateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slateRowLabel: { fontSize: 13, color: "#94a3b8" },
  slateRowValue: { fontSize: 13, fontWeight: "700", color: "#f1f5f9" },

  leagueFilterWrap: {
    width: "100%",
  },
  leagueFilterBtn: {
    flexDirection: "row",
    flexWrap: "nowrap",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#93c5fd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 5,
  },
  leagueFilterRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 0,
    maxWidth: "100%",
  },
  leagueFilterText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    flexShrink: 1,
    minWidth: 0,
    letterSpacing: 0.2,
  },
  indexFilterBtn: {
    backgroundColor: "transparent",
    borderColor: "#2a3447",
    shadowOpacity: 0,
    elevation: 0,
    marginBottom: 16,
  },
  dateFilterRow: { gap: 8, paddingRight: 8, marginBottom: 16 },
  dateChip: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  dateChipActive: { backgroundColor: "#1e2a3b" },
  dateChipText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  dateChipTextActive: { color: "#93c5fd" },
  dateInputLabel: { fontSize: 13, fontWeight: "600", color: "#94a3b8", marginBottom: 6, marginTop: 12 },
  dateInput: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dateApplyBtn: { marginTop: 20 },
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
  leagueOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
  },
  leagueOptionText: { fontSize: 15, color: "#f1f5f9", flex: 1, marginRight: 12 },
});