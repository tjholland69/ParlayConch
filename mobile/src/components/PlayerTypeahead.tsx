import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Keyboard, StyleSheet } from "react-native";
import type { Player } from "@shared/schema";
import { useGamePlayerSearch } from "@/hooks/use-players";
import { useAccentColor } from "@/hooks/use-accent-color";

/** Type-ahead player search for entering a Player Prop — same
 * search-as-you-type pattern as the "Act for user" search in
 * mobile/src/app/(tabs)/settings.tsx (TextInput + a results list below it,
 * not a dropdown overlay). Only players on the two teams in `gameId` are
 * offered. Selecting one fills the input with their display name and hands
 * back the player (so the caller can filter prop types by position); typing
 * hands back null, since free text has no known position. The value is free
 * text matching parlay_legs.playerName, not a foreign key — a name the
 * players table doesn't have yet can still be used as typed. */
export function PlayerTypeahead({
  gameId,
  value,
  onChange,
}: {
  gameId: number;
  value: string;
  onChange: (name: string, player: Player | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const accent = useAccentColor();
  const { data: results = [], isLoading } = useGamePlayerSearch(gameId, value, focused);

  return (
    <View>
      <TextInput
        style={[styles.input, { borderColor: focused ? accent : "#2a3447" }]}
        value={value}
        onChangeText={(text) => onChange(text, null)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search players in this game"
        placeholderTextColor="#64748b"
        autoCapitalize="words"
        autoCorrect={false}
        testID="input-prop-player"
      />
      {focused && (
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {isLoading ? (
            <ActivityIndicator size="small" color={accent} style={styles.loading} />
          ) : results.length === 0 ? (
            <Text style={styles.empty}>
              {value.trim() ? `No one on either team matches "${value.trim()}" — it'll be used as typed.` : "No players found for this game."}
            </Text>
          ) : (
            results.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  onChange(p.displayName || p.name, p);
                  setFocused(false);
                  Keyboard.dismiss();
                }}
                style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.resultName} numberOfLines={1}>{p.displayName || p.name}</Text>
                {(p.team || p.position) && (
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {[p.position, p.team].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#f1f5f9",
    backgroundColor: "#141926",
  },
  results: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "#1c2538",
    borderWidth: 1,
    borderColor: "#2a3447",
    maxHeight: 220,
  },
  loading: { paddingVertical: 12 },
  empty: { fontSize: 13, color: "#64748b", padding: 12, fontStyle: "italic" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#2a3447",
  },
  resultName: { fontSize: 14, fontWeight: "600", color: "#f1f5f9", flexShrink: 1 },
  resultMeta: { fontSize: 11, color: "#64748b", flexShrink: 0 },
});
