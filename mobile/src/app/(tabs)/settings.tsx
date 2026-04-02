import { View, Text, ScrollView, Pressable, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}

function SettingsRow({ icon, label, value, onPress, right, danger = false }: SettingsRowProps) {
  const content = (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      <View className={`w-8 h-8 rounded-lg items-center justify-center ${danger ? "bg-red-500/15" : "bg-muted"}`}>
        <Ionicons name={icon} size={18} color={danger ? "#ef4444" : "#a1a1aa"} />
      </View>
      <View className="flex-1">
        <Text className={`font-medium text-sm ${danger ? "text-destructive" : "text-foreground"}`}>
          {label}
        </Text>
        {value && <Text className="text-muted-foreground text-xs mt-0.5">{value}</Text>}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={16} color="#52525b" />)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-70" testID={`button-settings-${label.toLowerCase().replace(/ /g, "-")}`}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export default function SettingsScreen() {
  const { user, logout, isLoggingOut } = useAuth();
  const queryClient = useQueryClient();

  const toggleDemoMutation = useMutation({
    mutationFn: (isDemo: boolean) => apiRequest("PATCH", "/api/users/me/demo", { isDemo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
  });

  const userName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Unknown";

  function confirmLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => logout() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profile card */}
      <Card className="mx-4 mt-4 mb-6">
        <CardContent>
          <View className="flex-row items-center gap-4">
            <Avatar src={user?.profileImageUrl} name={userName} size={56} />
            <View className="flex-1">
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text className="text-foreground font-bold text-base">{userName}</Text>
                {user?.isDemo && <Badge variant="warning">DEMO</Badge>}
              </View>
              {user?.email && (
                <Text className="text-muted-foreground text-sm mt-0.5">{user.email}</Text>
              )}
              <Text className="text-muted-foreground text-xs mt-1">Replit Auth · ID: {user?.id?.slice(0, 8)}</Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Account section */}
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider px-4 mb-2">
        Account
      </Text>
      <Card className="mx-4 mb-6 overflow-hidden">
        <SettingsRow
          icon="person-outline"
          label="Display Name"
          value={userName}
        />
        <View className="h-px bg-border mx-4" />
        <SettingsRow
          icon="mail-outline"
          label="Email"
          value={user?.email ?? "Not set"}
        />
        <View className="h-px bg-border mx-4" />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Authentication"
          value="Replit OAuth"
        />
      </Card>

      {/* Demo section */}
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider px-4 mb-2">
        Testing
      </Text>
      <Card className="mx-4 mb-6">
        <SettingsRow
          icon="flask-outline"
          label="Demo / QA Account"
          value="Marks your account and activity as test data"
          right={
            <Switch
              value={!!user?.isDemo}
              onValueChange={(val) => toggleDemoMutation.mutate(val)}
              trackColor={{ false: "#3f3f46", true: "#22c55e" }}
              thumbColor="#fafafa"
              disabled={toggleDemoMutation.isPending}
              testID="switch-demo-mode"
            />
          }
        />
      </Card>

      {/* App info section */}
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider px-4 mb-2">
        App
      </Text>
      <Card className="mx-4 mb-6">
        <SettingsRow icon="information-circle-outline" label="Version" value="1.0.0 (iOS)" />
        <View className="h-px bg-border mx-4" />
        <SettingsRow icon="globe-outline" label="Platform" value="React Native / Expo" />
        <View className="h-px bg-border mx-4" />
        <SettingsRow icon="server-outline" label="Full Features" value="Available in the web app" />
      </Card>

      {/* Danger zone */}
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider px-4 mb-2">
        Session
      </Text>
      <Card className="mx-4 mb-6">
        <SettingsRow
          icon="log-out-outline"
          label={isLoggingOut ? "Signing out…" : "Sign Out"}
          onPress={confirmLogout}
          danger
        />
      </Card>
    </ScrollView>
  );
}
