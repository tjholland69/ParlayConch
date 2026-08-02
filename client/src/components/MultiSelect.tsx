import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

/**
 * Checkbox-style multi-select in a popover. Empty selection is meaningful in the
 * index filters ("all"), so the trigger says so rather than showing a placeholder.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All",
  className,
  emptyMessage = "Nothing to choose from.",
  testId,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  emptyMessage?: string;
  testId?: string;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? "1 selected"
        : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-between bg-background border-white/10 font-normal", className)}
          data-testid={testId}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-56 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ScrollArea className="max-h-64">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-white/5 text-left"
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
              >
                <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {selected.includes(option.value) && <Check className="w-3.5 h-3.5 text-primary" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
