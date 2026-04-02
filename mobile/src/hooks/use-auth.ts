import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, clearSessionToken } from "@/lib/api";

export type MobileUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  isDemo?: boolean | null;
  settings?: Record<string, unknown> | null;
};

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<MobileUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
      await clearSessionToken();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
