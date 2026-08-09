import "../../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/hooks/use-auth";
import { SentParlayResumeGuard } from "@/components/SentParlayResumeGuard";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "login";
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)/leagues");
    }
  }, [isAuthenticated, isLoading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <SentParlayResumeGuard />
          <AuthGuard>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: "#1c2538" },
                headerTintColor: "#f1f5f9",
                headerTitleStyle: { fontWeight: "700", fontSize: 17 },
                headerTitleAlign: "center",
                contentStyle: { backgroundColor: "#141926" },
                headerShadowVisible: false,
              }}
            >
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="leagues/[id]/index"
                options={{ headerBackTitle: "Leagues" }}
              />
              <Stack.Screen
                name="leagues/[id]/build"
                options={{ headerBackTitle: "Back", title: "Build Pick" }}
              />
            </Stack>
          </AuthGuard>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
