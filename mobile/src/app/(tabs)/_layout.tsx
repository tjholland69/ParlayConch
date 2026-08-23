import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Shell } from "lucide-react-native";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";
import { BottomTabBar } from "@/components/BottomTabBar";

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

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
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
        }}
      />
      <Tabs.Screen name="picks" options={{ title: "My Picks" }} />
      <Tabs.Screen name="leagues" options={{ title: "Leagues" }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profile",
          href: null,
          headerRight: () => null,
          headerLeft: () => <BackButton />,
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
