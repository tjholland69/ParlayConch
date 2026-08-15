import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLeagues, useCreateLeague, useJoinLeague } from "@/hooks/use-leagues";
import { LeagueCard } from "@/components/LeagueCard";

type ModalType = "create" | "join" | null;

export default function LeaguesScreen() {
  const { data: leagues, isLoading, refetch, isRefetching } = useLeagues();
  const createLeague = useCreateLeague();
  const joinLeague = useJoinLeague();
  const insets = useSafeAreaInsets();

  const [modal, setModal] = useState<ModalType>(null);
  const [leagueName, setLeagueName] = useState("");
  const [leagueDesc, setLeagueDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  function closeModal() {
    setModal(null);
    setLeagueName("");
    setLeagueDesc("");
    setInviteCode("");
  }

  async function handleCreate() {
    if (!leagueName.trim()) return;
    try {
      await createLeague.mutateAsync({
        name: leagueName.trim(),
        description: leagueDesc.trim() || undefined,
      });
      closeModal();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create league.");
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    try {
      await joinLeague.mutateAsync(inviteCode.trim().toUpperCase());
      closeModal();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Invalid invite code. Please try again.");
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#2563eb"
          />
        }
      >
        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [pressed && styles.pressed]}
            onPress={() => setModal("join")}
          >
            <View style={[styles.actionBtn, styles.actionBtnOutline]}>
              <Ionicons name="enter-outline" size={16} color="#93c5fd" />
              <Text style={styles.actionBtnOutlineText}>Join League</Text>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [pressed && styles.pressed]}
            onPress={() => setModal("create")}
          >
            <View style={[styles.actionBtn, styles.actionBtnPrimary]}>
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={styles.actionBtnPrimaryText}>New League</Text>
            </View>
          </Pressable>
        </View>

        {/* Leagues list */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#2563eb" size="large" />
          </View>
        ) : !leagues || leagues.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="trophy-outline" size={32} color="#2563eb" />
            </View>
            <Text style={styles.emptyTitle}>No leagues yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a league or join one with an invite code to get started.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionLabel}>
              YOUR LEAGUES · {leagues.length}
            </Text>
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create League Sheet */}
      <Modal
        visible={modal === "create"}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Create League</Text>
              <Pressable onPress={closeModal} hitSlop={12} testID="button-close-create">
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>League Name</Text>
            <TextInput
              value={leagueName}
              onChangeText={setLeagueName}
              placeholder="e.g. Sunday Crunchers"
              placeholderTextColor="#64748b"
              style={styles.input}
              autoFocus
              testID="input-league-name"
            />

            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              value={leagueDesc}
              onChangeText={setLeagueDesc}
              placeholder="What's this league about?"
              placeholderTextColor="#64748b"
              style={[styles.input, styles.inputMultiline]}
              multiline
              numberOfLines={3}
              testID="input-league-description"
            />

            <Pressable
              onPress={handleCreate}
              disabled={!leagueName.trim() || createLeague.isPending}
              style={({ pressed }) => [
                styles.sheetBtn,
                (!leagueName.trim() || createLeague.isPending) && styles.sheetBtnDisabled,
                pressed && styles.pressed,
              ]}
              testID="button-create-league"
            >
              {createLeague.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sheetBtnText}>Create League</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join League Sheet */}
      <Modal
        visible={modal === "join"}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Join League</Text>
              <Pressable onPress={closeModal} hitSlop={12} testID="button-close-join">
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Invite Code</Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="ABC123"
              placeholderTextColor="#64748b"
              style={[styles.input, styles.inputMono]}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              testID="input-invite-code"
            />

            <Pressable
              onPress={handleJoin}
              disabled={!inviteCode.trim() || joinLeague.isPending}
              style={({ pressed }) => [
                styles.sheetBtn,
                (!inviteCode.trim() || joinLeague.isPending) && styles.sheetBtnDisabled,
                pressed && styles.pressed,
              ]}
              testID="button-join-league"
            >
              {joinLeague.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sheetBtnText}>Join League</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141926" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 16 },
  actionRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 28 },
  actionBtn: {
    width: 160,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnOutline: {
    backgroundColor: "#1c2b4a",
    borderWidth: 1.5,
    borderColor: "#2563eb",
  },
  actionBtnPrimary: { backgroundColor: "#2563eb" },
  actionBtnOutlineText: { fontSize: 14, fontWeight: "600", color: "#93c5fd" },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
  pressed: { opacity: 0.75 },
  centered: { alignItems: "center", paddingVertical: 64 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    marginBottom: 12,
  },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#2a3447",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 16,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top", paddingTop: 13 },
  inputMono: { letterSpacing: 4, fontSize: 18, fontWeight: "700" },
  sheetBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  sheetBtnDisabled: { opacity: 0.45 },
  sheetBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
