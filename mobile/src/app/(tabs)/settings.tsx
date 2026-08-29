import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SPORTSBOOK_PROVIDERS, type SportsbookProvider } from "@shared/sportsbook-providers";
import { useActingAs, useSuperUserSearch, useSetActAs, useClearActAs } from "@/hooks/use-acting-as";
import { ACCENT_PRESETS, DEFAULT_ACCENT } from "@/lib/theme";
import { useAccentColor } from "@/hooks/use-accent-color";
import { NFL_TEAMS } from "@/lib/nflTeams";
import { useTeams } from "@/hooks/use-teams";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type NotificationPreferences = { email: boolean; sms: boolean; push: boolean; phone?: string };
const DEFAULT_NOTIF_PREFS: NotificationPreferences = { email: true, sms: false, push: true };

type ThemeMode = "dark" | "light" | "system";

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: IconName }[] = [
  { key: "dark", label: "Dark", icon: "moon-outline" },
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "system", label: "System", icon: "phone-portrait-outline" },
];

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

/** Super-user-only "act as" panel — mirrors the web app's ActForBar, using
 * the same /api/superuser/* endpoints (no backend changes needed). */
function ActForSection() {
  const accent = useAccentColor();
  const { data: actingAsData } = useActingAs();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: results = [], isFetching } = useSuperUserSearch(query, searchOpen);
  const setActAs = useSetActAs();
  const clearActAs = useClearActAs();

  const actingAs = actingAsData?.actingAs;

  if (actingAs) {
    const name = actingAs.settings?.displayName || actingAs.firstName || actingAs.email || "Unknown";
    return (
      <>
        <Section label="Super User" />
        <View style={styles.card}>
          <View style={styles.actingAsBanner}>
            <Ionicons name="person-circle-outline" size={18} color="#f59e0b" />
            <Text style={styles.actingAsText} numberOfLines={1}>Acting as {name}</Text>
            <Pressable
              onPress={() => clearActAs.mutate(undefined, { onError: () => Alert.alert("Error", "Couldn't return to your account.") })}
              disabled={clearActAs.isPending}
              style={styles.actingAsExitBtn}
              testID="button-settings-exit-act-as"
            >
              {clearActAs.isPending ? (
                <ActivityIndicator size="small" color="#f59e0b" />
              ) : (
                <Text style={styles.actingAsExitText}>Exit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Section label="Super User" />
      <View style={styles.card}>
        <View style={styles.actForSearchRow}>
          <Ionicons name="search-outline" size={16} color="#64748b" />
          <TextInput
            style={styles.actForSearchInput}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Act for user (name or email)…"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            testID="input-settings-act-for-search"
          />
        </View>
        {searchOpen && (
          <View>
            {isFetching ? (
              <ActivityIndicator size="small" color={accent} style={styles.actForLoading} />
            ) : results.length === 0 ? (
              <Text style={styles.actForEmpty}>{query ? `No users found for "${query}"` : "No users found"}</Text>
            ) : (
              results.map((u) => {
                const name = u.settings?.displayName || u.firstName || u.email || "Unknown";
                return (
                  <Pressable
                    key={u.id}
                    onPress={() =>
                      setActAs.mutate(u.id, {
                        onSuccess: () => {
                          setSearchOpen(false);
                          setQuery("");
                        },
                        onError: () => Alert.alert("Error", "Couldn't switch to that user."),
                      })
                    }
                    disabled={setActAs.isPending}
                    style={({ pressed }) => [styles.actForResultRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.actForResultName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.actForResultEmail} numberOfLines={1}>{u.email}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        )}
      </View>
    </>
  );
}

export default function SettingsScreen() {
  const { user, logout, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();
  const accent = useAccentColor();
  const insets = useSafeAreaInsets();

  const toggleDemoMutation = useMutation({
    mutationFn: (isDemo: boolean) =>
      apiRequest("PATCH", "/api/users/me/demo", { isDemo }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
    onError: () =>
      Alert.alert("Error", "Could not update demo mode. Please try again."),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      apiRequest("PATCH", "/api/users/me/settings", settings),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
    onError: () =>
      Alert.alert("Error", "Could not save settings. Please try again."),
  });

  const updateNotifPrefsMutation = useMutation({
    mutationFn: (prefs: NotificationPreferences) =>
      apiRequest("PATCH", "/api/users/me/notification-preferences", prefs),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
    onError: () =>
      Alert.alert("Error", "Could not save notification preferences. Please try again."),
  });

  const preferredSportsbook = (user?.settings as any)?.preferredSportsbook as
    | SportsbookProvider
    | undefined;
  const preferredSportsbookOther = (user?.settings as any)?.preferredSportsbookOther as
    | string
    | undefined;

  function promptOtherSportsbook() {
    Alert.prompt(
      "Other Sportsbook",
      "Enter the name of your sportsbook.",
      (text) => {
        const trimmed = text?.trim();
        if (!trimmed) return;
        updateSettingsMutation.mutate({ preferredSportsbook: "other", preferredSportsbookOther: trimmed });
      },
      "plain-text",
      preferredSportsbookOther ?? "",
    );
  }

  function choosePreferredSportsbook() {
    Alert.alert(
      "Preferred Sportsbook",
      "Used to send approved parlays straight to the right game in your sportsbook app.",
      [
        ...Object.values(SPORTSBOOK_PROVIDERS).map((provider) => ({
          text: provider.label,
          onPress: () => updateSettingsMutation.mutate({ preferredSportsbook: provider.id, preferredSportsbookOther: null }),
        })),
        { text: "Other…", onPress: promptOtherSportsbook },
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }

  const savedDisplayName = (user?.settings as any)?.displayName || user?.firstName || "";
  const [displayName, setDisplayName] = useState(savedDisplayName);
  const [editingName, setEditingName] = useState(false);
  useEffect(() => setDisplayName(savedDisplayName), [savedDisplayName]);

  function saveDisplayName() {
    if (!displayName.trim()) return;
    updateSettingsMutation.mutate(
      { displayName: displayName.trim() },
      { onSuccess: () => setEditingName(false) },
    );
  }

  const savedAccent = (user?.settings as any)?.primaryColor || DEFAULT_ACCENT;
  const savedTheme = ((user?.settings as any)?.theme as ThemeMode) || "dark";

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS);
  useEffect(() => {
    const stored = (user?.settings as any)?.notificationPreferences as NotificationPreferences | undefined;
    if (stored) setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...stored });
  }, [user]);

  function updateNotifPref(patch: Partial<NotificationPreferences>) {
    const next = { ...notifPrefs, ...patch };
    setNotifPrefs(next);
    updateNotifPrefsMutation.mutate(next);
  }

  const nameForAvatar = savedDisplayName || user?.email || "Unknown";
  const avatarTeam = (user?.settings as any)?.avatarTeam as string | undefined;
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const { data: teams } = useTeams();
  const teamLogo = (code: string) => teams?.find((t) => t.abbreviation === code)?.logoUrl ?? undefined;

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
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Profile hero */}
      <View style={styles.profileCard}>
        <Pressable onPress={() => setAvatarPickerOpen(true)} testID="button-settings-choose-avatar">
          <Avatar
            src={avatarTeam ? teamLogo(avatarTeam) : user?.profileImageUrl}
            name={nameForAvatar}
            size={68}
            teamCode={avatarTeam}
          />
          <View style={styles.avatarEditBadge}>
            <Ionicons name="pencil" size={11} color="#ffffff" />
          </View>
        </Pressable>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{nameForAvatar}</Text>
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

      {/* Profile */}
      <Section label="Profile" />
      <View style={styles.card}>
        {editingName ? (
          <View style={styles.editNameRow}>
            <TextInput
              style={styles.editNameInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor="#475569"
              autoFocus
              testID="input-settings-display-name"
            />
            <Button
              size="sm"
              loading={updateSettingsMutation.isPending}
              disabled={!displayName.trim() || displayName.trim() === savedDisplayName}
              onPress={saveDisplayName}
              testID="button-settings-save-name"
            >
              Save
            </Button>
            <Pressable onPress={() => { setEditingName(false); setDisplayName(savedDisplayName); }} hitSlop={8}>
              <Ionicons name="close" size={20} color="#64748b" />
            </Pressable>
          </View>
        ) : (
          <Row icon="person-outline" label="Display Name" value={nameForAvatar} onPress={() => setEditingName(true)} />
        )}
        <Divider />
        <Row
          icon="mail-outline"
          label="Email"
          value={user?.email ?? "Not set"}
        />
        <Divider />
        <Row
          icon="shield-checkmark-outline"
          iconColor={accent}
          label="Sign-in method"
          value="Email & password"
        />
      </View>

      {/* Appearance */}
      <Section label="Appearance" />
      <View style={styles.card}>
        <View style={styles.appearanceBlock}>
          <Text style={styles.appearanceLabel}>Accent Color</Text>
          <View style={styles.accentRow}>
            {ACCENT_PRESETS.map((preset) => {
              const active = savedAccent === preset.value;
              return (
                <Pressable
                  key={preset.value}
                  onPress={() => updateSettingsMutation.mutate({ primaryColor: preset.value })}
                  style={[styles.accentSwatch, { backgroundColor: preset.swatch }, active && styles.accentSwatchActive]}
                  testID={`button-settings-accent-${preset.label.toLowerCase()}`}
                >
                  {active && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                </Pressable>
              );
            })}
          </View>
        </View>
        <Divider />
        <View style={styles.appearanceBlock}>
          <Text style={styles.appearanceLabel}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = savedTheme === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => updateSettingsMutation.mutate({ theme: opt.key })}
                  style={[styles.themeChip, active && styles.themeChipActive]}
                  testID={`button-settings-theme-${opt.key}`}
                >
                  <Ionicons name={opt.icon} size={15} color={active ? "#93c5fd" : "#94a3b8"} />
                  <Text style={[styles.themeChipText, active && styles.themeChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Notifications */}
      <Section label="Notifications" />
      <View style={styles.card}>
        <Row
          icon="mail-outline"
          label="Email"
          right={
            <Switch
              value={notifPrefs.email}
              onValueChange={(val) => updateNotifPref({ email: val })}
              trackColor={{ false: "#1e2a3b", true: accent }}
              thumbColor="#ffffff"
              testID="switch-notif-email"
            />
          }
        />
        <Divider />
        <Row
          icon="chatbubble-outline"
          label="SMS"
          right={
            <Switch
              value={notifPrefs.sms}
              onValueChange={(val) => updateNotifPref({ sms: val })}
              trackColor={{ false: "#1e2a3b", true: accent }}
              thumbColor="#ffffff"
              testID="switch-notif-sms"
            />
          }
        />
        {notifPrefs.sms && (
          <View style={styles.phoneRow}>
            <TextInput
              style={styles.phoneInput}
              value={notifPrefs.phone ?? ""}
              onChangeText={(v) => setNotifPrefs((p) => ({ ...p, phone: v }))}
              onEndEditing={() => updateNotifPrefsMutation.mutate(notifPrefs)}
              placeholder="Phone number"
              placeholderTextColor="#475569"
              keyboardType="phone-pad"
              testID="input-notif-phone"
            />
          </View>
        )}
        <Divider />
        <Row
          icon="notifications-outline"
          label="Push"
          right={
            <Switch
              value={notifPrefs.push}
              onValueChange={(val) => updateNotifPref({ push: val })}
              trackColor={{ false: "#1e2a3b", true: accent }}
              thumbColor="#ffffff"
              testID="switch-notif-push"
            />
          }
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
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <Switch
                value={!!user?.isDemo}
                onValueChange={(val) => toggleDemoMutation.mutate(val)}
                trackColor={{ false: "#1e2a3b", true: accent }}
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
          iconColor={accent}
          label="Preferred Sportsbook"
          value={
            updateSettingsMutation.isPending
              ? "Updating…"
              : preferredSportsbook === "other"
              ? preferredSportsbookOther || "Other"
              : preferredSportsbook
              ? SPORTSBOOK_PROVIDERS[preferredSportsbook].label
              : "Not set"
          }
          onPress={choosePreferredSportsbook}
        />
      </View>

      {/* Super user act-as */}
      {user?.isSuperUser && <ActForSection />}

      {/* App info */}
      <Section label="About" />
      <View style={styles.card}>
        <Row
          icon="trophy-outline"
          iconColor={accent}
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

    <Modal visible={avatarPickerOpen} transparent animationType="slide" onRequestClose={() => setAvatarPickerOpen(false)}>
      <View style={styles.modalWrap}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAvatarPickerOpen(false)} />
        <View style={[styles.avatarSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.modalTitle}>Choose Avatar</Text>
          <Text style={styles.modalSubtitle}>
            Pick a team badge for now — uploading your own photo is coming soon.
          </Text>
          <ScrollView contentContainerStyle={styles.teamGrid}>
            <Pressable
              onPress={() => {
                updateSettingsMutation.mutate({ avatarTeam: null });
                setAvatarPickerOpen(false);
              }}
              style={({ pressed }) => [styles.teamOption, pressed && { opacity: 0.7 }]}
              testID="option-avatar-initials"
            >
              <Avatar name={nameForAvatar} size={52} />
              <Text style={styles.teamOptionLabel} numberOfLines={1}>Initials</Text>
            </Pressable>
            {NFL_TEAMS.map((team) => (
              <Pressable
                key={team.code}
                onPress={() => {
                  updateSettingsMutation.mutate({ avatarTeam: team.code });
                  setAvatarPickerOpen(false);
                }}
                style={({ pressed }) => [styles.teamOption, pressed && { opacity: 0.7 }]}
                testID={`option-avatar-team-${team.code}`}
              >
                <Avatar src={teamLogo(team.code)} teamCode={team.code} size={52} />
                <Text style={styles.teamOptionLabel} numberOfLines={1}>{team.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
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
  avatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
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

  editNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editNameInput: {
    flex: 1,
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },

  appearanceBlock: { padding: 16, gap: 10 },
  appearanceLabel: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  accentRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  accentSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  accentSwatchActive: { borderWidth: 2, borderColor: "#f1f5f9" },
  themeRow: { flexDirection: "row", gap: 8 },
  themeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a3447",
    backgroundColor: "#141926",
  },
  themeChipActive: { borderColor: "#2563eb", backgroundColor: "#1e2a3b" },
  themeChipText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  themeChipTextActive: { color: "#93c5fd" },

  phoneRow: { paddingHorizontal: 16, paddingBottom: 12 },
  phoneInput: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },

  actingAsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  actingAsText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#fbbf24" },
  actingAsExitBtn: {
    backgroundColor: "#2d2000",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center",
  },
  actingAsExitText: { fontSize: 12, fontWeight: "700", color: "#f59e0b" },
  actForSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actForSearchInput: { flex: 1, fontSize: 14, color: "#f1f5f9" },
  actForLoading: { paddingVertical: 12 },
  actForEmpty: { fontSize: 13, color: "#64748b", textAlign: "center", paddingVertical: 16 },
  actForResultRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1e2a3b",
  },
  actForResultName: { fontSize: 14, fontWeight: "600", color: "#f1f5f9" },
  actForResultEmail: { fontSize: 12, color: "#64748b", marginTop: 1 },

  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9", marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: "#94a3b8", marginBottom: 16 },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 20,
  },
  avatarSheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    maxHeight: "75%",
  },
  teamGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingBottom: 8 },
  teamOption: { width: 72, alignItems: "center", gap: 6 },
  teamOptionLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "600", textAlign: "center" },
});
