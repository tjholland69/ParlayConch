import { Pressable, View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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

  const roleLabel = league.isAdmin
    ? "Parlay Maestro"
    : league.role === "lieutenant"
    ? "Parlay Lieutenant"
    : "Member";

  const roleColor = league.isAdmin
    ? "#2563eb"
    : league.role === "lieutenant"
    ? "#0ea5e9"
    : "#475569";

  return (
    <Pressable
      onPress={() => router.push(`/leagues/${league.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`card-league-${league.id}`}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: roleColor }]} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.name} numberOfLines={1}>{league.name}</Text>
            {league.isDemo && (
              <View style={styles.demoPill}>
                <Text style={styles.demoPillText}>DEMO</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#374151" />
        </View>

        {league.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {league.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
            <Text style={[styles.metaText, { color: roleColor }]}>{roleLabel}</Text>
          </View>

          {league.memberCount !== undefined && (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={13} color="#475569" />
              <Text style={styles.metaTextMuted}>
                {league.memberCount} {league.memberCount === 1 ? "member" : "members"}
              </Text>
            </View>
          )}

          {league.isAdmin && (
            <View style={styles.metaItem}>
              <Ionicons name="key-outline" size={13} color="#475569" />
              <Text style={styles.inviteCode}>{league.inviteCode}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
    marginBottom: 10,
    overflow: "hidden",
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  accentBar: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  body: { flex: 1, padding: 14 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  titleBlock: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  name: { fontSize: 16, fontWeight: "700", color: "#f1f5f9", flex: 1 },
  demoPill: {
    backgroundColor: "#2d2000",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  demoPillText: { fontSize: 9, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.5 },
  description: { fontSize: 13, color: "#94a3b8", marginBottom: 10, lineHeight: 18 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { fontSize: 12, fontWeight: "600" },
  metaTextMuted: { fontSize: 12, color: "#475569" },
  inviteCode: { fontSize: 12, color: "#475569", fontWeight: "600", letterSpacing: 1 },
});
