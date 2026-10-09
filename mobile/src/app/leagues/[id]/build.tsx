import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  TextInput,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useLeagues,
  useWeekLockStatus,
  useLeagueMembersWithUsers,
  useOnBehalfInfo,
  useResolveLegApproval,
} from "@/hooks/use-leagues";
import { useActiveWeek, useGames } from "@/hooks/use-weeks";
import { useEffectiveUserId } from "@/hooks/use-acting-as";
import {
  useMyParlay,
  useSetPick,
  useRemovePick,
  useSubmitDraftParlay,
  useCancelParlay,
  myParlayKey,
  type PickInput,
} from "@/hooks/use-parlays";
import { GamePickCard } from "@/components/GamePickCard";
import { AddPlayerPropModal } from "@/components/AddPlayerPropModal";
import { legOwnerName } from "@/components/LegLookthrough";
import {
  getLineForBet,
  shortLegLabel,
  takenMarketsByGame,
  type SelectedLeg,
  isGamePast,
} from "@/lib/pickHelpers";
import type { Game, GameWithBet, MemberWeekParlay } from "@shared/schema";
import { pickStanding } from "@shared/weekParlays";
import { BoostSheet } from "@/components/BoostSheet";
import { SussMeter, SussVoteButton } from "@/components/SussMeter";
import { useSendReminder, useSuss, useSussVote } from "@/hooks/use-parlay-extras";
import { findIllogicalBets, illogicalBetWarning, type IllogicalBet } from "@shared/illogicalBets";
import { gameMatchesTeamQuery } from "@shared/nflTeams";
import { SUSS_FULL_PROMPT, sussLevel } from "@shared/suss";

type ParlayLegRow = MemberWeekParlay["legs"][number];

const toSelectedLeg = (l: ParlayLegRow): SelectedLeg => ({
  gameId: l.gameId as number,
  betType: l.betType,
  pick: l.pick,
  line: l.line ?? undefined,
  playerName: l.playerName ?? undefined,
  propType: l.propType ?? undefined,
});

/**
 * Where a member makes their pick for the week. The league shares one parlay:
 * each member adds a single pick to it, and everyone sees the same legs. A
 * tap saves straight away; tapping something else moves the pick there.
 * Whoever started the parlay, or the Parlay Maestro, submits it once the
 * league's minimum number of picks are in. Rules: shared/weekParlays.ts.
 */
export default function BuildPickScreen() {
  const { id, weekId: previewWeekIdParam, readOnly: readOnlyParam } = useLocalSearchParams<{
    id: string;
    weekId?: string;
    readOnly?: string;
  }>();
  const leagueId = parseInt(id, 10);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeWeek = useActiveWeek();
  const effectiveUserId = useEffectiveUserId();
  const queryClient = useQueryClient();
  // A read-only preview passes an explicit weekId (next week's, not yet open
  // for picks) instead of relying on the active week.
  const readOnly = readOnlyParam === "1";
  const weekId = readOnly && previewWeekIdParam ? Number(previewWeekIdParam) : activeWeek?.id ?? 0;

  const { data: leagues, isLoading: leagueLoading } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);
  const { data: lockStatus, isLoading: lockLoading } = useWeekLockStatus(leagueId, readOnly ? 0 : weekId);
  // On Behalf Of mode: the member whose pick is being made, when it isn't
  // the viewer. `pickerId` is whose pick the screen treats as "mine".
  const { data: onBehalfInfo } = useOnBehalfInfo(readOnly ? 0 : leagueId);
  const [onBehalfChoice, setOnBehalfOf] = useState<string | undefined>(undefined);
  const onBehalfTarget = onBehalfInfo?.targets.find((t) => t.userId === onBehalfChoice);
  const onBehalfOf = onBehalfTarget?.userId;
  const pickerId = onBehalfOf ?? effectiveUserId;
  const { data: members } = useLeagueMembersWithUsers(readOnly ? 0 : leagueId);
  const resolveApproval = useResolveLegApproval(leagueId, weekId);
  const { data: weekParlay, isLoading: myParlayLoading } = useMyParlay(leagueId, readOnly ? 0 : weekId, { live: true, onBehalfOf });
  const { data: games, isLoading: gamesLoading } = useGames(weekId);
  const setPick = useSetPick(leagueId, weekId, onBehalfOf);
  const removePick = useRemovePick(leagueId, weekId, onBehalfOf);
  const submitDraftParlay = useSubmitDraftParlay(leagueId, weekId);
  const cancelParlay = useCancelParlay(leagueId, weekId);
  const [propGame, setPropGame] = useState<Game | null>(null);
  // The any-player prop entry at the top: no game chosen up front.
  const [anyPlayerPropOpen, setAnyPlayerPropOpen] = useState(false);
  // Narrows the game tiles to a team, by name or city.
  const [teamQuery, setTeamQuery] = useState("");
  // The Suss Meter: anonymous down votes on the open parlay's picks.
  const { data: suss } = useSuss(readOnly ? undefined : leagueId, weekId, !readOnly && weekId > 0);
  const sussVote = useSussVote(leagueId);
  const sendReminder = useSendReminder(leagueId, weekId);
  const [boostPromptOpen, setBoostPromptOpen] = useState(false);
  const [slipExpanded, setSlipExpanded] = useState(false);
  // In a league that runs more than one parlay a week: the member chose to
  // start another instead of looking at the one already submitted.
  const [startingNew, setStartingNew] = useState(false);

  const minLegs = league?.minLegsPerParlay ?? 3;
  const maxLegs = league?.maxLegsPerParlay ?? 5;

  // While starting a new parlay there's nothing on the server yet, so the
  // screen shows an empty one until the first pick creates it.
  const parlay = startingNew ? null : weekParlay ?? null;
  const standing = pickStanding(parlay, pickerId, minLegs, maxLegs);
  // Picks can change while the parlay is open, or before anyone has started one.
  const canPick = !readOnly && !lockStatus?.isLocked && (!parlay || standing.open);
  const savedLeg = standing.myLeg as ParlayLegRow | undefined;
  const takenByGame = useMemo(() => takenMarketsByGame(parlay?.taken), [parlay?.taken]);

  useEffect(() => {
    if (!readOnly && !lockLoading && lockStatus?.isLocked) {
      router.replace({ pathname: "/leagues/[id]", params: { id: String(leagueId) } });
    }
  }, [readOnly, lockLoading, lockStatus?.isLocked, leagueId, router]);

  const gamesById = useMemo(() => {
    const map = new Map<number, Game>();
    for (const g of games ?? []) map.set(g.id, g);
    return map;
  }, [games]);

  // A tap shows on screen straight away and saves in the background.
  // `pending` is the pick the member just chose (null = cleared) until the
  // server has caught up. Only the latest choice is ever sent: `wanted`
  // holds it, and one save runs at a time, so tapping quickly (stepping a
  // line five times, say) sends the last value once the save before it has
  // finished instead of five requests racing each other.
  const [pending, setPending] = useState<{ leg: SelectedLeg | null } | null>(null);
  const wanted = useRef<{ pick: PickInput | null } | null>(null);
  const saving = useRef(false);

  async function flushPick() {
    if (saving.current) return;
    saving.current = true;
    try {
      while (wanted.current) {
        const next = wanted.current;
        wanted.current = null;
        try {
          if (next.pick) {
            await setPick.mutateAsync(next.pick);
            setStartingNew(false);
          } else {
            // Read fresh: an earlier save may have changed which leg is mine.
            const current = queryClient.getQueryData<MemberWeekParlay | null>(myParlayKey(leagueId, weekId, onBehalfOf));
            const mine = current?.legs.find((l) => l.userId === pickerId);
            if (current && mine) await removePick.mutateAsync({ parlayId: current.id, legId: mine.id });
          }
        } catch (err) {
          // A newer tap is already waiting to be sent; only the last one's
          // failure is worth interrupting for.
          if (!wanted.current) {
            Alert.alert(next.pick ? "Couldn't save your pick" : "Couldn't remove your pick", err instanceof Error ? err.message : "Please try again.");
          }
        }
      }
    } finally {
      saving.current = false;
      // Hand the screen back to the server's copy.
      setPending(null);
    }
  }

  function savePick(leg: SelectedLeg | null) {
    setPending({ leg });
    wanted.current = {
      pick: leg
        ? {
            gameId: leg.gameId,
            betType: leg.betType,
            pick: leg.pick,
            line: leg.line,
            playerName: leg.playerName ?? undefined,
            propType: leg.propType ?? undefined,
            ...(startingNew ? { startNew: true } : {}),
          }
        : null,
    };
    void flushPick();
  }

  // The member's pick as shown: the one being saved, else the saved one.
  const myPick: SelectedLeg | null = pending ? pending.leg : savedLeg ? toSelectedLeg(savedLeg) : null;

  /** Saves `leg`, first confirming when it would move the pick off another game. */
  function choosePick(leg: SelectedLeg) {
    if (!myPick && standing.full) {
      Alert.alert("Parlay full", `This parlay already has its ${maxLegs} legs.`);
      return;
    }
    const replacingElsewhere = myPick && (myPick.gameId !== leg.gameId || myPick.betType === "player_prop" || leg.betType === "player_prop");
    if (!replacingElsewhere) {
      savePick(leg);
      return;
    }
    Alert.alert(
      "Change your pick?",
      `You get one pick in this parlay. Swap ${shortLegLabel(myPick, gamesById.get(myPick.gameId))} for ${shortLegLabel(leg, gamesById.get(leg.gameId))}?`,
      [
        { text: "Keep my pick", style: "cancel" },
        { text: "Swap", onPress: () => savePick(leg) },
      ],
    );
  }

  /** Saves `leg`, first warning when it's an Illogical Bet with a pick
   * already in the parlay (shared/illogicalBets.ts). It's allowed either way. */
  function chooseWithIllogicalCheck(leg: SelectedLeg, bet: IllogicalBet) {
    const found = findIllogicalBets(bet, parlay?.taken, gamesById.get(leg.gameId));
    if (found.length === 0) {
      choosePick(leg);
      return;
    }
    const warning = illogicalBetWarning(found.map((f) => ({ reason: f.reason, who: f.bet.takenBy.mobile })));
    Alert.alert(warning.title, warning.message, [
      { text: "Pick something else", style: "cancel" },
      { text: "Add it anyway", onPress: () => choosePick(leg) },
    ]);
  }

  function onSelectMarket(game: Game, betType: string, pick: string) {
    if (!canPick) return;
    const leg: SelectedLeg = { gameId: game.id, betType, pick, line: getLineForBet(game, betType, pick) };
    chooseWithIllogicalCheck(leg, { gameId: game.id, betType, pick });
  }

  // Nudges whoever hasn't picked, then opens the share sheet with the
  // reminder text for the group chat.
  function sendReminderBlast() {
    sendReminder.mutate(undefined, {
      onSuccess: ({ text }) => void Share.share({ message: text }).catch(() => undefined),
      onError: (err: Error) => Alert.alert("Couldn't send the reminder", err.message || "Please try again."),
    });
  }

  // Alternate line: re-prices the pick at a new points-moved value without
  // changing what was picked.
  function adjustPoints(game: Game, pointsMoved: number) {
    if (!canPick || !myPick || myPick.gameId !== game.id || myPick.betType === "player_prop") return;
    savePick({ ...myPick, line: getLineForBet(game, myPick.betType, myPick.pick, pointsMoved) });
  }

  // Only games still open to pick, plus any already-started/finished game
  // that has a leg in the parlay (so everyone can still see what was picked).
  const visibleGames = useMemo(
    () =>
      (games ?? []).filter((g) => {
        const started = !!g.isFinished || (g.gameTime ? new Date(g.gameTime) < new Date() : false);
        return !started || myPick?.gameId === g.id || (parlay?.legs ?? []).some((l) => l.gameId === g.id);
      }),
    [games, myPick, parlay?.legs],
  );
  // The team search narrows the tiles; with nothing typed it's every game.
  const shownGames = useMemo(() => visibleGames.filter((g) => gameMatchesTeamQuery(g, teamQuery)), [visibleGames, teamQuery]);
  // Games a prop can still go on, for the any-player entry.
  const openGames = useMemo(() => (games ?? []).filter((g) => !isGamePast(g)), [games]);

  // Who can submit: whoever started the parlay, the Parlay Maestro and
  // lieutenants. The server has the final say (lieutenants need the
  // approve-parlays permission).
  const isStarter = !!parlay && parlay.userId === effectiveUserId;
  const canSubmitRole = isStarter || !!league?.isAdmin || !!league?.isLieutenant;
  // A pick whose game kicked off before the parlay was submitted blocks the
  // submit until it's removed (the server enforces the same rule).
  const startedGame = standing.open
    ? (parlay?.legs ?? []).map((l) => (l.gameId != null ? gamesById.get(l.gameId) : undefined)).find((g) => !!g && isGamePast(g))
    : undefined;
  const canSubmit = canSubmitRole && standing.readyToSubmit && !pending && !lockStatus?.isLocked && !startedGame;

  function submitWithBoost(boostPct: number | null) {
    if (!parlay) return;
    submitDraftParlay.mutate({ parlayId: parlay.id, boostPct }, {
      onSuccess: () => {
        setBoostPromptOpen(false);
        Alert.alert("Parlay submitted", "It's now pending review.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      },
      onError: (err: Error) => {
        Alert.alert("Couldn't submit", err.message || "Please try again.");
      },
    });
  }

  // Discarding takes every member's pick with it: the starter can while
  // they're the only one in it, the Parlay Maestro any time before approval.
  const othersIn = (parlay?.legs ?? []).some((l) => l.userId !== effectiveUserId);
  const canDiscard =
    !!parlay && (parlay.status === "draft" || parlay.status === "pending") && (!!league?.isAdmin || (isStarter && !othersIn));

  function discardParlay() {
    if (!parlay) return;
    Alert.alert(
      "Discard this parlay?",
      othersIn ? "Every member's pick in it will be removed. This can't be undone." : "This can't be undone.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            cancelParlay.mutate(parlay.id, {
              onSuccess: () => router.back(),
              onError: (err: Error) => {
                Alert.alert("Couldn't discard", err.message || "Please try again.");
              },
            });
          },
        },
      ],
    );
  }

  // Everyone's legs, the member's own first. While a save is in flight the
  // member's row shows what they just chose.
  const slipRows = useMemo(() => {
    const others = (parlay?.legs ?? [])
      .filter((l) => l.userId !== pickerId)
      .map((l) => ({ key: `leg-${l.id}`, owner: legOwnerName(l.user), leg: toSelectedLeg(l), mine: false }));
    return [...(myPick ? [{ key: "mine", owner: onBehalfTarget?.name ?? "You", leg: myPick, mine: true }] : []), ...others];
  }, [parlay?.legs, pickerId, myPick, onBehalfTarget?.name]);

  // Every member and their pick, for the summary at the top. Members still
  // to pick come first and are highlighted.
  const pickSummary = useMemo(() => {
    const legByUser = new Map((parlay?.legs ?? []).map((l) => [l.userId, l]));
    return (members ?? [])
      .filter((m: any) => m.isActive !== false)
      .map((m: any) => {
        const isPicker = m.userId === pickerId;
        const saved = legByUser.get(m.userId);
        // The picker's row shows the pick being saved, like the slip does.
        const leg = isPicker ? myPick : saved ? toSelectedLeg(saved) : null;
        return {
          userId: m.userId as string,
          name: m.userId === effectiveUserId ? "You" : legOwnerName(m.user, "Member"),
          leg,
          // The saved leg's id, for its Suss Meter. Not while a new pick is still saving.
          legId: saved && !(isPicker && pending) ? saved.id : null,
          isOwn: m.userId === effectiveUserId,
          awaitingApproval: saved?.approvalStatus === "pending",
        };
      })
      .sort((a, b) => Number(!!a.leg) - Number(!!b.leg) || a.name.localeCompare(b.name));
  }, [members, parlay?.legs, pickerId, myPick, effectiveUserId, pending]);

  // Picks made on a member's behalf that the member hasn't answered yet.
  const pendingApprovals = (parlay?.legs ?? []).filter((l) => l.approvalStatus === "pending");

  function chooseOnBehalfOf() {
    const targets = onBehalfInfo?.targets ?? [];
    if (targets.length === 1) {
      setOnBehalfOf(targets[0].userId);
      return;
    }
    Alert.alert("Pick on behalf of…", "The pick you make will be theirs, and they'll be asked to approve it.", [
      ...targets.map((t) => ({ text: t.name, onPress: () => setOnBehalfOf(t.userId) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function decideApproval(legId: number, action: "approve" | "reject") {
    resolveApproval.mutate({ legId, action }, { onError: (err: Error) => Alert.alert("Couldn't save", err.message || "Please try again.") });
  }
  const legCount = slipRows.length;
  const needed = Math.max(0, minLegs - legCount);

  const loading = leagueLoading || (!readOnly && (lockLoading || myParlayLoading)) || (weekId > 0 && gamesLoading);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Make Your Pick" }} />
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  if (!readOnly && !activeWeek) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Make Your Pick" }} />
        <Text style={styles.emptyTitle}>No active week</Text>
        <Text style={styles.emptySubtitle}>Check back when the next week opens.</Text>
      </View>
    );
  }

  const submitted = !!parlay && !standing.open;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: readOnly ? "Next Week Preview" : submitted ? "This Week's Parlay" : "Make Your Pick",
          headerBackTitle: "Back",
        }}
      />

      {readOnly ? (
        <View style={styles.previewBanner}>
          <Ionicons name="eye-outline" size={16} color="#93c5fd" />
          <Text style={styles.previewBannerText}>
            Preview only — picks open once this becomes the active week.
          </Text>
        </View>
      ) : (
        <View style={styles.headerBar} testID="header-parlay-status">
          <Text style={styles.headerCount}>
            {submitted ? "Parlay submitted" : parlay ? "Parlay is Open!" : "No parlay yet"}
            {parlay || legCount > 0 ? ` · ${legCount} / ${maxLegs} legs` : ""}
          </Text>
          <Text style={styles.headerHint}>
            {submitted
              ? "Picks are closed"
              : !parlay && legCount === 0
                ? "Your pick starts it"
                : needed > 0
                  ? `${needed} more needed`
                  : "Ready to submit"}
          </Text>
        </View>
      )}

      <FlatList
        data={shownGames}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={readOnly ? null : (
          <View>
            {/* Find a team's game by name or city, or go straight to a
                prop on any player. */}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color="#64748b" />
              <TextInput
                style={styles.searchInput}
                value={teamQuery}
                onChangeText={setTeamQuery}
                placeholder="Search a team or city"
                placeholderTextColor="#64748b"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search games by team name or city"
                testID="input-team-search"
              />
            </View>
            {canPick && (
              <Pressable
                onPress={() => setAnyPlayerPropOpen(true)}
                style={({ pressed }) => [styles.onBehalfBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                testID="button-any-player-prop"
              >
                <Ionicons name="person-add-outline" size={16} color="#93c5fd" />
                <Text style={styles.onBehalfBtnText}>Player prop: search any player</Text>
              </Pressable>
            )}
            {canPick && !!parlay && (
              <Pressable
                onPress={sendReminderBlast}
                disabled={sendReminder.isPending}
                style={({ pressed }) => [styles.onBehalfBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Send a reminder to everyone who hasn't picked"
                testID="button-send-reminder"
              >
                {sendReminder.isPending ? <ActivityIndicator size="small" color="#93c5fd" /> : <Ionicons name="megaphone-outline" size={16} color="#93c5fd" />}
                <Text style={styles.onBehalfBtnText}>Send reminder</Text>
              </Pressable>
            )}
            {/* On Behalf Of mode: only for members who can pick for someone. */}
            {onBehalfTarget ? (
              <View style={styles.onBehalfBanner} testID="banner-on-behalf-mode">
                <Ionicons name="people-circle-outline" size={18} color="#fbbf24" />
                <Text style={styles.onBehalfBannerText} numberOfLines={2}>
                  On Behalf Of {onBehalfTarget.name}. They'll be asked to approve the pick.
                </Text>
                <Pressable
                  onPress={() => !pending && setOnBehalfOf(undefined)}
                  style={({ pressed }) => [styles.onBehalfExit, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Exit On Behalf Of mode"
                  testID="button-exit-on-behalf"
                >
                  <Text style={styles.onBehalfExitText}>Exit</Text>
                </Pressable>
              </View>
            ) : canPick && (onBehalfInfo?.targets.length ?? 0) > 0 ? (
              <Pressable
                onPress={() => !pending && chooseOnBehalfOf()}
                style={({ pressed }) => [styles.onBehalfBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                testID="button-on-behalf-mode"
              >
                <Ionicons name="people-circle-outline" size={16} color="#93c5fd" />
                <Text style={styles.onBehalfBtnText}>
                  {onBehalfInfo!.targets.length === 1 ? `Pick On Behalf Of ${onBehalfInfo!.targets[0].name}` : "On Behalf Of…"}
                </Text>
              </Pressable>
            ) : null}

            {pendingApprovals.map((leg) => {
              const mine = leg.userId === effectiveUserId;
              const canDecide = mine || !!league?.isAdmin;
              const maker = (members ?? []).find((m: any) => m.userId === leg.placedByUserId);
              return (
                <View key={leg.id} style={styles.approvalCard} testID={`row-pending-approval-${leg.id}`}>
                  <Text style={styles.approvalTitle} numberOfLines={2}>
                    {shortLegLabel(toSelectedLeg(leg), gamesById.get(leg.gameId as number))}
                  </Text>
                  <Text style={styles.approvalSub} numberOfLines={2}>
                    Picked by {maker ? legOwnerName((maker as any).user, "a member") : "a member"} for {mine ? "you" : legOwnerName(leg.user, "a member")}.
                    {canDecide ? "" : " Waiting on their approval."}
                  </Text>
                  {canDecide && (
                    <View style={styles.approvalActions}>
                      <Pressable
                        onPress={() => decideApproval(leg.id, "reject")}
                        disabled={resolveApproval.isPending}
                        style={({ pressed }) => [styles.approvalReject, pressed && { opacity: 0.7 }]}
                        testID={`button-reject-pick-${leg.id}`}
                      >
                        <Text style={styles.approvalRejectText}>{mine ? "Reject" : "Remove"}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => decideApproval(leg.id, "approve")}
                        disabled={resolveApproval.isPending}
                        style={({ pressed }) => [styles.approvalApprove, pressed && { opacity: 0.85 }]}
                        testID={`button-approve-pick-${leg.id}`}
                      >
                        <Text style={styles.approvalApproveText}>{mine ? "Approve" : "Override: approve"}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Everyone's pick so far. Members still to pick are listed
                first and highlighted. */}
            {pickSummary.length > 0 && (
              <View style={styles.summaryCard} testID="list-pick-summary">
                <Text style={styles.summaryTitle}>
                  Picks so far · {pickSummary.filter((r) => r.leg).length} of {pickSummary.length} in
                </Text>
                {pickSummary.map((row) => {
                  const tally = row.legId != null ? suss?.[row.legId] : undefined;
                  return (
                    <View key={row.userId} style={[styles.summaryRow, !row.leg && styles.summaryRowOpen]}>
                      <Text style={[styles.summaryName, !row.leg && styles.summaryNameOpen]} numberOfLines={1}>{row.name}</Text>
                      <Text style={[styles.summaryPick, !row.leg && styles.summaryPickOpen]} numberOfLines={1}>
                        {row.leg
                          ? `${shortLegLabel(row.leg, gamesById.get(row.leg.gameId))}${row.awaitingApproval ? " · awaiting approval" : ""}`
                          : "Pick is open"}
                      </Text>
                      <SussMeter tally={tally} />
                      {/* Anonymous down vote. Nobody votes on their own pick. */}
                      {row.legId != null && !row.isOwn && standing.open && (
                        <SussVoteButton
                          legId={row.legId}
                          tally={tally}
                          disabled={sussVote.isPending}
                          onVote={(vote) =>
                            sussVote.mutate(
                              { legId: row.legId!, vote },
                              { onError: (err: Error) => Alert.alert("Couldn't save your vote", err.message || "Please try again.") },
                            )
                          }
                        />
                      )}
                    </View>
                  );
                })}
                {savedLeg && sussLevel(suss?.[savedLeg.id]) === 3 && (
                  <Text style={styles.sussPrompt} testID="text-suss-full">🌡️ {SUSS_FULL_PROMPT}</Text>
                )}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>{teamQuery.trim() ? `No games match "${teamQuery.trim()}"` : "No games this week"}</Text>
            <Text style={styles.emptySubtitle}>
              {teamQuery.trim() ? "Try the team's name or its city." : "Games will show up once the slate is posted."}
            </Text>
          </View>
        }
        renderItem={({ item }: { item: GameWithBet }) => {
          // The grid only ever shows a spread/ML/total pick; a player prop
          // on this game shows in the slip below instead.
          const selected = myPick && myPick.gameId === item.id && myPick.betType !== "player_prop" ? myPick : undefined;
          return (
            <GamePickCard
              game={item}
              selectedLeg={selected}
              readOnly={!canPick}
              takenBy={takenByGame.get(item.id)}
              onSelect={({ betType, pick }) => onSelectMarket(item, betType, pick)}
              onClear={() => canPick && savePick(null)}
              onAdjustPoints={(pointsMoved) => adjustPoints(item, pointsMoved)}
              onAddProp={canPick ? () => setPropGame(item) : undefined}
            />
          );
        }}
      />

      {!readOnly && <View style={[styles.slip, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => setSlipExpanded((v) => !v)}
          style={styles.slipHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded: slipExpanded }}
          testID="button-toggle-slip"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.slipCount}>
              {legCount} / {maxLegs} legs · min {minLegs}
            </Text>
            <Text style={styles.slipSummary} numberOfLines={slipExpanded ? undefined : 1} testID="text-my-pick">
              {myPick
                ? `${onBehalfTarget ? `${onBehalfTarget.name}'s` : "Your"} pick: ${shortLegLabel(myPick, gamesById.get(myPick.gameId))}`
                : canPick
                  ? `Tap a market to make ${onBehalfTarget ? "their" : "your"} pick`
                  : "You don't have a pick in this parlay"}
            </Text>
          </View>
          <Ionicons
            name={slipExpanded ? "chevron-down" : "chevron-up"}
            size={18}
            color="#64748b"
          />
        </Pressable>

        {slipExpanded && slipRows.length > 0 && (
          <View style={styles.slipList}>
            {slipRows.map((row) => (
              <View key={row.key} style={styles.slipRow}>
                <Text style={styles.slipRowText} numberOfLines={1}>
                  <Text style={styles.slipRowOwner}>{row.owner}: </Text>
                  {shortLegLabel(row.leg, gamesById.get(row.leg.gameId))}
                </Text>
                {row.mine && canPick && (
                  <Pressable onPress={() => savePick(null)} hitSlop={8} accessibilityLabel="Remove your pick">
                    <Ionicons name="close-circle" size={20} color="#64748b" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {startedGame && canSubmitRole && (
          <Text style={styles.startedWarning} testID="text-submit-blocked">
            {startedGame.awayTeam} @ {startedGame.homeTeam} already started. That pick has to come out before the parlay can be submitted.
          </Text>
        )}

        {submitted ? (
          <>
            <Text style={styles.slipNote}>This parlay has been submitted, so its picks can't change.</Text>
            {parlay?.canStartAnother && !lockStatus?.isLocked && (
              <Pressable
                onPress={() => setStartingNew(true)}
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
                testID="button-start-another-parlay"
              >
                <Text style={styles.submitBtnText}>Start another parlay</Text>
              </Pressable>
            )}
          </>
        ) : canSubmitRole && parlay ? (
          <Pressable
            onPress={() => canSubmit && setBoostPromptOpen(true)}
            disabled={!canSubmit || submitDraftParlay.isPending}
            style={({ pressed }) => [
              styles.submitBtn,
              (!canSubmit || submitDraftParlay.isPending) && styles.submitBtnDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
            testID="button-submit-parlay"
          >
            {submitDraftParlay.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {needed > 0 ? `Submit parlay · ${needed} more needed` : `Submit parlay · ${legCount} legs`}
              </Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.slipNote} testID="text-pick-saved-note">
            {myPick
              ? `Your pick is saved. Whoever started the parlay, or the Parlay Maestro, submits it once ${minLegs} legs are in.`
              : `Each member adds one pick. The parlay can be submitted once ${minLegs} legs are in.`}
          </Text>
        )}

        {canDiscard && (
          <Pressable
            onPress={discardParlay}
            disabled={cancelParlay.isPending}
            style={({ pressed }) => [styles.cancelParlayBtn, pressed && { opacity: 0.7 }]}
          >
            {cancelParlay.isPending ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <Text style={styles.cancelParlayBtnText}>Discard Parlay</Text>
            )}
          </Pressable>
        )}
      </View>}

      <AddPlayerPropModal
        game={propGame}
        anyPlayerGames={anyPlayerPropOpen ? openGames : null}
        onClose={() => {
          setPropGame(null);
          setAnyPlayerPropOpen(false);
        }}
        onAdd={({ playerTeam, ...leg }) => chooseWithIllogicalCheck(leg, { ...leg, playerTeam })}
      />

      <BoostSheet
        visible={boostPromptOpen}
        onClose={() => setBoostPromptOpen(false)}
        initialPct={parlay?.boostPct}
        saving={submitDraftParlay.isPending}
        title="Before you submit"
        confirmLabel="Submit parlay"
        onConfirm={submitWithBoost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  startedWarning: { fontSize: 12, color: "#fbbf24", fontWeight: "600", marginBottom: 8 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    backgroundColor: "#1c2538",
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#f1f5f9", paddingVertical: 10 },
  sussPrompt: { fontSize: 12, fontWeight: "600", color: "#fca5a5", marginTop: 8 },
  container: { flex: 1, backgroundColor: "#141926" },
  centered: {
    flex: 1,
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1c2538",
    borderBottomWidth: 1,
    borderBottomColor: "#2a3447",
  },
  headerCount: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  onBehalfBtn: {
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
  onBehalfBtnText: { fontSize: 14, fontWeight: "600", color: "#93c5fd" },
  onBehalfBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.5)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    marginBottom: 12,
  },
  onBehalfBannerText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#fbbf24" },
  onBehalfExit: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  onBehalfExitText: { fontSize: 13, fontWeight: "700", color: "#fbbf24" },
  approvalCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    marginBottom: 12,
    gap: 4,
  },
  approvalTitle: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  approvalSub: { fontSize: 12, color: "#94a3b8" },
  approvalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  approvalReject: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
  },
  approvalRejectText: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  approvalApprove: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  approvalApproveText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  summaryCard: {
    backgroundColor: "#1c2538",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3447",
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  summaryTitle: { fontSize: 11, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  summaryRowOpen: { backgroundColor: "rgba(245, 158, 11, 0.1)" },
  summaryName: { width: 96, fontSize: 13, fontWeight: "700", color: "#f1f5f9" },
  summaryNameOpen: { color: "#fbbf24" },
  summaryPick: { flex: 1, fontSize: 13, color: "#cbd5e1" },
  summaryPickOpen: { color: "#fbbf24", fontStyle: "italic" },
  headerHint: { fontSize: 13, color: "#94a3b8" },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0a1526",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2e4d",
  },
  previewBannerText: { fontSize: 13, color: "#93c5fd", flex: 1 },
  listContent: { padding: 16, paddingBottom: 8 },
  emptyBlock: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: { fontSize: 13, color: "#94a3b8", textAlign: "center" },
  slip: {
    borderTopWidth: 1,
    borderTopColor: "#2a3447",
    backgroundColor: "#1c2538",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  slipHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  slipCount: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  slipSummary: { fontSize: 14, color: "#f1f5f9", marginTop: 2, fontWeight: "500" },
  slipList: { gap: 8 },
  slipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#141926",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slipRowText: { flex: 1, fontSize: 14, color: "#f1f5f9", fontWeight: "500" },
  slipRowOwner: { color: "#93c5fd", fontWeight: "700" },
  slipNote: { fontSize: 13, lineHeight: 18, color: "#94a3b8" },
  submitBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  cancelParlayBtn: { alignItems: "center", paddingVertical: 10, marginTop: 2 },
  cancelParlayBtnText: { fontSize: 13, fontWeight: "600", color: "#ef4444" },
});
