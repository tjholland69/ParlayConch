import { Pressable, type PressableProps, StyleSheet } from "react-native";
import { ICON_HIT_SIZE } from "@/lib/theme";

type IconButtonProps = PressableProps & {
  /** Visual size of the icon content; the tap target stays at ICON_HIT_SIZE. */
  size?: number;
};

/** Icon-only control with a guaranteed HIG-sized hit target. Use for "i",
 * eye, flag, close, and similar controls that used to be ~14–18px taps. */
export function IconButton({
  children,
  size = ICON_HIT_SIZE,
  style,
  hitSlop,
  accessibilityRole = "button",
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop ?? 4}
      style={(state) => [
        styles.base,
        { width: Math.max(size, ICON_HIT_SIZE), height: Math.max(size, ICON_HIT_SIZE) },
        typeof style === "function" ? style(state) : style,
        state.pressed && styles.pressed,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.65 },
});
