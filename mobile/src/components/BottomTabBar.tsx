import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { outline: IconName; filled: IconName; label: string }> = {
  dash: { outline: "grid-outline", filled: "grid", label: "Dash" },
  picks: { outline: "checkmark-circle-outline", filled: "checkmark-circle", label: "Your Parlays" },
  leagues: { outline: "trophy-outline", filled: "trophy", label: "Leagues" },
};

/** Bottom-2 order shown here left-to-right (settings has href:null and is
 * accessed via the header avatar, never rendered in the bar). "picks" is
 * rendered as a raised action button in the center — the app's primary
 * action (submitting a pick) deserves more visual weight than a plain tab. */
export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Settings has no tab icon (accessed via the header avatar) and hides the
  // bar entirely while focused, same as the default tabBarStyle:none did.
  if (state.routes[state.index]?.name === "settings") return null;
  const routes = state.routes.filter((r) => TAB_ICONS[r.name]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 8) }]}>
      {routes.map((route) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index].key === route.key;
        const meta = TAB_ICONS[route.name];
        const isCenter = route.name === "picks";

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isCenter) {
          return (
            <View key={route.key} style={styles.centerSlot}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.title ?? meta.label}
                style={({ pressed }) => [
                  styles.centerButton,
                  isFocused && styles.centerButtonActive,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
                ]}
              >
                <Ionicons name={isFocused ? meta.filled : meta.outline} size={26} color="#fff" />
              </Pressable>
              <Text style={[styles.centerLabel, isFocused && styles.labelActive]}>{meta.label}</Text>
            </View>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.title ?? meta.label}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Ionicons name={isFocused ? meta.filled : meta.outline} size={24} color={isFocused ? "#2563eb" : "#475569"} />
            <Text style={[styles.label, isFocused && styles.labelActive]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#1c2538",
    borderTopColor: "#2a3447",
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingTop: 6,
    minHeight: 48,
    justifyContent: "center",
  },
  tabPressed: { opacity: 0.7 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: "#475569",
  },
  labelActive: {
    color: "#2563eb",
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -28,
    borderWidth: 4,
    borderColor: "#1c2538",
    shadowColor: "#2563eb",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  centerButtonActive: {
    backgroundColor: "#3b82f6",
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#475569",
    marginTop: 4,
  },
});
