import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { usePlayerSearch } from "@/hooks/use-bets";
import { cn } from "@/lib/utils";

/**
 * Searchable player picker backed by the players table (server/routes.ts
 * GET /api/players). Value is the player's display name — filters match
 * against parlay_legs.playerName as free text, so we keep that contract
 * rather than switching filters over to player id.
 */
export function PlayerCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Any player",
  testId,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: players, isFetching } = usePlayerSearch(search);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="w-full justify-between bg-background border-white/10 font-normal"
          data-testid={testId}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-56 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search players…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isFetching ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No players found.</CommandEmpty>
                <CommandGroup>
                  {value && (
                    <CommandItem
                      value="__clear__"
                      onSelect={() => { onChange(""); setOpen(false); }}
                      className="text-muted-foreground"
                    >
                      Clear selection
                    </CommandItem>
                  )}
                  {(players ?? []).map((p) => {
                    const name = p.displayName || p.name;
                    return (
                      <CommandItem
                        key={p.id}
                        value={name}
                        onSelect={() => { onChange(name); setOpen(false); }}
                      >
                        <Check className={cn("w-4 h-4", value === name ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{name}</span>
                        {p.position && <span className="text-xs text-muted-foreground ml-auto">{p.position}{p.team ? ` · ${p.team}` : ""}</span>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}