import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLeagues } from "@/hooks/use-leagues";
import { useWeeks, useActiveWeek, useGames } from "@/hooks/use-weeks";
import { useMyParlay } from "@/hooks/use-parlays";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";

function LeagueParlayStatus({ leagueId, weekId }: { leagueId: number; weekId: number }) {
  const { data: parlay, isLoading } = useMyParlay(leagueId, weekId);

  if (isLoading) return null;

  return (
    <View className="flex-row items-center gap-2">
      {parlay ? (
        <>
          <Ionicons
            name={
              parlay.status === "approved"
                ? "checkmark-circle"
                : parlay.status === "rejected"
                ? "close-circle"
                : "time"
            }
            size={16}
            color={
              parlay.status === "approved"
                ? "#22c55e"
                : parlay.status === "rejected"
                ? "#ef4444"
                : "#f59e0b"
            }
          />
          <Text className="text-muted-foreground text-xs capitalize">{parlay.status}</Text>
          <Text className="text-muted-foreground text-xs">· {parlay.legs?.length ?? 0} legs</Text>
        </>
      ) : (
        <>
          <Ionicons name="alert-circle-outline" size={16} color="#71717a" />
          <Text className="text-muted-foreground text-xs">Not submitted</Text>
        </>
      )}
    </View>
  );
}

export default function PicksScreen() {
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const activeWeek = useActiveWeek();

  if (leaguesLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#22c55e" size="large" />
      </View>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Ionicons name="checkmark-circle-outline" size={48} color="#3f3f46" />
        <Text className="text-foreground font-bold text-lg mt-4 mb-2">No leagues yet</Text>
        <Text className="text-muted-foreground text-center text-sm">
          Join or create a league to start submitting picks.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16 }}>
      {activeWeek && (
        <View className="mb-4 flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={16} color="#71717a" />
          <Text className="text-muted-foreground text-sm">
            {activeWeek.name} — {activeWeek.deadline ? format(new Date(activeWeek.deadline), "MMM d, h:mm a") : "No deadline set"}
          </Text>
        </View>
      )}

      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
        This Week's Picks
      </Text>

      {leagues.map((league) => (
        <Card key={league.id} className="mb-3">
          <CardContent>
            <Text className="text-foreground font-semibold mb-2">{league.name}</Text>
            {activeWeek ? (
              <LeagueParlayStatus leagueId={league.id} weekId={activeWeek.id} />
            ) : (
              <Text className="text-muted-foreground text-xs">No active week</Text>
            )}
          </CardContent>
        </Card>
      ))}

      <View className="mt-6 p-4 rounded-xl border border-border bg-card/50 items-center gap-2">
        <Ionicons name="phone-portrait-outline" size={24} color="#3f3f46" />
        <Text className="text-muted-foreground text-sm text-center">
          Full pick submission coming in a future update.{"\n"}
          Visit the web app to submit picks.
        </Text>
      </View>
    </ScrollView>
  );
}
