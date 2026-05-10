import { View, Image, Text, StyleSheet } from "react-native";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
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

const AVATAR_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#7c3aed",
  "#d97706",
  "#dc2626",
  "#059669",
  "#db2777",
  "#ea580c",
];

function getAvatarColor(name?: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function Avatar({ src, name, size = 40 }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);
  const fontSize = size * 0.36;
  const borderRadius = size / 2;

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius, backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.initials, { fontSize, lineHeight: size }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#ffffff", fontWeight: "700" },
});
