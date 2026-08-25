import { View, Text, ScrollView, RefreshControl, Pressable, Modal, StyleSheet } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDashboardSummary, useDashboardPatterns, useDashboardPerformance } from "@/hooks/use-dashboard";
import { useLeagues } from "@/hooks/use-leagues";
import { DashboardStack, DashboardLoading, DashboardEmptyState } from "@/components/DashboardSlider";
import { SimpleLineChart } from "@/components/charts/SimpleLineChart";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { InfoButton } from "@/components/InfoTip";
import { shadows } from "@/lib/theme";

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
      <View style={styles.statTileHeader}>
        <Ionicons name={icon} size={13} color="#94a3b8" />
        <Text style={styles.statTileLabel} numberOfLines={1}>
          {label}
        </Text>
        {info && <InfoButton title={info.title} description={info.description} />}
      </View>
      <Text style={[styles.statTileValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function SummarySlide({ leagueId }: { leagueId?: number }) {
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
        <StatTile icon="trending-up-outline" label="Leg Win Rate" value={`${data.legWinRate.toFixed(1)}%`} />
        <StatTile icon="trophy-outline" label="Leg Wins" value={String(data.legWins)} />
        <StatTile icon="close-circle-outline" label="Leg Losses" value={String(data.legLosses)} />
        <StatTile icon="pulse-outline" label="Participation" value={`${(data.participationRate * 100).toFixed(0)}%`} />
        <StatTile
          icon="flash-outline"
          label="Power Score"
          value={data.powerScore.toFixed(2)}
          glowColor="#2563eb"
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
          valueColor={bar > 0 ? "#2563eb" : bar < 0 ? "#ef4444" : undefined}
          glowColor={bar > 0 ? "#2563eb" : bar < 0 ? "#ef4444" : undefined}
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
        <Text style={styles.slideTitleMeta}>{data.totalLegs} submitted</Text>
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
          <StatRow icon="person-outline" label="Favorite Prop Player" value={`${data.favoritePlayer.name} (${data.favoritePlayer.count})`} />
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

function PerformanceSlide({ leagueId }: { leagueId?: number }) {
  const { data, isLoading, error } = useDashboardPerformance(leagueId);

  if (isLoading) return <DashboardLoading message="Loading performance…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load performance data right now." />;

  const points = data.points
    .filter((p) => p.myWinRate !== null)
    .map((p) => ({ label: p.weekLabel, value: p.myWinRate as number }));

  if (points.length === 0) {
    return <DashboardEmptyState message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  return (
    <View>
      <Text style={styles.slideTitle}>Performance Over Time</Text>
      <SimpleLineChart points={points} formatValue={(v) => `${v.toFixed(1)}%`} />
    </View>
  );
}

function WeekOverWeekSlide({ leagueId }: { leagueId?: number }) {
  const { data, isLoading, error } = useDashboardPerformance(leagueId);

  if (isLoading) return <DashboardLoading message="Loading performance…" />;
  if (error || !data) return <DashboardEmptyState message="Couldn't load performance data right now." />;

  const points = data.points
    .filter((p) => p.allWeekWinRate !== null)
    .map((p) => ({ label: p.weekLabel, value: p.allWeekWinRate as number }));

  if (points.length === 0) {
    return <DashboardEmptyState message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  return (
    <View>
      <Text style={styles.slideTitle}>Weekly</Text>
      <SimpleBarChart points={points} formatValue={(v) => `${v.toFixed(1)}%`} />
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
  const selectedName = leagues.find((l) => l.id === selectedLeagueId)?.name ?? "All Leagues";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.leagueFilterBtn, pressed && { opacity: 0.85 }]}
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
              {selectedLeagueId === undefined && <Ionicons name="checkmark" size={18} color="#2563eb" />}
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
                {selectedLeagueId === league.id && <Ionicons name="checkmark" size={18} color="#2563eb" />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function DashScreen() {
  const { data: leagues } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | undefined>(undefined);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor="#2563eb" />}
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

        <DashboardStack
          slides={[
            { label: "Summary", content: <SummarySlide leagueId={selectedLeagueId} /> },
            { label: "My Analytics", content: <AnalyticsSlide leagueId={selectedLeagueId} /> },
            { label: "Performance", content: <PerformanceSlide leagueId={selectedLeagueId} /> },
            { label: "Weekly", content: <WeekOverWeekSlide leagueId={selectedLeagueId} /> },
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
  },
  statTileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 },
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
    marginHorizontal: -20,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  leagueFilterBtn: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#93c5fd",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 20,
    maxWidth: "100%",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 5,
  },
  leagueFilterRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
  },
  leagueFilterText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    flexShrink: 1,
    letterSpacing: 0.2,
  },
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