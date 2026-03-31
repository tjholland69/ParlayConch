import { View, ViewProps } from "react-native";

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "", style, ...props }: CardProps) {
  return (
    <View
      className={`bg-card rounded-xl border border-border ${className}`}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardContent({ children, className = "", ...props }: CardProps) {
  return (
    <View className={`p-4 ${className}`} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({ children, className = "", ...props }: CardProps) {
  return (
    <View className={`p-4 pb-2 ${className}`} {...props}>
      {children}
    </View>
  );
}
