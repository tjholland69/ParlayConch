import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export type SuperUserResult = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  settings?: { displayName?: string } | null;
};

export type ActingAsData = {
  actingAs: SuperUserResult | null;
};

/** Mirrors the web app's act-as (impersonation) feature — same
 * `/api/superuser/*` endpoints, gated on `user.isSuperUser`. */
export function useActingAs() {
  const { user } = useAuth();
  return useQuery<ActingAsData>({
    queryKey: ["/api/superuser/acting-as"],
    queryFn: () => apiRequest<ActingAsData>("GET", "/api/superuser/acting-as"),
    enabled: !!user?.isSuperUser,
    staleTime: 30_000,
  });
}

export function useSuperUserSearch(query: string, enabled: boolean) {
  return useQuery<SuperUserResult[]>({
    queryKey: ["/api/superuser/users", query],
    queryFn: () => apiRequest<SuperUserResult[]>("GET", `/api/superuser/users?q=${encodeURIComponent(query)}`),
    enabled,
    staleTime: 10_000,
  });
}

function invalidateIdentityScopedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
  queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
  queryClient.invalidateQueries({ queryKey: ["/api/dashboard/patterns"] });
  queryClient.invalidateQueries({ queryKey: ["/api/dashboard/performance"] });
}

export function useSetActAs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiRequest<ActingAsData>("POST", "/api/superuser/act-as", { userId }),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/superuser/acting-as"], data);
      invalidateIdentityScopedQueries(queryClient);
    },
  });
}

export function useClearActAs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<ActingAsData>("DELETE", "/api/superuser/act-as"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/superuser/acting-as"], { actingAs: null });
      invalidateIdentityScopedQueries(queryClient);
    },
  });
}
