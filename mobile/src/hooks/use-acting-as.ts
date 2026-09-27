import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export type SuperUserResult = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  // The server returns the acted-as user's whole settings jsonb column
  // (server/routes.ts, GET /api/superuser/acting-as) — not just displayName,
  // so preferences like preferredSportsbook are readable through this too
  // (via an `as any`/`as SomeType` cast at the read site, same as
  // useAuth().user.settings elsewhere).
  settings?: ({ displayName?: string } & Record<string, unknown>) | null;
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

/**
 * The user id to compare against for "is this mine?" ownership checks
 * (parlays.userId === ?, parlayLegs.userId === ?, league member role
 * lookups, etc). `useAuth().user.id` is deliberately NOT this — GET
 * /api/auth/user is excluded from the server's act-as override (see
 * server/routes.ts, "Act-As middleware for super users") so a super user
 * can always see their own real identity while acting as someone else.
 * Every other endpoint (parlay/leg/league-member data these ownership
 * checks run against) IS act-as'd. Comparing that data's userId against
 * useAuth().user.id directly is a bug: while acting as another user it
 * always returns the real super user's id, which never matches. Use this
 * hook's result instead wherever ownership is checked client-side.
 */
export function useEffectiveUserId(): string | undefined {
  const { user } = useAuth();
  const { data: actingAsData } = useActingAs();
  return actingAsData?.actingAs?.id ?? user?.id;
}

/**
 * The settings object to read app preferences from (preferredSportsbook,
 * notification prefs, etc). Same reasoning as useEffectiveUserId: while
 * acting as another user, useAuth().user.settings is still the real super
 * user's settings (GET /api/auth/user is exempt from the act-as override),
 * but PATCH /api/users/me/settings writes to the acted-as user's row — so
 * reading from useAuth().user.settings directly is a read/write mismatch.
 * Use this wherever a preference is read for display or as a default.
 */
export function useEffectiveSettings(): Record<string, unknown> | null | undefined {
  const { user } = useAuth();
  const { data: actingAsData } = useActingAs();
  return actingAsData?.actingAs ? actingAsData.actingAs.settings : user?.settings;
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
