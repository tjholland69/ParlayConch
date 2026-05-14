import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Shell } from "lucide-react-native";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { setSessionToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api";
import { StatusBar } from "expo-status-bar";

WebBrowser.maybeCompleteAuthSession();

const FEATURES = [
  {
    icon: "people" as const,
    title: "Leagues",
    desc: "Create or join leagues with your crew",
  },
  {
    icon: "checkmark-circle" as const,
    title: "Weekly Picks",
    desc: "Lock in your parlay picks every week",
  },
  {
    icon: "bar-chart" as const,
    title: "Leaderboard",
    desc: "See who really knows the game",
  },
];

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();

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

  const isLandscape = width > 600;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background accent circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      {/* Logo section */}
      <View style={[styles.logoSection, isLandscape && styles.logoSectionLandscape]}>
        <View style={styles.logoMark}>
          <Shell size={48} color="#2563eb" />
        </View>
        <Text style={styles.appName}>PARLAYCONCH</Text>
        <Text style={styles.tagline}>
          Weekly NFL parlays.{"\n"}Track picks with your crew.
        </Text>
      </View>

      {/* Feature tiles — stacked vertically */}
      <View style={[styles.featureList, isLandscape && styles.featureListLandscape]}>
        {FEATURES.map((feature) => (
          <View key={feature.title} style={styles.featureTile}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={feature.icon} size={18} color="#2563eb" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDesc}>{feature.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaSection}>
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          testID="button-login"
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>Sign In with Replit</Text>
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

  /* Logo */
  logoSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoSectionLandscape: {
    marginBottom: 16,
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
    marginBottom: 20,
    overflow: "hidden",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  appName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: 3,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },

  /* Feature list — stacked vertically */
  featureList: {
    width: "100%",
    flexDirection: "column",
    gap: 10,
    marginBottom: 40,
  },
  featureListLandscape: {
    marginBottom: 20,
  },
  featureTile: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 14,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1e2e4a",
    borderWidth: 1,
    borderColor: "#2563eb33",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f1f5f9",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },

  /* CTA */
  ctaSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
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
