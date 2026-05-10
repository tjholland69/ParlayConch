import { View, Text, StyleSheet } from "react-native";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <View style={[styles.base, styles[`bg_${variant}`]]}>
      <Text style={[styles.text, styles[`text_${variant}`]]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },

  bg_default: { backgroundColor: "#2563eb" },
  bg_success: { backgroundColor: "#0a2e18" },
  bg_warning: { backgroundColor: "#2d2000" },
  bg_destructive: { backgroundColor: "#2c0e0e" },
  bg_secondary: { backgroundColor: "#1e2a3b" },
  bg_outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#2a3447" },

  text_default: { color: "#ffffff" },
  text_success: { color: "#22c55e" },
  text_warning: { color: "#f59e0b" },
  text_destructive: { color: "#ef4444" },
  text_secondary: { color: "#94a3b8" },
  text_outline: { color: "#94a3b8" },
});
