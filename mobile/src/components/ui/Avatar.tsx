import { View, Image, Text } from "react-native";

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

function getAvatarColor(name?: string | null): string {
  const colors = [
    "#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b",
    "#ef4444", "#06b6d4", "#ec4899", "#f97316",
  ];
  if (!name) return colors[0];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function Avatar({ src, name, size = 40 }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        defaultSource={{ uri: "" }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#09090b",
          fontWeight: "700",
          fontSize: size * 0.38,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}
