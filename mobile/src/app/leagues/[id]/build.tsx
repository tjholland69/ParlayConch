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
} from "@/hooks/use-parlays";
import { GamePickCard } from "@/components/GamePickCard";
import {
  getLineForBet,
  shortLegLabel,
  type SelectedLeg,
} from "@/lib/pickHelpers";
import type { Game, GameWithBet } from "@shared/schema";

export default function BuildPickScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeWeek = useActiveWeek();
  const weekId = activeWeek?.id ?? 0;

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["/api/leagues", leagueId],
    queryFn: () => apiRequest<{ name?: string; minLegsPerParlay?: number | null; maxLegsPerParlay?: number | null }>(
      "GET",
      `/api/leagues/${leagueId}`,
    ),
    enabled: !!leagueId,
  });

  const { data: lockStatus, isLoading: lockLoading } = useWeekLockStatus(leagueId, weekId);
  const { data: myParlay, isLoading: myParlayLoading } = useMyParlay(leagueId, weekId);
  const { data: games, isLoading: gamesLoading } = useGames(weekId);
  const createParlay = useCreateParlay(leagueId);
  const addDraftLeg = useAddDraftLeg(leagueId, weekId);
  const removeDraftLeg = useRemoveDraftLeg(leagueId, weekId);
  const submitDraftParlay = useSubmitDraftParlay(leagueId, weekId);

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
      }));
    if (legs.length) {
      setSelectedLegs(legs);
      setPrefilled(true);
    }
  }, [isEditingSubmitted, myParlay, prefilled]);

  useEffect(() => {
    if (!lockLoading && lockStatus?.isLocked) {
      router.replace({ pathname: "/leagues/[id]", params: { id: String(leagueId) } });
    }
  }, [lockLoading, lockStatus?.isLocked, leagueId, router]);

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
    setSelectedLegs((prev) => {
      const existing = prev.findIndex((l) => l.gameId === game.id);
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
  }

  async function toggleLegDraft(game: Game, betType: string, pick: string) {
    if (legMutationPending) return;
    const line = getLineForBet(game, betType, pick);
    const existingLeg = (myParlay?.legs ?? []).find((l) => l.gameId === game.id);

    try {
      if (existingLeg) {
        // Same pick tapped again → remove it (deselect).
        if (existingLeg.pick === pick && existingLeg.betType === betType) {
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
  }

  function clearGameSubmitted(gameId: number) {
    setSelectedLegs((prev) => prev.filter((l) => l.gameId !== gameId));
  }

  async function clearGameDraft(gameId: number) {
    const existingLeg = (myParlay?.legs ?? []).find((l) => l.gameId === gameId);
    if (!existingLeg || legMutationPending) return;
    try {
      await removeDraftLeg.mutateAsync({ parlayId: existingLeg.parlayId, legId: existingLeg.id });
    } catch (err) {
      Alert.alert("Couldn't remove leg", err instanceof Error ? err.message : "Please try again.");
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

  const slipSummary = activeLegs
    .map((leg) => shortLegLabel(leg, gamesById.get(leg.gameId)))
    .join(" · ");

  const submitPending = isEditingSubmitted ? createParlay.isPending : submitDraftParlay.isPending;
  const loading = leagueLoading || lockLoading || myParlayLoading || (weekId > 0 && gamesLoading);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Build Pick" }} />
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  if (!activeWeek) {
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
          title: isEditingSubmitted ? "Edit Pick" : "Build Pick",
          headerBackTitle: "Back",
        }}
      />

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
          const selected = activeLegs.find((l) => l.gameId === item.id);
          return (
            <GamePickCard
              game={item}
              selectedLeg={selected}
              onSelect={({ betType, pick }) =>
                isEditingSubmitted ? toggleLegSubmitted(item, betType, pick) : toggleLegDraft(item, betType, pick)
              }
              onClear={() => (isEditingSubmitted ? clearGameSubmitted(item.id) : clearGameDraft(item.id))}
            />
          );
        }}
      />

      <View style={[styles.slip, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
            {activeLegs.map((leg) => (
              <View key={leg.gameId} style={styles.slipRow}>
                <Text style={styles.slipRowText} numberOfLines={1}>
                  {shortLegLabel(leg, gamesById.get(leg.gameId))}
                </Text>
                <Pressable
                  onPress={() => (isEditingSubmitted ? clearGameSubmitted(leg.gameId) : clearGameDraft(leg.gameId))}
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
      </View>
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
});
