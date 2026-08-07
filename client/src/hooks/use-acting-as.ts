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
