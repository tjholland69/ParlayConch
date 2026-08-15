export function resultColor(result: string | null | undefined): string {
  if (result === "win") return "text-green-400";
  if (result === "loss") return "text-red-400";
  if (result === "push") return "text-blue-400";
  return "text-muted-foreground";
}

export function statusColor(status: string | null | undefined): string {
  switch (status) {
    case "win":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "loss":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "push":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "approved":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "rejected":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "void":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }
}

export function getStatusVariant(
  status: string | null | undefined,
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "win":
      return "default";
    case "loss":
      return "destructive";
    case "push":
      return "secondary";
    case "approved":
      return "outline";
    case "rejected":
      return "destructive";
    case "void":
      return "outline";
    default:
      return "secondary";
  }
}
