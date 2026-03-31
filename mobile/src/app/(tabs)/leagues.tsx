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
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLeagues, useCreateLeague, useJoinLeague } from "@/hooks/use-leagues";
import { useAuth } from "@/hooks/use-auth";
import { LeagueCard } from "@/components/LeagueCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardContent } from "@/components/ui/Card";

type ModalType = "create" | "join" | null;

export default function LeaguesScreen() {
  const { user } = useAuth();
  const { data: leagues, isLoading, refetch, isRefetching } = useLeagues();
  const createLeague = useCreateLeague();
  const joinLeague = useJoinLeague();

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
    await createLeague.mutateAsync({ name: leagueName.trim(), description: leagueDesc.trim() || undefined });
    closeModal();
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    await joinLeague.mutateAsync(inviteCode.trim().toUpperCase());
    closeModal();
  }

  const userName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "You";

  return (
    <View className="flex-1 bg-background">
      {/* Header profile strip */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <View className="flex-row items-center gap-3">
          <Avatar src={user?.profileImageUrl} name={userName} size={36} />
          <View>
            <Text className="text-foreground font-semibold text-sm">{userName}</Text>
            {user?.isDemo && (
              <Text className="text-yellow-400 text-xs font-bold">DEMO</Text>
            )}
          </View>
        </View>
        <View className="flex-row gap-2">
          <Button variant="outline" size="sm" onPress={() => setModal("join")}>
            Join
          </Button>
          <Button size="sm" onPress={() => setModal("create")}>
            + New
          </Button>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#22c55e"
          />
        }
      >
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#22c55e" size="large" />
          </View>
        ) : !leagues || leagues.length === 0 ? (
          <View className="items-center py-16 gap-4">
            <Ionicons name="trophy-outline" size={48} color="#3f3f46" />
            <Text className="text-foreground font-bold text-lg">No leagues yet</Text>
            <Text className="text-muted-foreground text-center text-sm">
              Create your own league or join one with an invite code.
            </Text>
            <View className="flex-row gap-3 mt-2">
              <Button variant="outline" onPress={() => setModal("join")}>Join League</Button>
              <Button onPress={() => setModal("create")}>Create League</Button>
            </View>
          </View>
        ) : (
          <>
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
              Your Leagues ({leagues.length})
            </Text>
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </>
        )}
      </ScrollView>

      {/* Create League Modal */}
      <Modal visible={modal === "create"} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          <Pressable className="flex-1" onPress={closeModal} />
          <View className="bg-card rounded-t-3xl border-t border-border px-6 pt-6 pb-10">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-foreground font-bold text-xl">Create League</Text>
              <Pressable onPress={closeModal} testID="button-close-create">
                <Ionicons name="close" size={24} color="#71717a" />
              </Pressable>
            </View>

            <Text className="text-muted-foreground text-sm mb-1">League Name *</Text>
            <TextInput
              value={leagueName}
              onChangeText={setLeagueName}
              placeholder="e.g. Sunday Crunchers"
              placeholderTextColor="#52525b"
              className="bg-background text-foreground border border-border rounded-xl px-4 py-3 mb-4 text-base"
              autoFocus
              testID="input-league-name"
            />

            <Text className="text-muted-foreground text-sm mb-1">Description</Text>
            <TextInput
              value={leagueDesc}
              onChangeText={setLeagueDesc}
              placeholder="Optional description..."
              placeholderTextColor="#52525b"
              className="bg-background text-foreground border border-border rounded-xl px-4 py-3 mb-6 text-base"
              multiline
              numberOfLines={3}
              testID="input-league-description"
            />

            <Button
              onPress={handleCreate}
              loading={createLeague.isPending}
              disabled={!leagueName.trim()}
              testID="button-create-league"
            >
              Create League
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join League Modal */}
      <Modal visible={modal === "join"} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          <Pressable className="flex-1" onPress={closeModal} />
          <View className="bg-card rounded-t-3xl border-t border-border px-6 pt-6 pb-10">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-foreground font-bold text-xl">Join League</Text>
              <Pressable onPress={closeModal} testID="button-close-join">
                <Ionicons name="close" size={24} color="#71717a" />
              </Pressable>
            </View>

            <Text className="text-muted-foreground text-sm mb-1">Invite Code *</Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="e.g. ABC123"
              placeholderTextColor="#52525b"
              className="bg-background text-foreground border border-border rounded-xl px-4 py-3 mb-6 text-base font-mono tracking-widest"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              testID="input-invite-code"
            />

            <Button
              onPress={handleJoin}
              loading={joinLeague.isPending}
              disabled={!inviteCode.trim()}
              testID="button-join-league"
            >
              Join League
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
