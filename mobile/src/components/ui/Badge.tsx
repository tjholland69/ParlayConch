import { View, Text } from "react-native";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { container: string; text: string }> = {
  default: { container: "bg-primary", text: "text-background" },
  success: { container: "bg-green-500/20", text: "text-green-400" },
  warning: { container: "bg-yellow-500/20", text: "text-yellow-400" },
  destructive: { container: "bg-red-500/20", text: "text-red-400" },
  secondary: { container: "bg-muted", text: "text-muted-foreground" },
  outline: { container: "border border-border", text: "text-muted-foreground" },
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const styles = variantStyles[variant];
  return (
    <View className={`px-2 py-0.5 rounded-full ${styles.container} ${className}`}>
      <Text className={`text-xs font-semibold ${styles.text}`}>{children}</Text>
    </View>
  );
}
