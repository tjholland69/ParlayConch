import { Pressable, Text, ActivityIndicator, PressableProps, StyleSheet } from "react-native";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends PressableProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
}

export function Button({
  children,
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    isDisabled && styles.disabled,
  ];

  const textStyle = [
    styles.text,
    styles[`text_${variant}`],
    styles[`textSize_${size}`],
  ];

  const spinnerColor = variant === "default" || variant === "destructive" ? "#ffffff" : "#94a3b8";

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [containerStyle, pressed && !isDisabled && styles.pressed, style]}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={spinnerColor} />}
      <Text style={textStyle}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },

  variant_default: { backgroundColor: "#2563eb" },
  variant_outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2a3447",
  },
  variant_ghost: { backgroundColor: "transparent" },
  variant_destructive: { backgroundColor: "#ef4444" },

  size_sm: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10 },
  size_md: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  size_lg: { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14 },

  text: { fontWeight: "600" },
  text_default: { color: "#ffffff" },
  text_outline: { color: "#f1f5f9" },
  text_ghost: { color: "#f1f5f9" },
  text_destructive: { color: "#ffffff" },

  textSize_sm: { fontSize: 13 },
  textSize_md: { fontSize: 15 },
  textSize_lg: { fontSize: 16 },
});
