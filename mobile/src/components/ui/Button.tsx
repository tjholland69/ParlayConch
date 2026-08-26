import { useState } from "react";
import { Pressable, Text, ActivityIndicator, PressableProps, StyleSheet } from "react-native";
import { BUTTON_MIN_HEIGHT } from "@/lib/theme";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends PressableProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretches to the width of its parent (e.g. a full-bleed form CTA).
   * Defaults to false — the button shrinks to fit its content/padding,
   * which is almost always what you want for a tappable control. */
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  style,
  fullWidth = false,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  // Track pressed via state + a flat style object so callers can still pass
  // a style callback without fighting Pressable's own style function merge.
  const [pressed, setPressed] = useState(false);

  const resolvedCallerStyle = typeof style === "function" ? style({ pressed, hovered: false }) : style;
  const containerStyle = StyleSheet.flatten([
    styles.base,
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    fullWidth ? styles.fullWidth : styles.autoWidth,
    pressed && !isDisabled && styles.pressed,
    isDisabled && styles.disabled,
    resolvedCallerStyle,
  ]);

  const textStyle = [styles.text, TEXT_VARIANT_STYLES[variant], TEXT_SIZE_STYLES[size]];

  const spinnerColor = variant === "default" || variant === "destructive" ? "#ffffff" : "#94a3b8";

  return (
    <Pressable
      disabled={isDisabled}
      style={containerStyle}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={spinnerColor} />}
      {/* A plain string/number label gets wrapped in Text with the variant's
       * text styling. Anything else (e.g. an icon + label row) is rendered
       * as-is so callers can lay out their own children inside the button's
       * flex row — Text can't host arbitrary non-text children. */}
      {typeof children === "string" || typeof children === "number" ? (
        <Text style={textStyle}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: BUTTON_MIN_HEIGHT,
  },
  fullWidth: { width: "100%" },
  autoWidth: { alignSelf: "center" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  text: { fontWeight: "600" },
});

const VARIANT_STYLES: Record<ButtonVariant, object> = {
  default: { backgroundColor: "#2563eb" },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#2a3447" },
  ghost: { backgroundColor: "transparent" },
  destructive: { backgroundColor: "#ef4444" },
};

const SIZE_STYLES: Record<ButtonSize, object> = {
  sm: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10 },
  md: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  lg: { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14 },
};

const TEXT_VARIANT_STYLES: Record<ButtonVariant, object> = {
  default: { color: "#ffffff" },
  outline: { color: "#f1f5f9" },
  ghost: { color: "#f1f5f9" },
  destructive: { color: "#ffffff" },
};

const TEXT_SIZE_STYLES: Record<ButtonSize, object> = {
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 16 },
};
