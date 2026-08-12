import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View, Text, Pressable, StyleSheet } from "react-native";
import { Shell } from "lucide-react-native";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const FOCUSED_ICONS: Partial<Record<IconName, IconName>> = {
  "grid-outline": "grid",
  "checkmark-circle-outline": "checkmark-circle",
  "trophy-outline": "trophy",
};

function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dash"))}
      hitSlop={10}
      style={{ marginLeft: 8, padding: 4 }}
    >
      <Ionicons name="chevron-back" size={26} color="#f1f5f9" />
    </Pressable>
  );
}

function TabIcon({
  name,
  focused,
  color,
  size,
}: {
  name: IconName;
  focused: boolean;
  color: string;
  size: number;
}) {
  return <Ionicons name={(focused && FOCUSED_ICONS[name]) || name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#1c2538",
          borderTopColor: "#2a3447",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#475569",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
        headerStyle: {
          backgroundColor: "#1c2538",
        },
        headerTintColor: "#f1f5f9",
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 17,
          letterSpacing: 0.3,
        },
        headerShadowVisible: false,
        headerTitleAlign: "center",
        headerRight: () => <HeaderAvatarButton />,
      }}
    >
      <Tabs.Screen
        name="dash"
        options={{
          title: "Dash",
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Shell size={22} color="#2563eb" />
              <Text style={styles.headerTitleText}>PARLAYCONCH</Text>
            </View>
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="grid-outline" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="picks"
        options={{
          title: "My Picks",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="checkmark-circle-outline" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: "Leagues",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="trophy-outline" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profile",
          href: null,
          headerRight: () => null,
          headerLeft: () => <BackButton />,
          tabBarStyle: { display: "none" },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitleText: {
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
