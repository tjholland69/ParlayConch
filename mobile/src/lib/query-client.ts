import { QueryClient } from "@tanstack/react-query";
import { defaultQueryFn } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});
