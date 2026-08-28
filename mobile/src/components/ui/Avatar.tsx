import { View, Image, Text, StyleSheet } from "react-native";
import { NFL_TEAMS } from "@/lib/nflTeams";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  /** A team code from NFL_TEAMS (e.g. "KC") — takes priority over `src` when
   * set, since picking a team badge is an explicit choice in Settings. */
  teamCode?: string | null;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Every fallback avatar shares this one brand color — matches the web app's
 * UserAvatar (a fixed primary/accent gradient), rather than picking a color
 * per user from a hash of their name. */
const AVATAR_COLOR = "#2563eb";

export function Avatar({ src, name, size = 40, teamCode }: AvatarProps) {
  const fontSize = size * 0.36;
  const borderRadius = size / 2;

  // `src` (a real photo, or a resolved team logo URL once /api/teams has
  // loaded) wins when present; `teamCode` is the instant colored-circle
  // fallback for a chosen team badge while that lookup is still in flight.
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  const team = teamCode ? NFL_TEAMS.find((t) => t.code === teamCode) : undefined;
  if (team) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius, backgroundColor: team.color },
        ]}
      >
        <Text style={[styles.initials, { fontSize: fontSize * 0.85, lineHeight: size }]}>
          {team.code}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius, backgroundColor: AVATAR_COLOR },
      ]}
    >
      <Text style={[styles.initials, { fontSize, lineHeight: size }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#ffffff", fontWeight: "700" },
});
