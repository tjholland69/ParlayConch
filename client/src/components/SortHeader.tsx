import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-column-sort";

/** Clickable column label for a table sorted with useColumnSort. */
export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir | null;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort by ${label}`}
      aria-label={`Sort by ${label}`}
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors",
        align === "right" && "flex-row-reverse",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      <Icon className={cn("w-3 h-3 shrink-0", !active && "opacity-40")} />
    </button>
  );
}
