import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/displayName";

type SuperUserResult = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  settings?: { displayName?: string } | null;
};

type ActingAsData = {
  actingAs: SuperUserResult | null;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ActForBar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!user?.isSuperUser) return null;

  const { data: actingAsData } = useQuery<ActingAsData>({
    queryKey: ["/api/superuser/acting-as"],
    queryFn: async () => {
      const res = await fetch("/api/superuser/acting-as", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: searchResults = [], isFetching } = useQuery<SuperUserResult[]>({
    queryKey: ["/api/superuser/users", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/superuser/users?q=${encodeURIComponent(debouncedQuery)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
    staleTime: 10_000,
  });

  const setActAs = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/superuser/act-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to set act-as");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/superuser/acting-as"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setQuery("");
      toast({
        title: `Acting as ${data.actingAs?.email}`,
        description: "All app data now reflects this user's view.",
      });
    },
    onError: () => toast({ title: "Failed to switch user", variant: "destructive" }),
  });

  const clearActAs = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/superuser/act-as", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear act-as");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/superuser/acting-as"], { actingAs: null });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Returned to your own account" });
    },
    onError: () => toast({ title: "Failed to clear act-as", variant: "destructive" }),
  });

  const actingAs = actingAsData?.actingAs;

  if (actingAs) {
    return (
      <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/40 rounded-lg px-3 py-1.5 animate-in fade-in">
        <UserCog className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span className="text-xs text-yellow-300/70 font-mono hidden sm:inline">Acting as</span>
        <span className="text-xs font-semibold text-yellow-300 max-w-[160px] truncate">
          {getDisplayName(actingAs)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 ml-0.5 text-yellow-400/70 hover:text-yellow-200 hover:bg-yellow-500/20 rounded"
          onClick={() => clearActAs.mutate()}
          disabled={clearActAs.isPending}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder="Act for user..."
            className="h-8 w-44 pl-8 text-xs bg-white/5 border-white/10 focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 placeholder:text-muted-foreground/60"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-background/95 backdrop-blur-md border border-white/10 shadow-xl"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchResults.length > 0 ? (
          <div className="py-1 max-h-64 overflow-y-auto">
            {!query && (
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                League Admins
              </p>
            )}
            {searchResults.map((u) => (
              <button
                key={u.id}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  "hover:bg-yellow-500/10 hover:text-yellow-100",
                  setActAs.isPending && "opacity-50 pointer-events-none"
                )}
                onClick={() => setActAs.mutate(u.id)}
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {getDisplayName(u, "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  {(u.settings?.displayName || u.firstName) && (
                    <div className="text-xs font-medium truncate">
                      {getDisplayName(u)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            {isFetching ? (
              <p className="text-xs text-muted-foreground">Searching...</p>
            ) : query ? (
              <p className="text-xs text-muted-foreground">No users found for "{query}"</p>
            ) : (
              <p className="text-xs text-muted-foreground">No league admins found</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
