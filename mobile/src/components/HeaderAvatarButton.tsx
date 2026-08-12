import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/ui/Avatar";

/** Tapping the initials circle is how Profile & Settings are reached — they're
 * intentionally off the bottom tab bar to keep it to Dash / My Picks / Leagues. */
export function HeaderAvatarButton() {
  const router = useRouter();
  const { user } = useAuth();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "You";

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push("/(tabs)/settings")}
        hitSlop={10}
        style={({ pressed }) => [pressed && styles.pressed]}
        testID="button-header-avatar"
      >
        <Avatar src={user?.profileImageUrl} name={displayName} size={32} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingRight: 16 },
  pressed: { opacity: 0.7 },
});