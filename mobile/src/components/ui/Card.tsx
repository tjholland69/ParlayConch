import { View, ViewProps, StyleSheet } from "react-native";

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

export function CardContent({ children, style, ...props }: CardProps) {
  return (
    <View style={[styles.content, style]} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({ children, style, ...props }: CardProps) {
  return (
    <View style={[styles.header, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1c2538",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3447",
  },
  content: { padding: 14 },
  header: { padding: 14, paddingBottom: 8 },
});
