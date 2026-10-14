import { isSubcommittee, leagueTerms, subcommitteeWording } from "@shared/subcommittee";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLeagues, useLeagueMembersWithUsers } from "@/hooks/use-leagues";
import { useAccentColor } from "@/hooks/use-accent-color";
import { apiRequest, API_BASE_URL } from "@/lib/api";
import { webLeagueSettingsUrl } from "@/lib/pickHelpers";
import { Button } from "@/components/ui/Button";
import { legOwnerName } from "@/components/LegLookthrough";
import { DEFAULT_LIEUTENANT_PERMISSIONS, type LieutenantPermissions } from "@shared/schema";
import { PERMISSION_LABELS } from "@shared/leaguePermissionLabels";
import { HERO_LABEL_TEXT, LOSER_LABEL_TEXT, SHAME_EMOJI_CHOICES, DEFAULT_SHAME_EMOJI } from "@shared/leagueLabels";

const MAX_LIEUTENANTS = 2;

function Section({ label, note }: { label: string; note?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

/** A number with − and + either side, for the few counts a league sets. */
function Stepper({ label, value, min, max, onChange, testID }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; testID: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(value - 1)}
          disabled={value <= min}
          style={({ pressed }) => [styles.stepBtn, value <= min && styles.stepBtnOff, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Lower ${label}`}
          testID={`${testID}-minus`}
        >
          <Ionicons name="remove" size={18} color="#f1f5f9" />
        </Pressable>
        <Text style={styles.stepValue} testID={`${testID}-value`}>{value}</Text>
        <Pressable
          onPress={() => onChange(value + 1)}
          disabled={value >= max}
          style={({ pressed }) => [styles.stepBtn, value >= max && styles.stepBtnOff, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Raise ${label}`}
          testID={`${testID}-plus`}
        >
          <Ionicons name="add" size={18} color="#f1f5f9" />
        </Pressable>
      </View>
    </View>
  );
}

function ChipPicker<T extends string>({ options, selected, onSelect }: { options: { key: T; label: string }[]; selected: T; onSelect: (key: T) => void }) {
  const accent = useAccentColor();
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={({ pressed }) => [styles.chip, active && { borderColor: accent, backgroundColor: `${accent}22` }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * League settings, pared down for a phone: the name, the parlay rules, what
 * the league calls its loser and hero, who the lieutenants are and what they
 * can do. Parlay Maestro only (the server checks). The rarely-touched rest
 * (history import, scheduled reminders, the league's start date, leaving or
 * handing over the league) stays on the web, one tap away at the bottom.
 */
export default function LeagueSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = parseInt(id, 10);
  const insets = useSafeAreaInsets();
  const accent = useAccentColor();
  const queryClient = useQueryClient();
  const { data: leagues, isLoading } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);
  const terms = leagueTerms(league);
  const { data: members } = useLeagueMembersWithUsers(leagueId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minLegs, setMinLegs] = useState(3);
  const [maxLegs, setMaxLegs] = useState(5);
  const [maxParlays, setMaxParlays] = useState(1);
  const [loserLabel, setLoserLabel] = useState<keyof typeof LOSER_LABEL_TEXT>("parlay_loser");
  const [heroLabel, setHeroLabel] = useState<keyof typeof HERO_LABEL_TEXT>("parlay_hero");
  const [shameEmoji, setShameEmoji] = useState<string | null>(null);
  // Filled from the league once, so a background refetch doesn't wipe edits.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!league || loaded) return;
    setName(league.name);
    setDescription(league.description ?? "");
    setMinLegs(league.minLegsPerParlay ?? 3);
    setMaxLegs(league.maxLegsPerParlay ?? 5);
    setMaxParlays(league.maxParlaysPerWeek ?? 1);
    setLoserLabel((league.loserLabel as keyof typeof LOSER_LABEL_TEXT) in LOSER_LABEL_TEXT ? (league.loserLabel as keyof typeof LOSER_LABEL_TEXT) : "parlay_loser");
    setHeroLabel((league.heroLabel as keyof typeof HERO_LABEL_TEXT) in HERO_LABEL_TEXT ? (league.heroLabel as keyof typeof HERO_LABEL_TEXT) : "parlay_hero");
    setShameEmoji(league.shameEmoji ?? null);
    setLoaded(true);
  }, [league, loaded]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
  };
  const failed = (title: string) => (err: Error) => Alert.alert(title, err.message || "Please try again.");

  const saveSettings = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/leagues/${leagueId}/settings`, {
        name: name.trim(),
        description: description.trim() || null,
        minLegsPerParlay: minLegs,
        maxLegsPerParlay: maxLegs,
        maxParlaysPerWeek: maxParlays,
        loserLabel,
        heroLabel,
        shameEmoji,
      }),
    onSuccess: () => {
      refresh();
      Alert.alert("Saved", "The league's settings are updated.");
    },
    onError: failed("Couldn't save the settings"),
  });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "member" | "lieutenant" }) =>
      apiRequest("PATCH", `/api/leagues/${leagueId}/members/${userId}/role`, { role }),
    onSuccess: refresh,
    onError: failed("Couldn't change the role"),
  });

  // When a member was in the league. A member is only Void for parlays
  // played inside their dates, so the Maestro can correct them here.
  const setStartDate = useMutation({
    mutationFn: ({ userId, startDate }: { userId: string; startDate: string }) =>
      apiRequest("PATCH", `/api/leagues/${leagueId}/members/${userId}/dates`, { startDate }),
    onSuccess: refresh,
    onError: failed("Couldn't save the date"),
  });
  const backdate = useMutation({
    mutationFn: (): Promise<{ changed: unknown[] }> => apiRequest("POST", `/api/leagues/${leagueId}/members/backdate-to-first-pick`),
    onSuccess: ({ changed }) => {
      refresh();
      Alert.alert(
        changed.length === 0 ? "Nothing to change" : `${changed.length} backdated`,
        changed.length === 0 ? "Nobody has a pick from before their start date." : "Their start date is now the day of their first pick.",
      );
    },
    onError: failed("Couldn't backdate members"),
  });
  const askStartDate = (userId: string, name: string, current: string) =>
    Alert.prompt(
      `${name} joined on`,
      "They're only Void for parlays played from this day on. Use YYYY-MM-DD.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: (value?: string) => value && setStartDate.mutate({ userId, startDate: value.trim() }) },
      ],
      "plain-text",
      current,
      "numbers-and-punctuation",
    );

  const permissions: LieutenantPermissions = { ...DEFAULT_LIEUTENANT_PERMISSIONS, ...((league?.lieutenantPermissions as LieutenantPermissions | null) ?? {}) };
  const setPermissions = useMutation({
    mutationFn: (next: LieutenantPermissions) => apiRequest("PATCH", `/api/leagues/${leagueId}/lieutenant-permissions`, next),
    onSuccess: refresh,
    onError: failed("Couldn't change the permission"),
  });

  if (isLoading || !league) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "League Settings" }} />
        {isLoading ? <ActivityIndicator color="#2563eb" size="large" /> : <Text style={styles.sectionNote}>League not found.</Text>}
      </View>
    );
  }

  if (!league.isAdmin) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "League Settings" }} />
        <Ionicons name="lock-closed-outline" size={28} color="#64748b" />
        <Text style={styles.lockedTitle}>{terms.admin} only</Text>
        <Text style={styles.sectionNote}>Only the {terms.kindLower}'s {terms.admin} can change its settings.</Text>
      </View>
    );
  }

  const dirty =
    name.trim() !== league.name ||
    (description.trim() || null) !== (league.description ?? null) ||
    minLegs !== (league.minLegsPerParlay ?? 3) ||
    maxLegs !== (league.maxLegsPerParlay ?? 5) ||
    maxParlays !== (league.maxParlaysPerWeek ?? 1) ||
    loserLabel !== (league.loserLabel ?? "parlay_loser") ||
    heroLabel !== (league.heroLabel ?? "parlay_hero") ||
    shameEmoji !== (league.shameEmoji ?? null);

  const activeMembers = (members ?? []).filter((m: any) => m.isActive !== false);
  const lieutenantCount = activeMembers.filter((m) => m.role === "lieutenant").length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "League Settings", headerBackTitle: "League" }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]} keyboardShouldPersistTaps="handled">
        <Section label="League" />
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={120}
            placeholder="League name"
            placeholderTextColor="#475569"
            testID="input-league-name"
          />
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Optional"
            placeholderTextColor="#475569"
            testID="input-league-description"
          />
        </View>

        <Section label="Parlay rules" note="Changes apply from the next parlay the league starts." />
        <View style={styles.card}>
          <Stepper label="Fewest legs to submit" value={minLegs} min={1} max={maxLegs} onChange={setMinLegs} testID="stepper-min-legs" />
          <View style={styles.divider} />
          <Stepper label="Most legs in a parlay" value={maxLegs} min={minLegs} max={25} onChange={setMaxLegs} testID="stepper-max-legs" />
          <View style={styles.divider} />
          <Stepper label="Parlays per week" value={maxParlays} min={1} max={10} onChange={setMaxParlays} testID="stepper-max-parlays" />
        </View>

        <Section label="What the league calls them" />
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Whoever busts the parlay</Text>
          <ChipPicker
            options={(Object.keys(LOSER_LABEL_TEXT) as (keyof typeof LOSER_LABEL_TEXT)[]).map((key) => ({ key, label: LOSER_LABEL_TEXT[key] }))}
            selected={loserLabel}
            onSelect={setLoserLabel}
          />
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Whoever brings it home</Text>
          <ChipPicker
            options={(Object.keys(HERO_LABEL_TEXT) as (keyof typeof HERO_LABEL_TEXT)[]).map((key) => ({ key, label: HERO_LABEL_TEXT[key] }))}
            selected={heroLabel}
            onSelect={setHeroLabel}
          />
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Shame report emoji</Text>
          <ChipPicker
            options={SHAME_EMOJI_CHOICES.map((emoji) => ({ key: emoji as string, label: emoji }))}
            selected={shameEmoji ?? DEFAULT_SHAME_EMOJI}
            onSelect={(emoji) => setShameEmoji(emoji === DEFAULT_SHAME_EMOJI ? null : emoji)}
          />
        </View>

        <Section
          label={terms.lieutenants}
          note={`Up to ${MAX_LIEUTENANTS} members who help run the ${terms.kindLower}. These switches save as you flip them.`}
        />
        <View style={styles.card}>
          {activeMembers.length === 0 ? (
            <ActivityIndicator color="#2563eb" style={{ marginVertical: 12 }} />
          ) : (
            activeMembers.map((m, i) => {
              const isMaestro = m.role === "admin";
              const isLt = m.role === "lieutenant";
              return (
                <View key={m.userId}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{legOwnerName(m.user, "Member")}</Text>
                      <Text style={styles.rowSub}>{isMaestro ? terms.admin : isLt ? terms.lieutenant : "Member"}</Text>
                    </View>
                    {!isMaestro && (
                      <Switch
                        value={isLt}
                        onValueChange={(on) => setRole.mutate({ userId: m.userId, role: on ? "lieutenant" : "member" })}
                        disabled={setRole.isPending || (!isLt && lieutenantCount >= MAX_LIEUTENANTS)}
                        trackColor={{ false: "#1e2a3b", true: accent }}
                        thumbColor="#ffffff"
                        accessibilityLabel={`${legOwnerName(m.user, "Member")} is a ${terms.lieutenant}`}
                        testID={`switch-lieutenant-${m.userId}`}
                      />
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Section
          label="Member dates"
          note="A member is only Void for parlays played while they were in the league. Tap a date to correct it."
        />
        <View style={styles.card}>
          {activeMembers.map((m, i) => {
            const day = m.startDate ? new Date(m.startDate).toISOString().slice(0, 10) : "";
            const name = legOwnerName(m.user, "Member");
            return (
              <View key={m.userId}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  style={styles.row}
                  onPress={() => askStartDate(m.userId, name, day)}
                  accessibilityRole="button"
                  accessibilityLabel={`Change the date ${name} joined, currently ${day}`}
                  testID={`button-member-start-${m.userId}`}
                >
                  <Text style={styles.rowLabel} numberOfLines={1}>{name}</Text>
                  <Text style={styles.rowSub}>Joined {day}</Text>
                  <Ionicons name="create-outline" size={16} color="#64748b" />
                </Pressable>
              </View>
            );
          })}
          <View style={styles.divider} />
          <Pressable
            style={styles.row}
            onPress={() => backdate.mutate()}
            disabled={backdate.isPending}
            accessibilityRole="button"
            testID="button-backdate-members"
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowLabel, { color: accent }]}>Backdate everyone to their first pick</Text>
              <Text style={styles.rowSub}>For history entered after the fact. Never moves a date later.</Text>
            </View>
          </Pressable>
        </View>

        <Section label={`What ${terms.lieutenants.toLowerCase()} can do`} />
        <View style={styles.card}>
          {PERMISSION_LABELS.map((perm, i) => (
            <View key={perm.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowLabel}>{perm.label}</Text>
                  <Text style={styles.rowSub}>{subcommitteeWording(perm.description, league)}</Text>
                </View>
                <Switch
                  value={!!permissions[perm.key]}
                  onValueChange={(on) => setPermissions.mutate({ ...permissions, [perm.key]: on })}
                  disabled={setPermissions.isPending}
                  trackColor={{ false: "#1e2a3b", true: accent }}
                  thumbColor="#ffffff"
                  accessibilityLabel={perm.label}
                  testID={`switch-permission-${perm.key}`}
                />
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(webLeagueSettingsUrl(leagueId, API_BASE_URL))}
          style={({ pressed }) => [styles.webLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
          testID="link-league-settings-web"
        >
          <Ionicons name="globe-outline" size={14} color="#64748b" />
          <Text style={styles.webLinkText}>History import, scheduled reminders and more on the web</Text>
        </Pressable>
      </ScrollView>

      {/* The top half of the page saves together; the switches save themselves. */}
      <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button
          fullWidth
          onPress={() => saveSettings.mutate()}
          disabled={!dirty || !name.trim()}
          loading={saveSettings.isPending}
          testID="button-save-league-settings"
        >
          {dirty ? "Save changes" : "No changes to save"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  content: { padding: 16 },
  centered: { flex: 1, backgroundColor: "#141926", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  lockedTitle: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  section: { marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase" },
  sectionNote: { fontSize: 12, lineHeight: 17, color: "#64748b", marginTop: 3, textAlign: "left" },
  card: { backgroundColor: "#1c2538", borderRadius: 14, borderWidth: 1, borderColor: "#2a3447", padding: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginBottom: 6 },
  input: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#f1f5f9" },
  rowSub: { fontSize: 12, lineHeight: 16, color: "#64748b", marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#2a3447", marginVertical: 10 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#141926", borderWidth: 1, borderColor: "#2a3447", alignItems: "center", justifyContent: "center" },
  stepBtnOff: { opacity: 0.35 },
  stepValue: { minWidth: 28, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#f1f5f9", fontVariant: ["tabular-nums"] },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, borderWidth: 1.5, borderColor: "#2a3447", backgroundColor: "#141926" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  chipTextActive: { color: "#f1f5f9" },
  webLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22, minHeight: 44 },
  webLinkText: { fontSize: 13, color: "#64748b", flexShrink: 1 },
  saveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#1c2538", borderTopWidth: 1, borderColor: "#2a3447" },
});
