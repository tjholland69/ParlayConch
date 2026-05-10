import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const FOCUSED_ICONS: Partial<Record<IconName, IconName>> = {
  "trophy-outline": "trophy",
  "checkmark-circle-outline": "checkmark-circle",
  "person-circle-outline": "person-circle",
};

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
      }}
    >
      <Tabs.Screen
        name="leagues"
        options={{
          title: "Leagues",
          headerTitle: "Parlay.Conch",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="trophy-outline" focused={focused} color={color} size={size} />
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
        name="settings"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="person-circle-outline" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
