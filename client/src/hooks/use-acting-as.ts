import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type SuperUserResult = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  settings?: { displayName?: string; theme?: string; primaryColor?: string } | null;
};

export type ActingAsData = {
  actingAs: SuperUserResult | null;
};

export function useActingAs() {
  const { user } = useAuth();
  return useQuery<ActingAsData>({
    queryKey: ["/api/superuser/acting-as"],
    queryFn: async () => {
      const res = await fetch("/api/superuser/acting-as", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.isSuperUser,
    staleTime: 30_000,
  });
}

/**
 * The user id to compare against for "is this mine?" ownership checks
 * (parlays.userId === ?, parlayLegs.userId === ?, etc).
 *
 * `useAuth().user.id` is deliberately NOT this — GET /api/auth/user is
 * excluded from the server's act-as override (server/routes.ts, "Act-As
 * middleware for super users") so a super user can always see their own real
 * identity while acting as someone else. Every other endpoint (including the
 * parlay/leg data these ownership checks run against) IS act-as'd. Comparing
 * that data's userId against useAuth().user.id directly is a bug: while
 * acting as another user it always returns the real super user's id, which
 * never matches, so every "mine" filter comes back empty. Use this hook's
 * result instead everywhere ownership is checked client-side.
 */
export function useEffectiveUserId(): string | undefined {
  const { user } = useAuth();
  const { data: actingAsData } = useActingAs();
  return actingAsData?.actingAs?.id ?? user?.id;
}
