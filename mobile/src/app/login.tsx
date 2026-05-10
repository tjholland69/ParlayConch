import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { setSessionToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api";
import { StatusBar } from "expo-status-bar";

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
    } catch (e: any) {
      Alert.alert("Sign In Failed", e?.message ?? "Could not complete sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background accent circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      {/* Logo mark */}
      <View style={styles.logoSection}>
        <View style={styles.logoMark}>
          <View style={styles.logoInner}>
            <Ionicons name="trophy" size={36} color="#2563eb" />
          </View>
        </View>

        <Text style={styles.appName}>PARLAY.CONCH</Text>
        <Text style={styles.tagline}>
          Weekly NFL parlays.{"\n"}Track picks with your crew.
        </Text>
      </View>

      {/* Feature pills */}
      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Ionicons name="people-outline" size={14} color="#94a3b8" />
          <Text style={styles.pillText}>Leagues</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="checkmark-circle-outline" size={14} color="#94a3b8" />
          <Text style={styles.pillText}>Weekly Picks</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="bar-chart-outline" size={14} color="#94a3b8" />
          <Text style={styles.pillText}>Leaderboard</Text>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.ctaSection}>
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          testID="button-login"
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.disclaimer}>
          Secure sign-in via your Replit account
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141926",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  circleTopRight: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#2563eb",
    opacity: 0.07,
  },
  circleBottomLeft: {
    position: "absolute",
    bottom: -80,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#0ea5e9",
    opacity: 0.06,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 48,
  },
  logoMark: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#1e2a3b",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: 3,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 56,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
  },
  ctaSection: {
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontSize: 12,
    color: "#475569",
    textAlign: "center",
  },
});
