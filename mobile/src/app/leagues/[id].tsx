import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useNavigation, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useLeagueStats, useLeagueMembersWithUsers, useWeekLockStatus } from "@/hooks/use-leagues";
import { useLeagueParlays } from "@/hooks/use-parlays";
import { useWeeks, useActiveWeek } from "@/hooks/use-weeks";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { format } from "date-fns";

type Tab = "parlays" | "members" | "stats";

function getRoleBadge(role: string) {
  if (role === "admin") return <Badge variant="success">Parlay Maestro</Badge>;
  if (role === "lieutenant") return <Badge variant="default">Parlay Lieutenant</Badge>;
  return null;
}

function getParlayStatusColor(status: string) {
  switch (status) {
    case "approved": return "#22c55e";
    case "rejected": return "#ef4444";
    case "pending": return "#f59e0b";
    default: return "#71717a";
  }
}

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const [activeTab, setActiveTab] = useState<Tab>("parlays");
  const activeWeek = useActiveWeek();

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ["/api/leagues", leagueId],
    queryFn: () => apiRequest("GET", `/api/leagues/${leagueId}`),
    enabled: !!leagueId,
  });

  const { data: members, isLoading: membersLoading } = useLeagueMembersWithUsers(leagueId);
  const { data: stats, isLoading: statsLoading } = useLeagueStats(leagueId);

  const weekId = activeWeek?.id ?? 0;
  const { data: parlays, isLoading: parlaysLoading, refetch: refetchParlays } = useLeagueParlays(
    leagueId,
    weekId
  );
  const { data: lockStatus } = useWeekLockStatus(leagueId, weekId);

  const leagueName = (league as any)?.name ?? "League";

  if (leagueLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#22c55e" size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: leagueName }} />
      <View className="flex-1 bg-background">
        {/* League header */}
        <View className="px-4 py-3 border-b border-border">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-foreground font-bold text-lg">{leagueName}</Text>
            {(league as any)?.isDemo && <Badge variant="warning">DEMO</Badge>}
            {lockStatus?.isLocked && (
              <Badge variant="destructive">
                {lockStatus.hadMissingBets ? "Locked (missing bets)" : "Locked"}
              </Badge>
            )}
          </View>
          {(league as any)?.description && (
            <Text className="text-muted-foreground text-sm mt-1">{(league as any).description}</Text>
          )}
          {activeWeek && (
            <Text className="text-muted-foreground text-xs mt-1.5">
              {activeWeek.name}
              {activeWeek.deadline
                ? ` · Deadline: ${format(new Date(activeWeek.deadline), "MMM d, h:mm a")}`
                : ""}
            </Text>
          )}
        </View>

        {/* Tab bar */}
        <View className="flex-row border-b border-border">
          {(["parlays", "members", "stats"] as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className="flex-1 py-3 items-center"
              testID={`tab-${tab}`}
            >
              <Text
                className={`text-sm font-semibold capitalize ${
                  activeTab === tab ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {tab}
              </Text>
              {activeTab === tab && (
                <View className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </Pressable>
          ))}
        </View>

        {/* Tab content */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={parlaysLoading || membersLoading} onRefresh={refetchParlays} tintColor="#22c55e" />
          }
        >
          {/* PARLAYS TAB */}
          {activeTab === "parlays" && (
            <>
              {parlaysLoading ? (
                <ActivityIndicator color="#22c55e" className="mt-8" />
              ) : !parlays || parlays.length === 0 ? (
                <View className="items-center py-16 gap-3">
                  <Ionicons name="document-outline" size={40} color="#3f3f46" />
                  <Text className="text-muted-foreground text-sm">No parlays submitted yet</Text>
                </View>
              ) : (
                parlays.map((parlay: any) => (
                  <Card key={parlay.id} className="mb-3">
                    <CardContent>
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                          <Avatar
                            src={parlay.user?.profileImageUrl}
                            name={parlay.user?.firstName ?? parlay.user?.email}
                            size={32}
                          />
                          <View>
                            <Text className="text-foreground font-semibold text-sm">
                              {parlay.user?.firstName ?? parlay.user?.email ?? "Unknown"}
                            </Text>
                            <Text className="text-muted-foreground text-xs capitalize">
                              {parlay.status}
                            </Text>
                          </View>
                        </View>
                        <Ionicons
                          name={
                            parlay.status === "approved"
                              ? "checkmark-circle"
                              : parlay.status === "rejected"
                              ? "close-circle"
                              : "time"
                          }
                          size={20}
                          color={getParlayStatusColor(parlay.status)}
                        />
                      </View>

                      {parlay.legs && parlay.legs.length > 0 && (
                        <View className="gap-1 mt-2 pt-2 border-t border-border">
                          {parlay.legs.map((leg: any, i: number) => (
                            <View key={i} className="flex-row items-center gap-2">
                              <View
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    leg.result === "win"
                                      ? "#22c55e"
                                      : leg.result === "loss"
                                      ? "#ef4444"
                                      : "#71717a",
                                }}
                              />
                              <Text className="text-muted-foreground text-xs flex-1" numberOfLines={1}>
                                {leg.game?.homeTeam} vs {leg.game?.awayTeam} — {leg.pick}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}

          {/* MEMBERS TAB */}
          {activeTab === "members" && (
            <>
              {membersLoading ? (
                <ActivityIndicator color="#22c55e" className="mt-8" />
              ) : !members || members.length === 0 ? (
                <View className="items-center py-16">
                  <Text className="text-muted-foreground text-sm">No members found</Text>
                </View>
              ) : (
                members.map((member: any) => (
                  <Card key={member.userId} className="mb-2">
                    <CardContent className="py-3">
                      <View className="flex-row items-center gap-3">
                        <Avatar
                          src={member.user?.profileImageUrl}
                          name={member.user?.firstName ?? member.user?.email}
                          size={36}
                        />
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <Text className="text-foreground font-medium text-sm">
                              {member.user?.firstName
                                ? `${member.user.firstName}${member.user.lastName ? " " + member.user.lastName : ""}`
                                : member.user?.email ?? "Unknown"}
                            </Text>
                            {member.user?.isDemo && <Badge variant="warning">DEMO</Badge>}
                          </View>
                          <View className="flex-row items-center gap-2 mt-1">
                            {getRoleBadge(member.role)}
                          </View>
                        </View>
                      </View>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}

          {/* STATS TAB */}
          {activeTab === "stats" && (
            <>
              {statsLoading ? (
                <ActivityIndicator color="#22c55e" className="mt-8" />
              ) : !stats || stats.length === 0 ? (
                <View className="items-center py-16 gap-3">
                  <Ionicons name="bar-chart-outline" size={40} color="#3f3f46" />
                  <Text className="text-muted-foreground text-sm">No stats yet</Text>
                </View>
              ) : (
                stats.map((stat: any) => (
                  <Card key={stat.userId} className="mb-3">
                    <CardContent>
                      <View className="flex-row items-center gap-3 mb-3">
                        <Avatar
                          src={stat.user?.profileImageUrl}
                          name={stat.user?.firstName ?? stat.user?.email}
                          size={36}
                        />
                        <Text className="text-foreground font-semibold text-sm">
                          {stat.user?.firstName ?? stat.user?.email ?? "Unknown"}
                        </Text>
                      </View>
                      <View className="flex-row justify-between">
                        <View className="items-center">
                          <Text className="text-foreground font-bold text-lg">{stat.wins ?? 0}</Text>
                          <Text className="text-muted-foreground text-xs">Wins</Text>
                        </View>
                        <View className="items-center">
                          <Text className="text-foreground font-bold text-lg">{stat.losses ?? 0}</Text>
                          <Text className="text-muted-foreground text-xs">Losses</Text>
                        </View>
                        <View className="items-center">
                          <Text className="text-primary font-bold text-lg">
                            {stat.winRate != null ? `${Math.round(stat.winRate * 100)}%` : "—"}
                          </Text>
                          <Text className="text-muted-foreground text-xs">Win Rate</Text>
                        </View>
                        <View className="items-center">
                          <Text className="text-foreground font-bold text-lg">{stat.parlays ?? 0}</Text>
                          <Text className="text-muted-foreground text-xs">Parlays</Text>
                        </View>
                      </View>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}
