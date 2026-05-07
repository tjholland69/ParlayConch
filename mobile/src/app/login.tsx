import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { setSessionToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleLogin() {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("/auth/callback");
      const authUrl = `${API_BASE_URL}/api/login?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get("session");
        if (token) {
          await setSessionToken(token);
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <View className="items-center mb-12">
        <View className="w-20 h-20 rounded-2xl bg-primary items-center justify-center mb-6">
          <Text className="text-4xl font-bold text-background">P</Text>
        </View>
        <Text className="text-3xl font-bold text-foreground mb-2">Parlay.Conch</Text>
        <Text className="text-muted-foreground text-center text-base">
          Track your NFL parlay picks with your league
        </Text>
      </View>

      <View className="w-full gap-4">
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
          testID="button-login"
        >
          {loading ? (
            <ActivityIndicator color="#09090b" />
          ) : (
            <Text className="text-background font-bold text-base">Sign in with Replit</Text>
          )}
        </Pressable>
      </View>

      <Text className="text-muted-foreground text-sm text-center mt-8">
        You'll be redirected to Replit to authenticate.{"\n"}
        Your account is tied to your Replit identity.
      </Text>
    </View>
  );
}
