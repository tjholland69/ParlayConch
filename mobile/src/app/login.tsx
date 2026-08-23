import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Shell } from "lucide-react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest, setSessionToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";

type Mode = "login" | "register";

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isLogin = mode === "login";

  async function handleSubmit() {
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? "/api/auth/login-local" : "/api/auth/register";
      const body: Record<string, string> = { email: email.trim(), password };
      if (!isLogin && firstName.trim()) body.firstName = firstName.trim();

      const data = await apiRequest<{ message: string; sessionToken: string }>(
        "POST",
        endpoint,
        body
      );

      await setSessionToken(data.sessionToken);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />

      {/* Background accent circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo section */}
        <View style={styles.logoSection}>
          <View style={styles.logoMark}>
            <Shell size={40} color="#2563eb" />
          </View>
          <Text style={styles.appName}>PARLAYCONCH</Text>
          <Text style={styles.tagline}>
            {isLogin ? "Welcome back." : "Weekly NFL parlays with your crew."}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.field}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Pat"
                placeholderTextColor="#475569"
                autoCapitalize="words"
                autoCorrect={false}
                testID="input-first-name"
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="input-email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder={isLogin ? "Your password" : "At least 8 characters"}
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                testID="input-password"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#64748b"
                />
              </Pressable>
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            testID="button-submit"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? "Sign In" : "Create Account"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setError(null);
              setMode(isLogin ? "register" : "login");
            }}
            style={styles.switchModeButton}
          >
            <Text style={styles.switchModeText}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Text style={styles.switchModeLink}>{isLogin ? "Sign up" : "Sign in"}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141926",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
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
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: 3,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
  },

  /* Form */
  form: {
    width: "100%",
    maxWidth: 360,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  input: {
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f1f5f9",
  },
  passwordRow: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
  },
  error: {
    fontSize: 13,
    color: "#f87171",
    backgroundColor: "#f8717120",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  primaryButton: {
    width: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#93c5fd",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    marginTop: 4,
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

  switchModeButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  switchModeText: {
    fontSize: 13,
    color: "#64748b",
  },
  switchModeLink: {
    color: "#60a5fa",
    fontWeight: "600",
  },
});