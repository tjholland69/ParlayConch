import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";

type ExpandCollapseControlsProps = {
  onCollapseAll: () => void;
  onExpandAll: () => void;
  className?: string;
};

// Shared "Collapse All" / "Expand All" pair for any list of parlay rollup tiles —
// drives a card's collapseSignal/expandSignal props.
export function ExpandCollapseControls({ onCollapseAll, onExpandAll, className }: ExpandCollapseControlsProps) {
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        title="Collapse all cards"
        onClick={onCollapseAll}
        data-testid="button-collapse-all"
      >
        <ChevronUp className="w-3.5 h-3.5" />
        Collapse All
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        title="Expand all cards"
        onClick={onExpandAll}
        data-testid="button-expand-all"
      >
        <ChevronDown className="w-3.5 h-3.5" />
        Expand All
      </Button>
    </div>
  );
}
