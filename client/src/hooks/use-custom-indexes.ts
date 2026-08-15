import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { CustomIndexWithAccess, CustomIndexFilters, LeagueMemberWithUser, League } from "@shared/schema";
import type { WinRateTimeSeriesPoint } from "@/hooks/use-dashboard";

/**
 * Human-readable "Leagues: X · Members: Y · ..." description of an index's
 * filter criteria — what makes this index different from another. Shared by
 * the custom index list and any picker that wants a filter-criteria tooltip.
 */
export function describeCustomIndexFilters(filters: CustomIndexFilters | undefined, leagues: League[]): string {
  const leagueNames = (filters?.leagueIds ?? [])
    .map((id) => leagues.find((l) => l.id === id)?.name)
    .filter(Boolean);

  return [
    leagueNames.length > 0 ? leagueNames.join(", ") : "All my leagues",
    (filters?.memberUserIds ?? []).length > 0
      ? `${filters!.memberUserIds.length} member${filters!.memberUserIds.length === 1 ? "" : "s"}`
      : "All members",
    (filters?.betTypes ?? []).length > 0 ? filters!.betTypes.join(", ") : "All bet types",
    ...((filters?.propTypes ?? []).length > 0 ? [filters!.propTypes!.join(", ")] : []),
    ...(filters?.playerName ? [filters.playerName] : []),
    ...(filters?.teamName ? [filters.teamName] : []),
  ].join(" · ");
}

/**
 * Members across several leagues at once, deduped by user id. Uses the existing
 * GET /api/leagues/:id/members endpoint — one query per league so each is cached
 * and shared with the league settings screens.
 */
export function useLeagueMembers(leagueIds: number[]) {
  const results = useQueries({
    queries: leagueIds.map((leagueId) => ({
      queryKey: ["/api/leagues", leagueId, "members"],
      queryFn: async () => {
        const res = await fetch(`/api/leagues/${leagueId}/members`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch members");
        return res.json() as Promise<LeagueMemberWithUser[]>;
      },
      enabled: !!leagueId,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const byUserId = new Map<string, LeagueMemberWithUser>();
  for (const result of results) {
    for (const member of result.data ?? []) {
      // Keep the highest-privilege role seen if a user is in several selected leagues
      const existing = byUserId.get(member.userId);
      if (!existing || (member.role === "admin" && existing.role !== "admin")) {
        byUserId.set(member.userId, member);
      }
    }
  }

  return { members: Array.from(byUserId.values()), isLoading };
}

export interface CustomIndexInput {
  displayName: string;
  scope?: "private" | "league";
  publishedLeagueId?: number | null;
  filters: CustomIndexFilters;
}

export function useCustomIndexes() {
  return useQuery<CustomIndexWithAccess[]>({
    queryKey: [api.customIndexes.list.path],
    queryFn: async () => {
      const res = await fetch(api.customIndexes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom indexes");
      return res.json();
    },
  });
}

export function useCustomIndexPerformance(id: number | undefined) {
  return useQuery<{ points: WinRateTimeSeriesPoint[] }>({
    queryKey: [api.customIndexes.performance.path, id],
    queryFn: async () => {
      const url = buildUrl(api.customIndexes.performance.path, { id: id! });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom index performance");
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Performance series for several custom indexes at once — one query per id, so
 * each stays independently cached and shares the single-index cache entries.
 * Returned keyed by id; a missing key means still loading or errored.
 */
export function useCustomIndexPerformances(ids: number[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: [api.customIndexes.performance.path, id],
      queryFn: async () => {
        const res = await fetch(buildUrl(api.customIndexes.performance.path, { id }), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch custom index performance");
        return res.json() as Promise<{ points: WinRateTimeSeriesPoint[] }>;
      },
    })),
  });

  const byId: Record<number, WinRateTimeSeriesPoint[]> = {};
  ids.forEach((id, i) => {
    const points = results[i]?.data?.points;
    if (points) byId[id] = points;
  });

  return { byId, isLoading: results.some((r) => r.isLoading) };
}

export function useCreateCustomIndex() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CustomIndexInput) => {
      const res = await fetch(api.customIndexes.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json() as Promise<CustomIndexWithAccess>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.list.path] });
      toast({ title: "Custom index created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateCustomIndex() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomIndexInput> & { id: number }) => {
      const res = await fetch(buildUrl(api.customIndexes.update.path, { id }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json() as Promise<CustomIndexWithAccess>;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.performance.path, variables.id] });
      toast({ title: "Custom index updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCustomIndex() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.customIndexes.remove.path, { id }), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.list.path] });
      toast({ title: "Custom index deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useShareCustomIndex() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: number; userId: string }) => {
      const res = await fetch(buildUrl(api.customIndexes.share.path, { id }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.list.path] });
      toast({ title: "Index shared" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUnshareCustomIndex() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: number; userId: string }) => {
      const res = await fetch(buildUrl(api.customIndexes.unshare.path, { id, userId }), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.customIndexes.list.path] });
      toast({ title: "Sharing removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}
