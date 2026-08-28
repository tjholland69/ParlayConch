import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useTeams } from "@/hooks/use-teams";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";

/** Tapping the initials circle is how Profile & Settings are reached — they're
 * intentionally off the bottom tab bar to keep it to Dash / My Picks / Leagues. */
export function HeaderAvatarButton() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: teams } = useTeams();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "You";

  const avatarTeam = (user?.settings as any)?.avatarTeam as string | undefined;
  const teamLogoUrl = avatarTeam ? teams?.find((t) => t.abbreviation === avatarTeam)?.logoUrl : undefined;

  return (
    <View style={styles.wrap}>
      <IconButton
        onPress={() => router.push("/(tabs)/settings")}
        accessibilityLabel="Profile and settings"
        testID="button-header-avatar"
      >
        <Avatar
          src={teamLogoUrl ?? (avatarTeam ? undefined : user?.profileImageUrl)}
          name={displayName}
          size={32}
          teamCode={avatarTeam}
        />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingRight: 12 },
});