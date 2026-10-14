import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { legOwnerName } from "@/components/LegLookthrough";

type Candidate = {
  userId: string;
  user?: { firstName?: string | null; email?: string | null; settings?: { displayName?: string | null } | null } | null;
};

/**
 * One sheet for both subcommittee jobs: forming one in a league ("create":
 * a name, a description and who's in it) and adding to one already there
 * ("add": just the list). The list is the league's roster, since nobody
 * else can be in a subcommittee.
 */
export function SubcommitteeSheet({
  visible,
  mode,
  parentName,
  subcommitteeName,
  candidates,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: "create" | "add";
  /** The league the subcommittee belongs to. */
  parentName: string;
  /** "add" only: the subcommittee being added to. */
  subcommitteeName?: string;
  candidates: Candidate[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; memberUserIds: string[] }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (visible) {
      setName("");
      setDescription("");
      setPicked(new Set());
    }
  }, [visible]);

  const toggle = (userId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  const creating = mode === "create";
  const canSubmit = creating ? !!name.trim() : picked.size > 0;
  const submitLabel = creating ? "Create subcommittee" : picked.size > 1 ? `Add ${picked.size} members` : "Add member";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.wrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {creating ? `New subcommittee in ${parentName}` : `Add members to ${subcommitteeName ?? "subcommittee"}`}
            </Text>
            <IconButton onPress={onClose} accessibilityLabel="Close" testID="button-close-subcommittee">
              <Ionicons name="close" size={22} color="#475569" />
            </IconButton>
          </View>
          <Text style={styles.note}>
            {creating
              ? `A league of its own for some of ${parentName}'s members. Only the people in it can see it, and its picks don't count toward ${parentName}'s stats. You'll run it as its Frondeur.`
              : `A subcommittee only takes members of ${parentName}.`}
          </Text>

          {creating && (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Subcommittee name"
                placeholderTextColor="#64748b"
                style={styles.input}
                testID="input-subcommittee-name"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description (optional)"
                placeholderTextColor="#64748b"
                style={styles.input}
                testID="input-subcommittee-description"
              />
              <Text style={styles.label}>MEMBERS · {picked.size} picked, plus you</Text>
            </>
          )}

          {candidates.length === 0 ? (
            <Text style={styles.empty}>Everyone in {parentName} is already in.</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {candidates.map((m) => {
                const on = picked.has(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => toggle(m.userId)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    testID={`checkbox-subcommittee-member-${m.userId}`}
                  >
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? "#2563eb" : "#475569"} />
                    <Text style={styles.rowText} numberOfLines={1}>{legOwnerName(m.user, "Member")}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Button
            onPress={() => onSubmit({ name: name.trim(), description: description.trim() || undefined, memberUserIds: Array.from(picked) })}
            disabled={!canSubmit || busy}
            loading={busy}
            fullWidth
            size="lg"
            style={styles.submit}
            testID="button-submit-subcommittee"
          >
            {submitLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1c2538",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#2a3447",
    maxHeight: "88%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#374151", alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  note: { fontSize: 13, lineHeight: 18, color: "#94a3b8", marginBottom: 16 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#475569", marginBottom: 6 },
  input: {
    backgroundColor: "#141926",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#2a3447",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 12,
  },
  list: { flexGrow: 0, maxHeight: 260, borderWidth: 1, borderColor: "#2a3447", borderRadius: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a3447",
  },
  rowText: { flex: 1, fontSize: 15, color: "#f1f5f9" },
  empty: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", paddingVertical: 12 },
  pressed: { opacity: 0.65 },
  submit: { marginTop: 16 },
});
