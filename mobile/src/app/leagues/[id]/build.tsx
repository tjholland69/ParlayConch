import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "@/lib/api";
import { useWeekLockStatus } from "@/hooks/use-leagues";
import { useActiveWeek, useGames } from "@/hooks/use-weeks";
import {
  useCreateParlay,
  useMyParlay,
  useAddDraftLeg,
  useRemoveDraftLeg,
  useSubmitDraftParlay,
  useCancelParlay,
  useTakenPicks,
} from "@/hooks/use-parlays";
import { GamePickCard } from "@/components/GamePickCard";
import { AddPlayerPropModal } from "@/components/AddPlayerPropModal";
import {
  getLineForBet,
  shortLegLabel,
  takenMarketsByGame,
  correlatedMarketWarning,
  type SelectedLeg,
} from "@/lib/pickHelpers";
import type { Game, GameWithBet } from "@shared/schema";

/** Moneyline + Spread on the same game are highly correlated (the spread
 * pick's side usually implies the moneyline outcome too) — confirm before
 * adding one when the other is already someone else's pick on that game. */
function confirmCorrelatedBet(conflictWithName: string, newBetType: string, onConfirm: () => void) {
  const otherLabel = newBetType === "moneyline" ? "Spread" : "Moneyline";
  Alert.alert(
    "Correlated bet",
    `${conflictWithName} already has the ${otherLabel} on this game. Taking both Moneyline and Spread on the same game is often a redundant bet — add it anyway?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Add anyway", onPress: onConfirm },
    ],
  );
}

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
  // A read-only preview passes an explicit weekId (next week's, not yet open
  // for picks) instead of relying on the active week.
  const readOnly = readOnlyParam === "1";
  const weekId = readOnly && previewWeekIdParam ? Number(previewWeekIdParam) : activeWeek?.id ?? 0;

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["/api/leagues", leagueId],
    queryFn: () => apiRequest<{ name?: string; minLegsPerParlay?: number | null; maxLegsPerParlay?: number | null }>(
      "GET",
      `/api/leagues/${leagueId}`,
    ),
    enabled: !!leagueId,
  });

  const { data: lockStatus, isLoading: lockLoading } = useWeekLockStatus(leagueId, readOnly ? 0 : weekId);
  const { data: myParlay, isLoading: myParlayLoading } = useMyParlay(leagueId, readOnly ? 0 : weekId);
  const { data: games, isLoading: gamesLoading } = useGames(weekId);
  const { data: takenPicks } = useTakenPicks(leagueId, readOnly ? 0 : weekId);
  const takenByGame = useMemo(() => takenMarketsByGame(takenPicks), [takenPicks]);
  const createParlay = useCreateParlay(leagueId);
  const addDraftLeg = useAddDraftLeg(leagueId, weekId);
  const removeDraftLeg = useRemoveDraftLeg(leagueId, weekId);
  const submitDraftParlay = useSubmitDraftParlay(leagueId, weekId);
  const cancelParlay = useCancelParlay(leagueId, weekId);
  const [propGame, setPropGame] = useState<Game | null>(null);

  const minLegs = league?.minLegsPerParlay ?? 3;
  const maxLegs = league?.maxLegsPerParlay ?? 5;

  // A parlay that's already been submitted (anything other than 'draft') is
  // edited the old way — batch-select then one "Update pick" call — so an
  // in-progress review/approval isn't churned leg-by-leg. A fresh pick (no
  // parlay yet, or one still in 'draft') uses the new queue flow: tap once,
  // it's added and persisted immediately, building up the parlay one leg at
  // a time — this is what actually queues into the "Your Parlays" rollup tile.
  const isEditingSubmitted = !!myParlay && myParlay.status !== "draft";

  const [selectedLegs, setSelectedLegs] = useState<SelectedLeg[]>([]);
  const [slipExpanded, setSlipExpanded] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!isEditingSubmitted || prefilled || !myParlay?.legs?.length) return;
    const legs: SelectedLeg[] = myParlay.legs
      .filter((l) => l.gameId != null)
      .map((l) => ({
        gameId: l.gameId as number,
        betType: l.betType,
        pick: l.pick,
        line: l.line ?? undefined,
        playerName: l.playerName ?? undefined,
        propType: l.propType ?? undefined,
      }));
    if (legs.length) {
      setSelectedLegs(legs);
      setPrefilled(true);
    }
  }, [isEditingSubmitted, myParlay, prefilled]);

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

  // Draft-mode legs, straight from the server (source of truth — each tap
  // persists immediately, so there's no local mirror to keep in sync).
  const draftLegs: SelectedLeg[] = useMemo(
    () =>
      (myParlay?.legs ?? [])
        .filter((l) => l.gameId != null)
        .map((l) => ({
          gameId: l.gameId as number,
          betType: l.betType,
          pick: l.pick,
          line: l.line ?? undefined,
          playerName: l.playerName ?? undefined,
          propType: l.propType ?? undefined,
        })),
    [myParlay?.legs],
  );

  const activeLegs = isEditingSubmitted ? selectedLegs : draftLegs;
  const legMutationPending = addDraftLeg.isPending || removeDraftLeg.isPending;

  const canSubmit = isEditingSubmitted
    ? selectedLegs.length >= minLegs && selectedLegs.length <= maxLegs && !lockStatus?.isLocked
    : draftLegs.length >= minLegs && draftLegs.length <= maxLegs && !lockStatus?.isLocked;

  function toggleLegSubmitted(game: Game, betType: string, pick: string) {
    const line = getLineForBet(game, betType, pick);
    const applyChange = () => {
      setSelectedLegs((prev) => {
        // Exclude player_prop legs from this game-slot lookup — a prop leg
        // added for this game (via the separate Add Player Prop flow) lives
        // outside the 2x3 grid and must never be overwritten by a grid tap.
        const existing = prev.findIndex((l) => l.gameId === game.id && l.betType !== "player_prop");
        if (existing >= 0) {
          if (prev[existing].pick === pick && prev[existing].betType === betType) {
            return prev.filter((_, i) => i !== existing);
          }
          return prev.map((l, i) =>
            i === existing ? { gameId: game.id, betType, pick, line } : l,
          );
        }
        if (prev.length >= maxLegs) {
          Alert.alert("Parlay full", `Remove a leg before adding another (max ${maxLegs}).`);
          return prev;
        }
        return [...prev, { gameId: game.id, betType, pick, line }];
      });
    };

    const existingLeg = selectedLegs.find((l) => l.gameId === game.id && l.betType !== "player_prop");
    const isDeselect = existingLeg?.pick === pick && existingLeg?.betType === betType;
    const conflictWith = !isDeselect ? correlatedMarketWarning(takenPicks, game.id, betType) : null;
    if (conflictWith) {
      confirmCorrelatedBet(conflictWith, betType, applyChange);
      return;
    }
    applyChange();
  }

  async function toggleLegDraft(game: Game, betType: string, pick: string) {
    if (legMutationPending) return;
    const line = getLineForBet(game, betType, pick);
    const existingLeg = (myParlay?.legs ?? []).find((l) => l.gameId === game.id);
    const isDeselect = existingLeg?.pick === pick && existingLeg?.betType === betType;

    const performToggle = async () => {
      try {
        if (existingLeg) {
          // Same pick tapped again → remove it (deselect).
          if (isDeselect) {
            await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
            return;
          }
          // Different pick on the same game → swap: remove the old leg, add the new one.
          await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
          try {
            await addDraftLeg.mutateAsync({ gameId: game.id, betType, pick, line });
          } catch (addErr) {
            // The remove succeeded but the new pick failed to add — restore the
            // original pick rather than silently leaving the draft one leg
            // short of what the user had before tapping.
            try {
              await addDraftLeg.mutateAsync({
                gameId: game.id,
                betType: existingLeg.betType,
                pick: existingLeg.pick,
                line: existingLeg.line ?? undefined,
              });
            } catch {
              // Restore also failed — surface the original error below; the
              // draft is left missing this leg, but the user sees why.
            }
            throw addErr;
          }
          return;
        }

        if (draftLegs.length >= maxLegs) {
          Alert.alert("Parlay full", `Remove a leg before adding another (max ${maxLegs}).`);
          return;
        }
        await addDraftLeg.mutateAsync({ gameId: game.id, betType, pick, line });
      } catch (err) {
        Alert.alert("Couldn't update pick", err instanceof Error ? err.message : "Please try again.");
      }
    };

    if (!isDeselect) {
      const conflictWith = correlatedMarketWarning(takenPicks, game.id, betType);
      if (conflictWith) {
        confirmCorrelatedBet(conflictWith, betType, () => {
          void performToggle();
        });
        return;
      }
    }
    await performToggle();
  }

  function clearGameSubmitted(gameId: number) {
    // Same exclusion as toggleLegSubmitted — clearing this game's grid pick
    // must never also remove a separately-added player_prop leg on it.
    setSelectedLegs((prev) => prev.filter((l) => !(l.gameId === gameId && l.betType !== "player_prop")));
  }

  // Appends a player-prop leg while editing an already-submitted parlay —
  // everything here is local state until the batch "Update pick" submit,
  // same as every other submitted-edit mutation in this file.
  function addPropSubmitted(leg: SelectedLeg) {
    if (selectedLegs.length >= maxLegs) {
      Alert.alert("Parlay full", `Remove a leg before adding another (max ${maxLegs}).`);
      return;
    }
    setSelectedLegs((prev) => [...prev, leg]);
  }

  async function clearGameDraft(gameId: number) {
    // Same exclusion as clearGameSubmitted — the grid's Clear button must
    // never remove a separately-added player_prop leg on this game.
    const existingLeg = (myParlay?.legs ?? []).find((l) => l.gameId === gameId && l.betType !== "player_prop");
    if (!existingLeg || legMutationPending) return;
    try {
      await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
    } catch (err) {
      Alert.alert("Couldn't remove leg", err instanceof Error ? err.message : "Please try again.");
    }
  }

  // A game can carry both a grid pick (spread/ML/total) and one or more
  // player_prop legs at once, so the slip list's per-row remove button needs
  // to identify the exact leg it's showing — gameId alone (what the grid's
  // own Clear button uses) isn't enough once props are in the mix.
  async function removeSlipLeg(leg: SelectedLeg) {
    if (leg.betType !== "player_prop") {
      return isEditingSubmitted ? clearGameSubmitted(leg.gameId) : clearGameDraft(leg.gameId);
    }
    if (isEditingSubmitted) {
      setSelectedLegs((prev) =>
        prev.filter(
          (l) =>
            !(l.gameId === leg.gameId && l.betType === "player_prop" && l.playerName === leg.playerName && l.propType === leg.propType),
        ),
      );
      return;
    }
    const existingLeg = (myParlay?.legs ?? []).find(
      (l) => l.gameId === leg.gameId && l.betType === "player_prop" && l.playerName === leg.playerName && l.propType === leg.propType,
    );
    if (!existingLeg || legMutationPending) return;
    try {
      await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
    } catch (err) {
      Alert.alert("Couldn't remove leg", err instanceof Error ? err.message : "Please try again.");
    }
  }

  // "Buy points" — re-prices the already-selected leg on this game at a new
  // points-moved value, without changing betType/pick. Same betType+pick
  // means the toggle's "tap same pick again → deselect" rule never applies here.
  function adjustPointsSubmitted(game: Game, pointsMoved: number) {
    setSelectedLegs((prev) => {
      const idx = prev.findIndex((l) => l.gameId === game.id && l.betType !== "player_prop");
      if (idx < 0) return prev;
      const existing = prev[idx];
      const line = getLineForBet(game, existing.betType, existing.pick, pointsMoved);
      return prev.map((l, i) => (i === idx ? { ...l, line } : l));
    });
  }

  const [pointsAdjustingGameId, setPointsAdjustingGameId] = useState<number | null>(null);

  async function adjustPointsDraft(game: Game, pointsMoved: number) {
    if (legMutationPending || pointsAdjustingGameId != null) return;
    const existingLeg = (myParlay?.legs ?? []).find((l) => l.gameId === game.id);
    if (!existingLeg) return;
    const line = getLineForBet(game, existingLeg.betType, existingLeg.pick, pointsMoved);
    setPointsAdjustingGameId(game.id);
    try {
      await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
      await addDraftLeg.mutateAsync({ gameId: game.id, betType: existingLeg.betType, pick: existingLeg.pick, line });
    } catch (err) {
      Alert.alert("Couldn't update points", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setPointsAdjustingGameId(null);
    }
  }

  function submit() {
    if (!weekId || !canSubmit) return;

    if (isEditingSubmitted) {
      createParlay.mutate(
        { weekId, legs: selectedLegs },
        {
          onSuccess: () => {
            Alert.alert("Pick updated", "Your parlay is pending review.", [
              { text: "OK", onPress: () => router.back() },
            ]);
          },
          onError: (err: Error) => {
            Alert.alert("Couldn't submit", err.message || "Please try again.");
          },
        },
      );
      return;
    }

    if (!myParlay) return;
    submitDraftParlay.mutate(myParlay.id, {
      onSuccess: () => {
        Alert.alert("Pick submitted", "Your parlay is pending review.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      },
      onError: (err: Error) => {
        Alert.alert("Couldn't submit", err.message || "Please try again.");
      },
    });
  }

  // Owner can cancel their own parlay only before an admin has approved it —
  // matches the server's cancelOwnParlay check (draft/pending only).
  const canCancel = !!myParlay && (myParlay.status === "draft" || myParlay.status === "pending");

  function cancelParlayAction() {
    if (!myParlay) return;
    Alert.alert("Cancel this parlay?", "This can't be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          cancelParlay.mutate(myParlay.id, {
            onSuccess: () => router.back(),
            onError: (err: Error) => {
              Alert.alert("Couldn't cancel", err.message || "Please try again.");
            },
          });
        },
      },
    ]);
  }

  const slipSummary = activeLegs
    .map((leg) => shortLegLabel(leg, gamesById.get(leg.gameId)))
    .join(" · ");

  const submitPending = isEditingSubmitted ? createParlay.isPending : submitDraftParlay.isPending;
  const loading = leagueLoading || (!readOnly && (lockLoading || myParlayLoading)) || (weekId > 0 && gamesLoading);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Build Pick" }} />
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  if (!readOnly && !activeWeek) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Build Pick" }} />
        <Text style={styles.emptyTitle}>No active week</Text>
        <Text style={styles.emptySubtitle}>Check back when the next week opens.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: readOnly ? "Next Week Preview" : isEditingSubmitted ? "Edit Pick" : "Build Pick",
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
        <View style={styles.headerBar}>
          <Text style={styles.headerCount}>
            {activeLegs.length} / {maxLegs} legs
          </Text>
          <Text style={styles.headerHint}>
            {activeLegs.length < minLegs
              ? `${minLegs - activeLegs.length} more needed`
              : activeLegs.length >= maxLegs
                ? "Max reached"
                : `${maxLegs - activeLegs.length} picks left`}
          </Text>
        </View>
      )}

      <FlatList
        data={games ?? []}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No games this week</Text>
            <Text style={styles.emptySubtitle}>Games will show up once the slate is posted.</Text>
          </View>
        }
        renderItem={({ item }: { item: GameWithBet }) => {
          // The grid's own selection strip only ever reflects a spread/ML/
          // total pick — a player_prop leg on this game is shown separately
          // (via the Add Player Prop footer), never in the 2x3 grid.
          const selected = activeLegs.find((l) => l.gameId === item.id && l.betType !== "player_prop");
          return (
            <GamePickCard
              game={item}
              selectedLeg={selected}
              readOnly={readOnly}
              takenBy={takenByGame.get(item.id)}
              onSelect={({ betType, pick }) =>
                isEditingSubmitted ? toggleLegSubmitted(item, betType, pick) : toggleLegDraft(item, betType, pick)
              }
              onClear={() => (isEditingSubmitted ? clearGameSubmitted(item.id) : clearGameDraft(item.id))}
              onAdjustPoints={(pointsMoved) =>
                isEditingSubmitted ? adjustPointsSubmitted(item, pointsMoved) : void adjustPointsDraft(item, pointsMoved)
              }
              pointsPending={!isEditingSubmitted && pointsAdjustingGameId === item.id}
              onAddProp={!readOnly ? () => setPropGame(item) : undefined}
            />
          );
        }}
      />

      {!readOnly && <View style={[styles.slip, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => setSlipExpanded((v) => !v)}
          style={styles.slipHeader}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.slipCount}>
              {activeLegs.length} / {maxLegs} legs · min {minLegs}
              {activeLegs.length < maxLegs ? ` · ${maxLegs - activeLegs.length} picks left` : ""}
            </Text>
            <Text style={styles.slipSummary} numberOfLines={slipExpanded ? undefined : 1}>
              {activeLegs.length === 0 ? "Tap markets to build your parlay" : slipSummary}
            </Text>
          </View>
          <Ionicons
            name={slipExpanded ? "chevron-down" : "chevron-up"}
            size={18}
            color="#64748b"
          />
        </Pressable>

        {slipExpanded && activeLegs.length > 0 && (
          <View style={styles.slipList}>
            {activeLegs.map((leg, i) => (
              <View key={`${leg.gameId}-${leg.betType}-${leg.playerName ?? ""}-${leg.propType ?? ""}-${i}`} style={styles.slipRow}>
                <Text style={styles.slipRowText} numberOfLines={1}>
                  {shortLegLabel(leg, gamesById.get(leg.gameId))}
                </Text>
                <Pressable
                  onPress={() => removeSlipLeg(leg)}
                  hitSlop={8}
                  disabled={legMutationPending}
                >
                  {legMutationPending && !isEditingSubmitted ? (
                    <ActivityIndicator color="#64748b" size="small" />
                  ) : (
                    <Ionicons name="close-circle" size={20} color="#64748b" />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={submit}
          disabled={!canSubmit || submitPending}
          style={({ pressed }) => [
            styles.submitBtn,
            (!canSubmit || submitPending) && styles.submitBtnDisabled,
            pressed && canSubmit && !submitPending && { opacity: 0.85 },
          ]}
        >
          {submitPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isEditingSubmitted
                ? `Update pick · ${activeLegs.length} legs`
                : `Submit pick · ${activeLegs.length} legs`}
            </Text>
          )}
        </Pressable>

        {canCancel && (
          <Pressable
            onPress={cancelParlayAction}
            disabled={cancelParlay.isPending}
            style={({ pressed }) => [styles.cancelParlayBtn, pressed && { opacity: 0.7 }]}
          >
            {cancelParlay.isPending ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <Text style={styles.cancelParlayBtnText}>Cancel Parlay</Text>
            )}
          </Pressable>
        )}
      </View>}

      <AddPlayerPropModal
        game={propGame}
        onClose={() => setPropGame(null)}
        onAdd={isEditingSubmitted ? (leg) => addPropSubmitted(leg) : (leg) => addDraftLeg.mutateAsync(leg)}
        isPending={!isEditingSubmitted && addDraftLeg.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
