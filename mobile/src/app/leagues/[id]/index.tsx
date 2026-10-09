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
import { useState, useMemo, useEffect, useRef } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { apiRequest, API_BASE_URL } from "@/lib/api";
import {
  useLeagueStats,
  useLeagueRecords,
  useParlayLegsByIds,
  useMissedWeeks,
  useLeagueMembersWithUsers,
  useWeekLockStatus,
  useLockWeekParlay,
  useUnlockWeekParlay,
  useInviteByEmail,
  useLeagueDataStats,
  useRequestUnlock,
  useResolveUnlockRequest,
  useLeagueReports,
  useLeagueReport,
  type LeagueRecordEntry,
} from "@/hooks/use-leagues";
import type { ReportId } from "@shared/reports";
import {
  useAllLeagueParlaysForWeeks,
  useApproveParlay,
  useRejectParlay,
  useMyParlay,
  useSetParlayBoost,
} from "@/hooks/use-parlays";
import { BoostSheet } from "@/components/BoostSheet";
import { ShameReportModal } from "@/components/ShameReportModal";
import { canShameSeason } from "@shared/shameReport";
import { buildParlayStory } from "@shared/parlayStory";
import { heroLabelText as heroLabelFor, loserLabelText as loserLabelFor } from "@shared/leagueLabels";
import { sortParlayLegs } from "@shared/legOrder";
import { standingsText } from "@shared/standingsExport";
import { boostLabel } from "@shared/parlayBoost";
import { useConfirmParlayPlaced, useReopenParlay, useSuss } from "@/hooks/use-parlay-extras";
import { SussMeter } from "@/components/SussMeter";
import { parlaySlipText } from "@shared/betSlip";
import { useActiveWeek, useWeeks } from "@/hooks/use-weeks";
import { useEffectiveUserId } from "@/hooks/use-acting-as";
import { useAuth } from "@/hooks/use-auth";
import { useAppResume } from "@/hooks/use-app-resume";
import { format } from "date-fns";
import { SPORTSBOOK_PROVIDERS, pickDeepLinkGames, type SportsbookProvider, type DeepLinkGame } from "@shared/sportsbook-providers";
import type { ParlayWithLegs } from "@shared/schema";
import { getSlate } from "@shared/slate";
import { canConfirmPlaced, isParlayInProgress, isParlayLocked, legTally } from "@shared/parlayProgress";
import { LegsBySlate, LegRow, VoidLegRow, LegLookthroughSheet, legOwnerName } from "@/components/LegLookthrough";
import { webLeagueSettingsUrl } from "@/lib/pickHelpers";
import { shadows } from "@/lib/theme";
import { getOpenParlayVisualStyle, getParlayVisualStyle, getWinPctColor } from "@/lib/parlayVisuals";
import { getBustedLeg } from "@/lib/parlayLoser";
import { getHeroLeg } from "@/lib/parlayHero";
import { ParlayMixBar } from "@/components/ParlayMixBar";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MCIIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type ParlayLegWithGame = ParlayWithLegs["legs"][number];

type Tab = "parlays" | "members" | "stats" | "reports";

const TAB_LABELS: Record<Tab, string> = {
  parlays: "Parlays",
  members: "Members",
  stats: "Stats",
  reports: "Reports",
};

const TAB_ICONS: Record<Tab, React.ComponentProps<typeof Ionicons>["name"]> = {
  parlays: "documents-outline",
  members: "people-outline",
  stats: "bar-chart-outline",
  reports: "reader-outline",
};

/**
 * One report in a bottom sheet: its bars, then a button that shares the text
 * version (Messages, Copy, …). The pared-down mobile take on the web's
 * Reports page: no file downloads, and no Story Studio.
 */
/** The view as a PNG file, or null where the capture module isn't in this build (Expo Go). */
async function captureAsImage(view: View | null): Promise<string | null> {
  if (!view) return null;
  try {
    const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
    return await captureRef(view, { format: "png", quality: 1, result: "tmpfile" });
  } catch {
    return null;
  }
}

function ReportSheet({ leagueId, reportId, title, onClose }: { leagueId: number; reportId: ReportId | null; title: string; onClose: () => void }) {
  const { data: report, isLoading, isError } = useLeagueReport(leagueId, reportId);
  const graphicRef = useRef<View>(null);
  const [sharingImage, setSharingImage] = useState(false);

  // The graphic as a picture for the group chat. Falls back to the text
  // where a picture can't be made.
  async function shareImage() {
    if (!report || sharingImage) return;
    setSharingImage(true);
    try {
      const uri = await captureAsImage(graphicRef.current);
      await Share.share(uri ? { url: uri } : { message: report.text });
    } catch {
      // The share sheet was dismissed.
    } finally {
      setSharingImage(false);
    }
  }

  return (
    <LegLookthroughSheet visible={!!reportId} title={title} isLoading={isLoading} onClose={onClose}>
      {isError || !report ? (
        <Text style={styles.reportEmpty}>Couldn't load this report. Try again in a moment.</Text>
      ) : (
        <ScrollView style={{ flexGrow: 0 }}>
          {/* collapsable={false} keeps this a real native view, so it can be captured. */}
          <View ref={graphicRef} collapsable={false} style={styles.reportGraphic}>
            <Text style={styles.reportGraphicTitle}>{report.dataset.title}</Text>
            <Text style={styles.reportChartTitle}>{report.chart.title}</Text>
            {report.chart.bars.length === 0 ? (
              <Text style={styles.reportEmpty}>Nothing to chart yet.</Text>
            ) : (
              report.chart.bars.map((bar) => (
                <View key={bar.label} style={styles.reportBarRow} accessibilityLabel={`${bar.label}: ${bar.display}`}>
                  <Text style={styles.reportBarLabel} numberOfLines={1}>{bar.label}</Text>
                  <View style={styles.reportBarTrack}>
                    <View style={[styles.reportBarFill, { width: `${Math.max(0, Math.min(100, (bar.value / (report.chart.max || 1)) * 100))}%` }]} />
                  </View>
                  <Text style={styles.reportBarValue}>{bar.display}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={styles.reportText} selectable testID="text-report-sms">{report.text}</Text>
          <View style={styles.reportShareRow}>
            <Pressable
              onPress={shareImage}
              disabled={sharingImage}
              style={({ pressed }) => [styles.reportShareBtn, styles.reportShareBtnHalf, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              testID="button-report-share-image"
            >
              {sharingImage ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="image-outline" size={16} color="#ffffff" />}
              <Text style={styles.reportShareText}>Share as image</Text>
            </Pressable>
            <Pressable
              onPress={() => void Share.share({ message: report.text }).catch(() => undefined)}
              style={({ pressed }) => [styles.reportShareBtn, styles.reportShareBtnHalf, styles.reportShareBtnAlt, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              testID="button-report-share-text"
            >
              <Ionicons name="share-outline" size={16} color="#ffffff" />
              <Text style={styles.reportShareText}>Share as text</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </LegLookthroughSheet>
  );
}

/** The Parlays tab's filters, as they apply to one leg. Filters narrow the
 * legs shown inside each card; the cards themselves always stay. */
type LegFilter = { member: string; betType: string; result: string };

function legMatchesFilter(leg: { userId: string | null; betType: string; result: string | null }, filter: LegFilter): boolean {
  if (filter.member !== "all" && leg.userId !== filter.member) return false;
  if (filter.betType !== "all" && leg.betType !== filter.betType) return false;
  if (filter.result === "pending") return !leg.result;
  if (filter.result !== "all" && leg.result !== filter.result) return false;
  return true;
}

function ParlayCard({
  parlay,
  isAdmin,
  leagueId,
  weekId,
  preferredSportsbook,
  loserLabel,
  heroLabel,
  shameEmoji,
  legFilter,
  members,
  leagueName,
  bulk,
}: {
  parlay: ParlayWithLegs;
  /** Expand All / Collapse All from the top of the list: `n` changes on each press. */
  bulk?: { n: number; collapsed: boolean };
  leagueName?: string;
  isAdmin: boolean;
  leagueId: number;
  weekId: number;
  preferredSportsbook: SportsbookProvider | undefined;
  loserLabel?: string | null;
  heroLabel?: string | null;
  shameEmoji?: string | null;
  /** Narrows the legs listed inside the card. The header, tally and mix bar
   * always describe the whole parlay. */
  legFilter: LegFilter;
  members: any[] | undefined;
}) {
  const router = useRouter();
  const effectiveUserId = useEffectiveUserId();
  const approveParlay = useApproveParlay(leagueId, weekId);
  const rejectParlay = useRejectParlay(leagueId, weekId);
  // A card mounted after the last Expand All / Collapse All takes that state.
  const [collapsed, setCollapsed] = useState(bulk && bulk.n > 0 ? bulk.collapsed : true);
  useEffect(() => {
    if (bulk && bulk.n > 0) setCollapsed(bulk.collapsed);
  }, [bulk?.n]);
  // The Suss Meter shows on an open parlay's picks (votes are cast on the pick screen).
  const { data: suss } = useSuss(leagueId, parlay.weekId, parlay.status === "draft");
  const confirmPlaced = useConfirmParlayPlaced(leagueId);
  const reopenParlay = useReopenParlay(leagueId);
  const [boostOpen, setBoostOpen] = useState(false);
  const setBoost = useSetParlayBoost(leagueId, weekId);
  // Same rule the server enforces: the parlay's owner or the Parlay Maestro.
  const boostEditable = isAdmin || parlay.userId === effectiveUserId;
  // The boost control only shows once the card is expanded to its legs.
  const showBoostChip = !collapsed && parlay.status !== "void" && (!!parlay.boostPct || boostEditable);
  const [shameOpen, setShameOpen] = useState(false);
  const currentSeason = useActiveWeek()?.season;
  // Multi-game "Send to Sportsbook" walkthrough — set only when the parlay
  // spans 2+ distinct games, since a single game keeps the original one-shot
  // deep link. Advances on app-resume (see useAppResume below); there's no
  // callback from the sportsbook app, so "the user came back" is the only
  // signal available that a step is done.
  const [walkthroughGames, setWalkthroughGames] = useState<DeepLinkGame[] | null>(null);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);
  const [walkthroughProvider, setWalkthroughProvider] = useState<Exclude<SportsbookProvider, "other"> | null>(null);

  const name =
    parlay.user?.settings?.displayName ??
    parlay.user?.firstName ??
    parlay.user?.email ??
    "Unknown";

  const legs = parlay.legs ?? [];
  const filtering = legFilter.member !== "all" || legFilter.betType !== "all" || legFilter.result !== "all";
  // In the order that fits where the parlay is (shared/legOrder.ts), then
  // narrowed by the tab's filters.
  const shownLegs = sortParlayLegs(parlay).filter((l) => legMatchesFilter(l, legFilter));
  // Members with no bet in a parlay that's past picking are Void for it.
  // Left out while a result or bet-type filter is on: a Void has neither.
  const voidMembers =
    parlay.status === "draft" || parlay.status === "void" || legFilter.betType !== "all" || legFilter.result !== "all"
      ? []
      : (members ?? []).filter(
          (m: any) =>
            m.isActive !== false &&
            !legs.some((l) => l.userId === m.userId) &&
            (legFilter.member === "all" || legFilter.member === m.userId) &&
            // Only members who were in the league when the parlay was made.
            (!m.startDate || !parlay.createdAt || new Date(m.startDate) <= new Date(parlay.createdAt)),
        );
  const { pct, label: tallyLabel } = legTally(legs);
  const visual = getParlayVisualStyle(pct, 1);
  // Until a leg is decided there's no win % to color by, so an open parlay
  // shows its status instead: light blue while pending, a glow once active.
  const openVisual = pct === null ? getOpenParlayVisualStyle(parlay.status) : null;
  const pctColor = pct !== null ? (([r, g, b]) => `rgb(${r}, ${g}, ${b})`)(getWinPctColor(pct)) : "#64748b";

  const bustedLeg = getBustedLeg(parlay);
  const heroLeg = getHeroLeg(parlay);
  const loserLabelText = loserLabelFor(loserLabel);
  const heroLabelText = heroLabelFor(heroLabel);
  const heroMemberName = heroLeg?.user
    ? heroLeg.user.settings?.displayName ?? heroLeg.user.firstName ?? heroLeg.user.email ?? "Unknown"
    : name;
  // Whoever placed the leg that lost first, not whoever started the parlay.
  const loserMemberName = bustedLeg?.user
    ? bustedLeg.user.settings?.displayName ?? bustedLeg.user.firstName ?? bustedLeg.user.email ?? "Unknown"
    : name;

  // A settled parlay from the season being played has a report: the Shame
  // Report if it lost, The Locks Report if it won. Built on demand, when
  // it's opened.
  const thisSeason = canShameSeason(parlay.week?.season, currentSeason);
  const canShame = !!bustedLeg && thisSeason;
  const canLocks = !!heroLeg && thisSeason;
  const story = shameOpen
    ? buildParlayStory({
        legs,
        bustedLegId: bustedLeg?.id,
        heroLegId: heroLeg?.id,
        nameOf: (l) => l.user?.settings?.displayName ?? l.user?.firstName ?? l.user?.email ?? "Unknown",
        weekLabel: parlay.week?.label ?? `Week ${parlay.weekId}`,
        loserLabel,
        heroLabel,
        shameEmoji,
      })
    : null;

  // getSlate buckets by kickoff time, not finish time, so this must use the
  // decisive leg's game.gameTime — not decidedAt/finishedAt (see web's
  // ParlayRollupCard.tsx for the matching fix).
  const decisiveLeg = bustedLeg ?? heroLeg;
  const decidedSlate = decisiveLeg?.game?.gameTime ? getSlate(new Date(decisiveLeg.game.gameTime)) : null;

  // Only the statuses the Maestro acts on get an icon. Every other parlay
  // used to fall through to a clock, which sat on settled parlays too and
  // meant nothing there; the status line and the tally already say it.
  const statusIcon =
    parlay.status === "approved"
      ? ("checkmark-circle" as const)
      : parlay.status === "rejected"
      ? ("close-circle" as const)
      : parlay.status === "sent"
      ? ("paper-plane-outline" as const)
      : parlay.status === "placed"
      ? ("checkmark-done-circle" as const)
      : null;

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

  // Locked: closed to picks and not settled yet.
  const locked = isParlayLocked(parlay);
  // Once a game on the ticket kicks off, an open parlay is simply in progress.
  const statusLabel = isParlayInProgress(parlay)
    ? "In progress"
    : parlay.status === "placed"
      ? "Placed"
      : locked
      ? "Locked"
      : parlay.status === "draft"
      ? "Open"
      : parlay.status;

  const canModerate = isAdmin && parlay.status === "pending" && !isParlayInProgress(parlay);
  // Only a locked parlay goes to a sportsbook, and any member can take it
  // there: an open one can still change, a settled one is over.
  const canSendToSportsbook = locked;

  const slipText = () =>
    parlaySlipText({ leagueName, weekLabel: parlay.week?.label, legs: sortParlayLegs(parlay) });

  // There's no callback from a sportsbook, so the member says so themselves.
  function askIfPlaced() {
    if (!canConfirmPlaced(parlay)) return;
    Alert.alert("Did you place this bet?", "Marking it placed tells the league the parlay is in. Any member can confirm.", [
      { text: "Not yet", style: "cancel" },
      { text: "Yes, it's placed", onPress: () => markPlaced() },
    ]);
  }
  function markPlaced() {
    confirmPlaced.mutate(parlay.id, {
      onError: (err: Error) => Alert.alert("Couldn't mark it placed", err.message || "Please try again."),
    });
  }
  function confirmReopen() {
    Alert.alert(
      "Bust and reopen this parlay?",
      "It goes back to open and the week unlocks, so picks can change again. Picks on games that have already started stay as they are.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Bust & reopen",
          style: "destructive",
          onPress: () =>
            reopenParlay.mutate(parlay.id, {
              onError: (err: Error) => Alert.alert("Couldn't reopen it", err.message || "Please try again."),
            }),
        },
      ],
    );
  }

  // Opens one game's deep link, falling back to the provider's website if
  // the app isn't installed or the link fails. Returns whether the deep
  // link itself opened (vs. the web fallback) — only a real app-open counts
  // as evidence the maestro is actually staging the bet.
  async function openGameDeepLink(provider: (typeof SPORTSBOOK_PROVIDERS)[keyof typeof SPORTSBOOK_PROVIDERS], game: DeepLinkGame | null): Promise<boolean> {
    const deepLinkUrl = game ? provider.buildGameDeepLink(game) : `${provider.appScheme}://`;
    try {
      const canOpen = await Linking.canOpenURL(deepLinkUrl);
      if (canOpen) {
        await Linking.openURL(deepLinkUrl);
        return true;
      }
    } catch {
      // fall through to web fallback below
    }
    // App not installed or the deep link failed — best-effort web rescue.
    await Linking.openURL(provider.webFallbackUrl);
    return false;
  }

  // Once the app resumes after the walkthrough's last step, advance to the
  // next leg — or, if that was the last one, mark the parlay sent, mirroring
  // the original single-leg behavior (mark sent as soon as the last deep
  // link opens). There's no callback from the sportsbook app, so a resume is
  // the only signal available that the user is done with that step.
  useAppResume(() => {
    if (!walkthroughGames) return;
    const nextIndex = walkthroughIndex + 1;
    if (nextIndex >= walkthroughGames.length) {
      setWalkthroughGames(null);
      setWalkthroughProvider(null);
      askIfPlaced();
      return;
    }
    setWalkthroughIndex(nextIndex);
    if (walkthroughProvider) {
      void openGameDeepLink(SPORTSBOOK_PROVIDERS[walkthroughProvider], walkthroughGames[nextIndex]);
    }
  });

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
        "We don't have a direct link for a custom sportsbook yet. Copy the parlay, enter it in your sportsbook app, then mark it placed here.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Copy the parlay", onPress: () => void Share.share({ message: slipText() }).catch(() => undefined) },
        ],
      );
      return;
    }

    const provider = SPORTSBOOK_PROVIDERS[preferredSportsbook];
    const games = pickDeepLinkGames(parlay.legs ?? []);

    if (games.length <= 1) {
      // Common case, unchanged: one deep link (or the bare app-open if no
      // leg resolves to a game), marking sent only on a real app-open.
      // The member confirms it's placed themselves, once they're back.
      await openGameDeepLink(provider, games[0] ?? null);
      return;
    }

    // Multiple distinct games — start the walkthrough at leg 1 of N.
    setWalkthroughProvider(preferredSportsbook);
    setWalkthroughGames(games);
    setWalkthroughIndex(0);
    await openGameDeepLink(provider, games[0]);
  }

  return (
    <View style={[styles.parlayCardShadowWrap, openVisual?.glowColor && shadows.glow(openVisual.glowColor, 0.45)]}>
    <View
      style={[
        styles.parlayCard,
        { borderColor: openVisual?.borderColor ?? visual.borderColor },
        openVisual?.backgroundColor && { backgroundColor: openVisual.backgroundColor },
      ]}
    >
      {/* Faint result-colored wash over the whole card. */}
      {!openVisual && visual.tintColor && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: visual.tintColor }]} />
      )}
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
                    {loserLabelText}: {loserMemberName}
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
          <Text style={[styles.parlayCardFraction, { color: pctColor }]}>{tallyLabel}</Text>
        )}

        {statusIcon && <Ionicons name={statusIcon} size={22} color={statusColor} />}
      </Pressable>

      {/* Bet-type mix stays visible when collapsed — it's the at-a-glance summary. */}
      <View style={styles.mixBarWrap}>
        <ParlayMixBar legs={legs} />
      </View>

      {/* Promo boost: a rocket, on the expanded card only. Lit when a boost
          is set; tapping it opens the boost sheet for whoever can set it. */}
      {(showBoostChip || canShame || canLocks) && (
        <View style={styles.cardChipRow}>
          {showBoostChip && (
            <Pressable
              onPress={() => setBoostOpen(true)}
              disabled={!boostEditable}
              style={({ pressed }) => [
                styles.boostChip,
                !!parlay.boostPct && styles.boostChipActive,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={parlay.boostPct ? `Parlay Boost: ${boostLabel(parlay.boostPct)}` : "Add a Parlay Boost"}
              testID={`button-parlay-boost-${parlay.id}`}
            >
              <Text style={styles.boostChipText}>🚀</Text>
            </Pressable>
          )}
          {canShame && (
            <Pressable
              onPress={() => setShameOpen(true)}
              style={({ pressed }) => [styles.boostChip, styles.shameChip, pressed && { opacity: 0.7 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open the shame report"
              testID={`button-shame-report-${parlay.id}`}
            >
              <Text style={[styles.boostChipText, styles.shameChipText]}>{shameEmoji || "🚨"} Shame report</Text>
            </Pressable>
          )}
          {canLocks && (
            <Pressable
              onPress={() => setShameOpen(true)}
              style={({ pressed }) => [styles.boostChip, styles.locksChip, pressed && { opacity: 0.7 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open The Locks Report"
              testID={`button-locks-report-${parlay.id}`}
            >
              <Text style={[styles.boostChipText, styles.locksChipText]}>🔒 Locks report</Text>
            </Pressable>
          )}
        </View>
      )}
      {story && (
        <ShameReportModal story={story} visible={shameOpen} onClose={() => setShameOpen(false)} />
      )}
      <BoostSheet
        visible={boostOpen}
        onClose={() => setBoostOpen(false)}
        initialPct={parlay.boostPct}
        saving={setBoost.isPending}
        onConfirm={(boostPct) =>
          setBoost.mutate(
            { parlayId: parlay.id, boostPct },
            {
              onSuccess: () => setBoostOpen(false),
              onError: (err: Error) => Alert.alert("Couldn't save boost", err.message || "Please try again."),
            },
          )
        }
      />

      {!collapsed && (legs.length > 0 || voidMembers.length > 0) && (
        <View style={styles.legsSection}>
          {filtering && (
            <Text style={styles.legFilterNote} testID={`text-leg-filter-${parlay.id}`}>
              {shownLegs.length === 0 && voidMembers.length === 0
                ? "No legs in this parlay match the filters."
                : `Showing ${shownLegs.length} of ${legs.length} leg${legs.length !== 1 ? "s" : ""}`}
            </Text>
          )}
          <LegsBySlate
            legs={shownLegs}
            renderLeg={(leg: ParlayLegWithGame) => (
              <LegRow
                key={leg.id}
                leg={leg}
                ownerName={legOwnerName(leg.user)}
                week={parlay.week}
                // Your own bet is a link to the dispute sheet. Nobody can
                // dispute a bet on someone else's behalf.
                disputable={leg.userId === effectiveUserId}
                trailing={parlay.status === "draft" ? <SussMeter tally={suss?.[leg.id]} /> : undefined}
              />
            )}
          />
          {voidMembers.map((m: any) => (
            <VoidLegRow key={m.userId} ownerName={memberDisplayName(m)} />
          ))}
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

      {canSendToSportsbook && !collapsed && (
        <View style={styles.placementBlock} testID={`placement-${parlay.id}`}>
          <View style={styles.moderationRow}>
            <Pressable
              style={({ pressed }) => [styles.copyButton, pressed && styles.moderationButtonPressed]}
              onPress={() => void Share.share({ message: slipText() }).catch(() => undefined)}
              accessibilityRole="button"
              accessibilityLabel="Copy or share this parlay as text"
              testID={`button-copy-parlay-${parlay.id}`}
            >
              <Ionicons name="copy-outline" size={16} color="#cbd5e1" />
              <Text style={styles.copyButtonText}>Copy parlay</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sendButton, pressed && styles.moderationButtonPressed]}
              onPress={handleSendToSportsbook}
              accessibilityRole="button"
              testID={`button-send-sportsbook-${parlay.id}`}
            >
              <Ionicons name="send-outline" size={16} color="#f1f5f9" />
              <Text style={styles.sendButtonText}>Open Sportsbook</Text>
            </Pressable>
          </View>
          <View style={styles.moderationRow}>
            {parlay.status === "placed" ? (
              <View style={styles.placedNote}>
                <Ionicons name="checkmark-done-circle" size={16} color="#22c55e" />
                <Text style={styles.placedNoteText}>Placed</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.approveButton, pressed && styles.moderationButtonPressed]}
                onPress={markPlaced}
                disabled={confirmPlaced.isPending}
                accessibilityRole="button"
                testID={`button-confirm-placed-${parlay.id}`}
              >
                {confirmPlaced.isPending ? (
                  <ActivityIndicator size="small" color="#f1f5f9" />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#f1f5f9" />
                )}
                <Text style={styles.approveButtonText}>I placed this bet</Text>
              </Pressable>
            )}
            {isAdmin && (
              <Pressable
                style={({ pressed }) => [styles.rejectButton, pressed && styles.moderationButtonPressed]}
                onPress={confirmReopen}
                disabled={reopenParlay.isPending}
                accessibilityRole="button"
                testID={`button-reopen-parlay-${parlay.id}`}
              >
                <Ionicons name="refresh" size={16} color="#ef4444" />
                <Text style={styles.rejectButtonText}>Bust & reopen</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {walkthroughGames && walkthroughProvider && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setWalkthroughGames(null)}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setWalkthroughGames(null)} />
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>
                Leg {walkthroughIndex + 1} of {walkthroughGames.length}
              </Text>
              <Text style={styles.walkthroughMatchup}>
                {walkthroughGames[walkthroughIndex].awayTeam} @ {walkthroughGames[walkthroughIndex].homeTeam}
              </Text>
              <Text style={styles.modalSubtitle}>
                Add this game's bet in {SPORTSBOOK_PROVIDERS[walkthroughProvider].label}, then come back here for the
                next leg.
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    setWalkthroughGames(null);
                    setWalkthroughProvider(null);
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalConfirm, pressed && { opacity: 0.85 }]}
                  onPress={() => openGameDeepLink(SPORTSBOOK_PROVIDERS[walkthroughProvider!], walkthroughGames[walkthroughIndex])}
                >
                  <Text style={styles.modalConfirmText}>
                    Open in {SPORTSBOOK_PROVIDERS[walkthroughProvider].label}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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

/** Compact tile label: "T. Holland" when a first + last name are both
 * known, otherwise falls back to the regular display name/email. */
function memberShortName(member: any): string {
  const first = member.user?.firstName;
  const last = member.user?.lastName;
  if (first && last) return `${first.charAt(0)}. ${last}`;
  return memberDisplayName(member);
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

type MemberSortKey = "powerScore" | "winRate" | "record" | "participationRate";
type SortDir = "asc" | "desc";

const MEMBER_SORT_COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "powerScore", label: "Power" },
  { key: "winRate", label: "Win %" },
  { key: "record", label: "Record" },
  { key: "participationRate", label: "Part. %" },
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
    participationRate: number;
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
      <Text style={styles.memberStatCol} numberOfLines={1}>{Math.round(member.participationRate * 100)}%</Text>
    </View>
  );
}

type StandingsScope = "season" | "all";

const STANDINGS_SCOPES: { key: StandingsScope; label: string }[] = [
  { key: "season", label: "Current Year" },
  { key: "all", label: "All Time" },
];

function MembersTable({
  members,
  stats,
  leagueName,
  scopeLabel,
}: {
  members: any[];
  stats: any[] | undefined;
  leagueName: string;
  scopeLabel: string;
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
      participationRate: stat?.participationRate ?? 0,
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

  // Sends the standings as text, always ranked by win rate, however the
  // grid happens to be sorted. The share sheet covers both Copy and Messages.
  function shareStandings() {
    void Share.share({
      message: standingsText({ leagueName, scopeLabel, rows: sortedRows.map((r) => ({ ...r, username: r.name })) }),
    }).catch(() => undefined);
  }

  return (
    <View>
      <Pressable
        onPress={shareStandings}
        style={({ pressed }) => [styles.shareStandingsBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Share ${scopeLabel} standings as text`}
        testID="button-share-standings"
      >
        <Ionicons name="share-outline" size={14} color="#93c5fd" />
        <Text style={styles.shareStandingsText}>Share {scopeLabel} standings</Text>
      </Pressable>
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

/** Icon for each record tile, keyed by the record's stable `key` (not its
 * renameable title/description text). Most are Ionicons, matching the rest
 * of the app's icon set; a few (no Ionicons equivalent) fall back to
 * MaterialCommunityIcons — see RECORD_ICONS_MCI below. Web has its own
 * lucide-based mapping (LEAGUE_RECORD_ICONS in client/src/pages/LeagueDetail.tsx)
 * since lucide lacks matches for those same few. */
const RECORD_ICONS: Record<string, IconName> = {
  highestSingleLegOdds: "flash-outline",
  longestWinStreak: "fish-outline",
  juiceman: "water-outline",
  mostParlayLosses: "thumbs-down-outline",
  favoriteTeam: "shield-outline",
  favoritePlayer: "person-outline",
  appointmentViewing: "tv-outline",
  weakLine: "battery-dead-outline",
};

/** Records whose icon comes from MaterialCommunityIcons instead — Ionicons
 * has no baseball bat, alien head, crucifix, or finger-guns glyph (the
 * closest MCI has for "finger guns" is a pointed pistol). Checked before
 * RECORD_ICONS in LeagueRecordTile. */
const RECORD_ICONS_MCI: Record<string, MCIIconName> = {
  highestSingleLegOddsWon: "baseball-bat",
  highestParlayOdds: "alien-outline",
  longestLossStreak: "cross-outline",
  favoriteBetType: "pistol",
};

function formatRecordDateRange(range: LeagueRecordEntry["dateRange"]): string | null {
  if (!range?.start || !range?.end) return null;
  const start = format(new Date(range.start), "MMM d");
  const end = format(new Date(range.end), "MMM d");
  return start === end ? start : `${start} – ${end}`;
}

function LeagueRecordIcon({ recordKey, size, color }: { recordKey: string; size: number; color: string }) {
  const mciName = RECORD_ICONS_MCI[recordKey];
  if (mciName) return <MaterialCommunityIcons name={mciName} size={size} color={color} />;
  return <Ionicons name={RECORD_ICONS[recordKey] ?? "trophy-outline"} size={size} color={color} />;
}

function LeagueRecordTile({ record, members, onLookthrough }: { record: LeagueRecordEntry; members: any[] | undefined; onLookthrough: (record: LeagueRecordEntry) => void }) {
  const holder = record.holderUserId ? members?.find((m) => m.userId === record.holderUserId) : null;
  const holderName = holder ? memberShortName(holder) : null;
  const weekLabel = record.week ? `${record.week.label}, ${record.week.season}` : null;
  const dateRangeLabel = formatRecordDateRange(record.dateRange);
  const winLossLabel = record.winLoss
    ? `${record.winLoss.wins}-${record.winLoss.losses} (${((record.winLoss.wins / (record.winLoss.wins + record.winLoss.losses || 1)) * 100).toFixed(1)}%)`
    : null;
  const hasLookthrough = record.legIds.length > 0 || record.lookthroughKind === "participation";

  return (
    <Pressable
      style={({ pressed }) => [styles.recordTile, hasLookthrough && pressed && { opacity: 0.7 }]}
      onPress={hasLookthrough ? () => onLookthrough(record) : undefined}
      disabled={!hasLookthrough}
      testID={`card-league-record-${record.key}`}
    >
      <View style={styles.recordBody}>
        {record.title ? (
          <>
            <View style={styles.recordTitleRow}>
              <LeagueRecordIcon recordKey={record.key} size={14} color="#2563eb" />
              <Text style={styles.recordTitle} numberOfLines={1}>{record.title}</Text>
            </View>
            {!!record.label && (
              <Text style={styles.recordLabel} numberOfLines={2}>{record.label}</Text>
            )}
          </>
        ) : (
          <View style={styles.recordTitleRow}>
            <LeagueRecordIcon recordKey={record.key} size={13} color="#94a3b8" />
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
      {/* The viewer's own figure for this category — a footnote to the
          record, so it stays small. */}
      {record.viewerValue !== undefined && (
        <View style={styles.recordViewerRow} testID={`text-record-viewer-${record.key}`}>
          {record.viewerIsHolder ? (
            <Text style={styles.recordViewerValue} numberOfLines={1}>That's You Silly!</Text>
          ) : (
            <>
              <Text style={styles.recordViewerLabel}>{record.viewerLabel ?? "...and for you..."}</Text>
              <Text style={styles.recordViewerValue} numberOfLines={1}>{record.viewerValue ?? "—"}</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("parlays");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  // Expand all / Collapse all for the Parlays tab's cards.
  const [bulk, setBulk] = useState({ n: 0, collapsed: true });
  const [memberFilter, setMemberFilter] = useState("all");
  const [betTypeFilter, setBetTypeFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [standingsScope, setStandingsScope] = useState<StandingsScope>("season");
  const activeWeek = useActiveWeek();
  const effectiveUserId = useEffectiveUserId();
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
        shameEmoji?: string | null;
      }>("GET", `/api/leagues/${leagueId}`),
    enabled: !!leagueId,
  });

  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = useLeagueMembersWithUsers(leagueId);
  const isAdmin = !!members?.some((m: any) => m.userId === effectiveUserId && m.role === "admin");
  // The signed-in user's own preference, even while acting for someone
  // else: it decides which app opens on this phone, and it's the one the
  // Settings screen edits.
  const preferredSportsbook = (user?.settings as any)?.preferredSportsbook as SportsbookProvider | undefined;
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useLeagueStats(leagueId);
  const { data: dataStats, refetch: refetchDataStats } = useLeagueDataStats(leagueId);
  const memberStats = standingsScope === "season" ? dataStats?.currentSeasonStandings : dataStats?.allTimeStandings ?? stats;
  const { data: leagueRecords, isLoading: recordsLoading } = useLeagueRecords(leagueId);
  const [lookthroughRecord, setLookthroughRecord] = useState<LeagueRecordEntry | null>(null);
  const isParticipationLookthrough = lookthroughRecord?.lookthroughKind === "participation";
  const { data: lookthroughLegs, isLoading: loadingLookthrough } = useParlayLegsByIds(
    leagueId,
    !isParticipationLookthrough ? lookthroughRecord?.legIds ?? [] : [],
  );
  const { data: missedWeeksData, isLoading: loadingMissedWeeks } = useMissedWeeks(
    leagueId,
    isParticipationLookthrough ? lookthroughRecord?.holderUserId ?? null : null,
  );

  const weekId = activeWeek?.id ?? 0;
  // The Parlays tab shows every open/closed bet from this season + last
  // season (not just the active week) — same "this year + last year" scope
  // used on the Your Picks tab (mobile/src/app/(tabs)/picks.tsx).
  const { data: allWeeks } = useWeeks();
  const parlayTabWeekIds = useMemo(() => {
    if (!activeWeek || !allWeeks) return [];
    return allWeeks.filter((w) => w.season >= activeWeek.season - 1).map((w) => w.id);
  }, [allWeeks, activeWeek]);
  const {
    data: parlaysPage,
    isLoading: parlaysLoading,
    refetch: refetchParlays,
  } = useAllLeagueParlaysForWeeks(leagueId, parlayTabWeekIds);
  const parlays = parlaysPage?.items;
  const { data: lockStatus, refetch: refetchLock } = useWeekLockStatus(leagueId, weekId);
  const { data: myParlay } = useMyParlay(leagueId, weekId);
  const lockWeek = useLockWeekParlay(leagueId, weekId);
  const unlockWeek = useUnlockWeekParlay(leagueId, weekId);
  const requestUnlock = useRequestUnlock(leagueId, weekId);
  const resolveUnlockRequest = useResolveUnlockRequest(leagueId, weekId);
  // Lock: whoever started the week's parlay, the Maestro, or a lieutenant
  // with the permission. Unlock: the Maestro or a permitted lieutenant.
  const canLock = lockStatus?.viewer?.canLock ?? isAdmin;
  const canUnlock = lockStatus?.viewer?.canUnlock ?? isAdmin;
  const { data: reportCatalog, isLoading: reportsLoading } = useLeagueReports(leagueId, activeTab === "reports");
  const [openReportId, setOpenReportId] = useState<ReportId | null>(null);
  const inviteByEmail = useInviteByEmail(leagueId);

  const leagueName = league?.name ?? "League";
  const isLocked = !!lockStatus?.isLocked;
  // Locked and the first game has kicked off: the lock can't be lifted.
  const inProgress = !!lockStatus?.inProgress;
  const canBuild = !!activeWeek && !isLocked;
  // Members put their legs into one shared parlay, so "did I get a pick in"
  // is about having a leg in it — for whoever is being acted for, when a
  // super user is acting for someone.
  const missedLock = isLocked && !!effectiveUserId && !!lockStatus?.missingMemberIds?.includes(effectiveUserId);
  const activeFilterCount = [memberFilter, betTypeFilter, resultFilter].filter((f) => f !== "all").length;

  const memberOptions = [
    { key: "all", label: "All Members" },
    ...(effectiveUserId ? [{ key: "me", label: "Just Me" }] : []),
    ...(members ?? []).map((m: any) => ({ key: m.userId, label: memberDisplayName(m) })),
  ];
  // "me" is a stand-in for the caller's own userId — resolved here rather
  // than storing the real id in state, so the chip stays labeled "Just Me"
  // instead of showing the user's own name once selected.
  const effectiveMemberFilter = memberFilter === "me" ? (effectiveUserId ?? "me") : memberFilter;
  const filtersActive = memberFilter !== "all" || betTypeFilter !== "all" || resultFilter !== "all";
  // The filters work on legs, like the web's: every parlay card stays, and
  // each lists only the legs that match (see ParlayCard's legFilter).
  const legFilter: LegFilter = { member: effectiveMemberFilter, betType: betTypeFilter, result: resultFilter };

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
            {inProgress ? (
              <View style={styles.progressPill}>
                <Ionicons name="play-circle-outline" size={12} color="#38bdf8" />
                <Text style={styles.progressPillText}>In Progress</Text>
              </View>
            ) : isLocked ? (
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
        {(isAdmin || canLock || canUnlock) && activeWeek && activeTab === "parlays" && (
          <View style={styles.adminBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminBarText}>
                {lockStatus?.submittedCount ?? 0} / {lockStatus?.totalMembers ?? members?.length ?? "—"} submitted
              </Text>
              {!isLocked && !!lockStatus?.missingMemberIds?.length && (
                <Text style={styles.adminBarWaiting} numberOfLines={2} testID="text-waiting-on">
                  Waiting on:{" "}
                  {(members ?? [])
                    .filter((m: any) => lockStatus.missingMemberIds.includes(m.userId))
                    .map((m: any) => memberShortName(m))
                    .sort((x: string, y: string) => x.localeCompare(y))
                    .join(", ")}
                </Text>
              )}
            </View>
            {inProgress ? (
              <Text style={styles.adminBarWaiting} testID="text-lock-final">Picks are final</Text>
            ) : isLocked && !canUnlock ? (
              <Text style={styles.adminBarWaiting}>Locked</Text>
            ) : !isLocked && !canLock ? null : isLocked ? (
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

        {/* Unlock requests waiting on whoever can unlock. */}
        {canUnlock && activeTab === "parlays" && (lockStatus?.openUnlockRequests ?? []).map((r) => (
          <View key={r.id} style={styles.unlockRequestBar} testID={`row-unlock-request-${r.id}`}>
            <Text style={styles.unlockRequestText} numberOfLines={2}>
              {r.requestedByName} asked for an unlock{r.reason ? `: "${r.reason}"` : ""}
            </Text>
            <Pressable
              onPress={() => resolveUnlockRequest.mutate({ requestId: r.id, action: "grant" }, { onError: (err: Error) => Alert.alert("Couldn't unlock", err.message) })}
              disabled={resolveUnlockRequest.isPending}
              style={({ pressed }) => [styles.adminActionBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.adminActionText}>Unlock</Text>
            </Pressable>
            <Pressable
              onPress={() => resolveUnlockRequest.mutate({ requestId: r.id, action: "dismiss" })}
              disabled={resolveUnlockRequest.isPending}
              hitSlop={8}
            >
              <Text style={styles.clearFiltersText}>Dismiss</Text>
            </Pressable>
          </View>
        ))}

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(["parlays", "stats", "members", "reports"] as Tab[]).map((tab) => {
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
                activeTab === "reports" ? reportsLoading :
                statsLoading
              }
              onRefresh={() => {
                if (activeTab === "parlays") {
                  refetchParlays();
                  refetchLock();
                } else if (activeTab === "members") {
                  refetchMembers();
                  refetchDataStats();
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
                    {!myParlay
                      ? "Start This Week's Parlay"
                      : myParlay.status !== "draft"
                        ? "View This Week's Parlay"
                        : myParlay.legs.some((l) => l.userId === effectiveUserId)
                          ? "Parlay is Open! · Change Your Pick"
                          : "Parlay is Open! · Make Your Pick"}
                  </Text>
                </Pressable>
              )}
              {missedLock && (
                <View style={styles.missedBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
                  <Text style={styles.missedBannerText}>
                    This week is locked and you didn't submit a pick.
                  </Text>
                </View>
              )}
              {/* A member who can't unlock asks whoever can. */}
              {lockStatus?.viewer?.canRequestUnlock && (
                lockStatus.viewer.hasOpenRequest ? (
                  <View style={styles.missedBanner} testID="text-unlock-requested">
                    <Ionicons name="time-outline" size={16} color="#f59e0b" />
                    <Text style={styles.missedBannerText}>Unlock requested. Waiting on the Parlay Maestro.</Text>
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.requestUnlockBtn, pressed && { opacity: 0.7 }]}
                    disabled={requestUnlock.isPending}
                    onPress={() =>
                      Alert.alert("Request an unlock?", "The Parlay Maestro will be asked to reopen this week so picks can change.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Send request",
                          onPress: () => requestUnlock.mutate(undefined, { onError: (err: Error) => Alert.alert("Couldn't send the request", err.message) }),
                        },
                      ])
                    }
                    accessibilityRole="button"
                    testID="button-request-unlock"
                  >
                    <Ionicons name="lock-open-outline" size={15} color="#93c5fd" />
                    <Text style={styles.requestUnlockText}>Request unlock</Text>
                  </Pressable>
                )
              )}
              {!parlaysLoading && parlays && parlays.length > 0 && (
                <View style={styles.filterSection}>
                  <View style={styles.filterSectionHeader}>
                    <Pressable
                      onPress={() => setFiltersOpen((v) => !v)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.filterToggle, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: filtersOpen }}
                      testID="button-toggle-parlay-filters"
                    >
                      <Ionicons name="filter-outline" size={14} color={filtersActive ? "#93c5fd" : "#94a3b8"} />
                      <Text style={[styles.filterToggleText, filtersActive && { color: "#93c5fd" }]}>
                        {filtersOpen ? "Hide filters" : "Filters"}
                        {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                      </Text>
                      <Ionicons name={filtersOpen ? "chevron-up" : "chevron-down"} size={14} color="#64748b" />
                    </Pressable>
                    {parlays.length > 1 && (
                      <View style={styles.bulkControls}>
                        <Pressable
                          onPress={() => setBulk((b) => ({ n: b.n + 1, collapsed: false }))}
                          hitSlop={8}
                          style={({ pressed }) => [styles.bulkBtn, pressed && { opacity: 0.7 }]}
                          accessibilityRole="button"
                          accessibilityLabel="Expand all parlays"
                          testID="button-expand-all"
                        >
                          <Ionicons name="chevron-down" size={13} color="#94a3b8" />
                          <Text style={styles.bulkBtnText}>Expand all</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setBulk((b) => ({ n: b.n + 1, collapsed: true }))}
                          hitSlop={8}
                          style={({ pressed }) => [styles.bulkBtn, pressed && { opacity: 0.7 }]}
                          accessibilityRole="button"
                          accessibilityLabel="Collapse all parlays"
                          testID="button-collapse-all"
                        >
                          <Ionicons name="chevron-up" size={13} color="#94a3b8" />
                          <Text style={styles.bulkBtnText}>Collapse all</Text>
                        </Pressable>
                      </View>
                    )}
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
                  {filtersOpen && (
                    <>
                      <FilterChipRow options={memberOptions} selected={memberFilter} onSelect={setMemberFilter} />
                      <View style={styles.filterRowDivider} />
                      <FilterChipRow options={BET_TYPE_FILTERS} selected={betTypeFilter} onSelect={setBetTypeFilter} />
                      <View style={styles.filterRowDivider} />
                      <FilterChipRow options={RESULT_FILTERS} selected={resultFilter} onSelect={setResultFilter} />
                    </>
                  )}
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
                    loserLabel={league?.loserLabel}
                    heroLabel={league?.heroLabel}
                    shameEmoji={league?.shameEmoji}
                    legFilter={legFilter}
                    members={members}
                    leagueName={league?.name}
                    bulk={bulk}
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
                <>
                  <View style={styles.scopeRow}>
                    {STANDINGS_SCOPES.map((scope) => {
                      const active = standingsScope === scope.key;
                      return (
                        <Pressable
                          key={scope.key}
                          onPress={() => setStandingsScope(scope.key)}
                          style={[styles.scopeBtn, active && styles.scopeBtnActive]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          testID={`button-standings-${scope.key}`}
                        >
                          <Text style={[styles.scopeBtnText, active && styles.scopeBtnTextActive]}>{scope.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <MembersTable
                    members={members}
                    stats={memberStats}
                    leagueName={leagueName}
                    scopeLabel={STANDINGS_SCOPES.find((sc) => sc.key === standingsScope)?.label ?? "Current Year"}
                  />
                </>
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
                    <LeagueRecordTile key={record.key} record={record} members={members} onLookthrough={setLookthroughRecord} />
                  ))}
                </View>
              )}
            </>
          )}

          {/* REPORTS: the canned extracts, each as bars plus shareable text. */}
          {activeTab === "reports" && (
            <>
              {reportsLoading ? (
                <ActivityIndicator color="#2563eb" style={styles.tabLoader} />
              ) : (
                (reportCatalog ?? []).map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setOpenReportId(r.id)}
                    style={({ pressed }) => [styles.reportTile, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    testID={`button-report-${r.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportTileTitle}>{r.title}</Text>
                      <Text style={styles.reportTileDesc}>{r.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#64748b" />
                  </Pressable>
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>

      <ReportSheet
        leagueId={leagueId}
        reportId={openReportId}
        title={reportCatalog?.find((r) => r.id === openReportId)?.title ?? "Report"}
        onClose={() => setOpenReportId(null)}
      />

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

      {/* League Record lookthrough — the specific parlay legs behind whichever
          tile was tapped, in the same sheet the Dash page uses. */}
      <LegLookthroughSheet
        visible={lookthroughRecord !== null}
        title={lookthroughRecord?.title ?? lookthroughRecord?.label ?? ""}
        legs={lookthroughLegs}
        isLoading={isParticipationLookthrough ? loadingMissedWeeks : loadingLookthrough}
        onClose={() => setLookthroughRecord(null)}
      >
        {isParticipationLookthrough ? (
          !missedWeeksData?.weeks || missedWeeksData.weeks.length === 0 ? (
            <Text style={styles.modalSubtitle}>No missed weeks — full participation!</Text>
          ) : (
            <ScrollView style={styles.lookthroughScroll}>
              {missedWeeksData.weeks.map((w) => (
                <View key={w.weekId} style={styles.lookthroughRow}>
                  <Text style={styles.lookthroughWeek} numberOfLines={1}>{w.label}</Text>
                  <Text style={styles.lookthroughMeta} numberOfLines={1}>{w.season}</Text>
                </View>
              ))}
            </ScrollView>
          )
        ) : undefined}
      </LegLookthroughSheet>
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
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10283a",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  progressPillText: { fontSize: 11, color: "#38bdf8", fontWeight: "600" },
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
  adminBarText: { fontSize: 13, color: "#94a3b8", fontWeight: "500" },
  cardChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  shareStandingsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingVertical: 8 },
  shareStandingsText: { fontSize: 13, fontWeight: "600", color: "#93c5fd" },
  shameChip: { borderStyle: "solid", borderColor: "rgba(248, 113, 113, 0.35)", backgroundColor: "rgba(248, 113, 113, 0.08)" },
  shameChipText: { color: "#fca5a5" },
  locksChip: { borderStyle: "solid", borderColor: "rgba(52, 211, 153, 0.35)", backgroundColor: "rgba(52, 211, 153, 0.08)" },
  locksChipText: { color: "#6ee7b7" },
  unlockRequestBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderBottomWidth: 1,
    borderColor: "#2a3447",
  },
  unlockRequestText: { flex: 1, fontSize: 13, color: "#f1f5f9" },
  requestUnlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.4)",
    marginBottom: 12,
  },
  requestUnlockText: { fontSize: 14, fontWeight: "600", color: "#93c5fd" },
  reportTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1c2538",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 14,
    marginBottom: 10,
  },
  reportTileTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  reportTileDesc: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
  reportChartTitle: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  reportBarRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  reportBarLabel: { width: 92, fontSize: 13, color: "#f1f5f9" },
  reportBarTrack: { flex: 1, height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: "#141926", overflow: "hidden" },
  reportBarFill: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: "#2563eb" },
  reportBarValue: { width: 44, textAlign: "right", fontSize: 13, fontWeight: "700", color: "#f1f5f9", fontVariant: ["tabular-nums"] },
  reportText: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: "#141926", fontSize: 13, lineHeight: 19, color: "#cbd5e1" },
  reportShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    marginTop: 12,
  },
  reportShareText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  reportShareRow: { flexDirection: "row", gap: 8 },
  reportShareBtnHalf: { flex: 1 },
  reportShareBtnAlt: { backgroundColor: "#334155" },
  // Its own background and padding, so the captured picture stands alone.
  reportGraphic: { backgroundColor: "#1c2538", padding: 14, borderRadius: 12 },
  reportGraphicTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 8 },
  reportEmpty: { fontSize: 13, color: "#94a3b8", paddingVertical: 20 },
  legFilterNote: { fontSize: 11, color: "#93c5fd", paddingBottom: 6 },
  boostChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#2a3447",
  },
  boostChipActive: { borderStyle: "solid", borderColor: "rgba(251, 191, 36, 0.4)", backgroundColor: "rgba(251, 191, 36, 0.1)" },
  boostChipText: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  adminBarWaiting: { fontSize: 11, color: "#64748b", marginTop: 2 },
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
  walkthroughMatchup: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  lookthroughScroll: { flexGrow: 0 },
  lookthroughRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    gap: 2,
  },
  lookthroughWeek: { fontSize: 13, fontWeight: "600", color: "#cbd5e1" },
  lookthroughMeta: { fontSize: 12, color: "#94a3b8" },
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
  filterToggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  filterToggleText: { fontSize: 12, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.4 },
  scopeRow: {
    flexDirection: "row",
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  scopeBtn: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  scopeBtnActive: { backgroundColor: "#1e2a3b", borderWidth: 1, borderColor: "#2563eb" },
  scopeBtnText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  scopeBtnTextActive: { color: "#93c5fd" },
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
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
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
  placementBlock: {},
  copyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
  },
  copyButtonText: { fontSize: 13, fontWeight: "700", color: "#cbd5e1" },
  placedNote: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44 },
  placedNoteText: { fontSize: 13, fontWeight: "700", color: "#22c55e" },
  bulkControls: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: "auto" },
  bulkBtn: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 32 },
  bulkBtnText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },

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
  memberIdentityCol: { flex: 1.3, minWidth: 0 },
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
    overflow: "hidden",
  },
  recordBody: { flex: 1, padding: 12 },
  recordViewerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "rgba(56, 189, 248, 0.2)",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  recordViewerLabel: { fontSize: 9, fontWeight: "700", color: "rgba(125, 211, 252, 0.7)", letterSpacing: 0.5 },
  recordViewerValue: { fontSize: 10, fontWeight: "700", color: "#7dd3fc", flexShrink: 1 },
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
