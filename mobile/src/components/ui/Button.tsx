import { Pressable, Text, ActivityIndicator, PressableProps } from "react-native";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends PressableProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
  default: { container: "bg-primary", text: "text-background font-bold" },
  outline: { container: "border border-border bg-transparent", text: "text-foreground font-semibold" },
  ghost: { container: "bg-transparent", text: "text-foreground font-semibold" },
  destructive: { container: "bg-destructive", text: "text-white font-bold" },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: "py-1.5 px-3 rounded-lg", text: "text-sm" },
  md: { container: "py-2.5 px-4 rounded-xl", text: "text-base" },
  lg: { container: "py-3.5 px-6 rounded-xl", text: "text-base" },
};

export function Button({
  children,
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={`${vs.container} ${ss.container} items-center justify-center flex-row gap-2 ${isDisabled ? "opacity-50" : "active:opacity-75"} ${className}`}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={variant === "default" ? "#09090b" : "#fafafa"} />}
      <Text className={`${vs.text} ${ss.text}`}>{children}</Text>
    </Pressable>
  );
}
