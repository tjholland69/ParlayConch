import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { usePlayerSearch } from "@/hooks/use-players";
import { useAccentColor } from "@/hooks/use-accent-color";

/** Type-ahead player-name search for entering a Player Prop — same
 * search-as-you-type pattern as the "Act for user" search in
 * mobile/src/app/(tabs)/settings.tsx (TextInput + a results list below it,
 * not a dropdown overlay). Selecting a result fills the input with that
 * player's display name and closes the results list; the value is free text
 * matching parlay_legs.playerName, not a foreign key — same as web's
 * PlayerCombobox. */
export function PlayerTypeahead({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [focused, setFocused] = useState(false);
  const accent = useAccentColor();
  const { data: results = [], isFetching } = usePlayerSearch(value);
  const showResults = focused && value.trim().length > 0;

  return (
    <View>
      <TextInput
        style={[styles.input, { borderColor: focused ? accent : "#2a3447" }]}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Player name"
        placeholderTextColor="#64748b"
        autoCapitalize="words"
        autoCorrect={false}
      />
      {showResults && (
        <View style={styles.results}>
          {isFetching ? (
            <ActivityIndicator size="small" color={accent} style={styles.loading} />
          ) : results.length === 0 ? (
            <Text style={styles.empty}>No players found for "{value.trim()}"</Text>
          ) : (
            results.slice(0, 8).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  onChange(p.displayName || p.name);
                  setFocused(false);
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
        </View>
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
    overflow: "hidden",
  },
  loading: { paddingVertical: 12 },
  empty: { fontSize: 13, color: "#64748b", padding: 12, fontStyle: "italic" },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderColor: "#2a3447",
  },
  resultName: { fontSize: 14, fontWeight: "600", color: "#f1f5f9" },
  resultMeta: { fontSize: 11, color: "#64748b", marginTop: 1 },
});
