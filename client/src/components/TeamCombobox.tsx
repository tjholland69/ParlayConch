import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useTeams } from "@/hooks/use-bets";
import { cn } from "@/lib/utils";

/**
 * Searchable team picker backed by the teams reference table
 * (server/routes.ts GET /api/teams). Value is the team's short/nickname
 * (e.g. "Chiefs") to match how games.homeTeam/awayTeam and win-rate
 * filtering (dashboardAnalytics.ts computeWinRateSeries) already store team
 * names as free text — filtering there does an ilike match against that text,
 * so any recognizable team string (nickname, full name, or abbreviation)
 * still narrows results even though this picker standardizes on nickname.
 */
export function TeamCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Any team (e.g. Chiefs)",
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
  const { data: teams, isLoading } = useTeams();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = teams ?? [];
    if (!q) return all;
    return all.filter(
      (t) =>
        t.nickname.toLowerCase().includes(q) ||
        t.fullName.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q) ||
        t.abbreviation.toLowerCase().includes(q),
    );
  }, [teams, search]);

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
          <CommandInput placeholder="Search teams…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No teams found.</CommandEmpty>
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
                  {filtered.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.nickname}
                      onSelect={() => { onChange(t.nickname); setOpen(false); }}
                    >
                      <Check className={cn("w-4 h-4", value === t.nickname ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{t.fullName}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{t.abbreviation}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
