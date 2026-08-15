import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { SPORTSBOOK_PROVIDERS, type SportsbookProvider } from "@shared/sportsbook-providers";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface RowProps {
  icon: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}

function Row({ icon, iconColor, label, value, onPress, right, danger }: RowProps) {
  const content = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? "#ef4444" : (iconColor ?? "#94a3b8")}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {value !== undefined && (
          <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
        )}
      </View>
      {right !== undefined
        ? right
        : onPress
        ? <Ionicons name="chevron-forward" size={15} color="#374151" />
        : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && styles.rowPressed}
        testID={`button-settings-${label.toLowerCase().replace(/ /g, "-")}`}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

function Divider() {
  return <View style={styles.divider} />;
}

function Section({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>;
}

export default function SettingsScreen() {
  const { user, logout, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();

  const toggleDemoMutation = useMutation({
    mutationFn: (isDemo: boolean) =>
      apiRequest("PATCH", "/api/users/me/demo", { isDemo }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
    onError: () =>
      Alert.alert("Error", "Could not update demo mode. Please try again."),
  });

  const updateSportsbookMutation = useMutation({
    mutationFn: (preferredSportsbook: SportsbookProvider) =>
      apiRequest("PATCH", "/api/users/me/settings", { preferredSportsbook }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
    onError: () =>
      Alert.alert("Error", "Could not update your sportsbook. Please try again."),
  });

  const preferredSportsbook = (user?.settings as any)?.preferredSportsbook as
    | SportsbookProvider
    | undefined;

  function choosePreferredSportsbook() {
    Alert.alert(
      "Preferred Sportsbook",
      "Used to send approved parlays straight to the right game in your sportsbook app.",
      [
        ...Object.values(SPORTSBOOK_PROVIDERS).map((provider) => ({
          text: provider.label,
          onPress: () => updateSportsbookMutation.mutate(provider.id),
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Unknown";

  function confirmLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Profile hero */}
      <View style={styles.profileCard}>
        <Avatar src={user?.profileImageUrl} name={displayName} size={68} />
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{displayName}</Text>
          {user?.email && (
            <Text style={styles.profileEmail}>{user.email}</Text>
          )}
          {user?.isDemo && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </View>
          )}
        </View>
      </View>

      {/* Account */}
      <Section label="Account" />
      <View style={styles.card}>
        <Row icon="person-outline" label="Name" value={displayName} />
        <Divider />
        <Row
          icon="mail-outline"
          label="Email"
          value={user?.email ?? "Not set"}
        />
        <Divider />
        <Row
          icon="shield-checkmark-outline"
          iconColor="#2563eb"
          label="Sign-in method"
          value="Email & password"
        />
      </View>

      {/* Preferences */}
      <Section label="Preferences" />
      <View style={styles.card}>
        <Row
          icon="flask-outline"
          iconColor="#f59e0b"
          label="Demo / QA mode"
          value="Marks your account as test data"
          right={
            toggleDemoMutation.isPending ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Switch
                value={!!user?.isDemo}
                onValueChange={(val) => toggleDemoMutation.mutate(val)}
                trackColor={{ false: "#1e2a3b", true: "#2563eb" }}
                thumbColor="#ffffff"
                disabled={toggleDemoMutation.isPending}
                testID="switch-demo-mode"
              />
            )
          }
        />
        <Divider />
        <Row
          icon="football-outline"
          iconColor="#2563eb"
          label="Preferred Sportsbook"
          value={
            updateSportsbookMutation.isPending
              ? "Updating…"
              : preferredSportsbook
              ? SPORTSBOOK_PROVIDERS[preferredSportsbook].label
              : "Not set"
          }
          onPress={choosePreferredSportsbook}
        />
      </View>

      {/* App info */}
      <Section label="About" />
      <View style={styles.card}>
        <Row
          icon="trophy-outline"
          iconColor="#2563eb"
          label="Parlay.Conch"
          value={`Version ${Constants.expoConfig?.version ?? "1.0.0"} (iOS)`}
        />
        <Divider />
        <Row
          icon="globe-outline"
          label="Full web app"
          value="parlayconch.com"
        />
      </View>

      {/* Sign out */}
      <Section label="Session" />
      <View style={styles.card}>
        <Row
          icon="log-out-outline"
          label={isLoggingOut ? "Signing out…" : "Sign Out"}
          onPress={confirmLogout}
          danger
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  content: { paddingBottom: 48 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    marginBottom: 8,
  },
  profileText: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  profileEmail: { fontSize: 13, color: "#94a3b8", marginTop: 2 },
  demoBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#2d2000",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  demoBadgeText: { fontSize: 10, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.5 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: "#1c2538",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#2a3447",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#1e2a3b",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: "#2c0e0e" },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, color: "#f1f5f9", fontWeight: "500" },
  rowLabelDanger: { color: "#ef4444" },
  rowValue: { fontSize: 13, color: "#94a3b8", marginTop: 1 },
  rowPressed: { opacity: 0.7 },
  divider: { height: 1, backgroundColor: "#1e2a3b", marginLeft: 62 },
});
