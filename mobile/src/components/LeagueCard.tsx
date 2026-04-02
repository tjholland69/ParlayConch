import { Pressable, View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface LeagueCardProps {
  league: {
    id: number;
    name: string;
    description?: string | null;
    inviteCode: string;
    isDemo?: boolean | null;
    memberCount?: number;
    isAdmin?: boolean;
    role?: string;
  };
}

export function LeagueCard({ league }: LeagueCardProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/leagues/${league.id}`)}
      className="active:opacity-75"
      testID={`card-league-${league.id}`}
    >
      <Card className="mb-3">
        <CardContent>
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2 flex-wrap mb-1">
                <Text className="text-foreground font-bold text-base">{league.name}</Text>
                {league.isDemo && <Badge variant="warning">DEMO</Badge>}
              </View>
              {league.description && (
                <Text className="text-muted-foreground text-sm" numberOfLines={2}>
                  {league.description}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#71717a" />
          </View>

          <View className="flex-row items-center gap-3 mt-2">
            {league.isAdmin && (
              <Badge variant="success">Parlay Maestro</Badge>
            )}
            {league.role === "lieutenant" && (
              <Badge variant="default">Parlay Lieutenant</Badge>
            )}
            {league.memberCount !== undefined && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="people-outline" size={14} color="#71717a" />
                <Text className="text-muted-foreground text-xs">
                  {league.memberCount} {league.memberCount === 1 ? "member" : "members"}
                </Text>
              </View>
            )}
            <View className="flex-row items-center gap-1">
              <Ionicons name="key-outline" size={14} color="#71717a" />
              <Text className="text-muted-foreground text-xs font-mono">{league.inviteCode}</Text>
            </View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
}
