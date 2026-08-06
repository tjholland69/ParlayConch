import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ParlayLegDispute, ParlayLeg, Parlay } from "@shared/schema";

export type DisputeWithContext = ParlayLegDispute & {
  leg: ParlayLeg;
  parlay: Parlay;
  leagueName: string;
  weekLabel: string;
  raisedByName: string;
};

export function useDisputes(status?: string) {
  return useQuery<DisputeWithContext[]>({
    queryKey: ["/api/exceptions/disputes", status ?? "all"],
    queryFn: async () => {
      const url = status ? `/api/exceptions/disputes?status=${status}` : "/api/exceptions/disputes";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
  });
}

export function useDisputeScreenshotUrl() {
  return useMutation({
    mutationFn: async (disputeId: number) => {
      const res = await fetch(`/api/exceptions/disputes/${disputeId}/screenshot`, { credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return (await res.json()) as { url: string };
    },
  });
}

export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: "resolved" | "dismissed"; notes?: string }) => {
      const res = await fetch(`/api/exceptions/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exceptions/disputes"] });
    },
  });
}