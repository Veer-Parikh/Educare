import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Don't retry client errors (404/403 etc.) — they won't fix themselves.
      retry: (count, err) => !(err?.status >= 400 && err?.status < 500) && count < 2,
    },
    mutations: {
      onError: (err) => toast.error(err?.message || "Something went wrong."),
    },
  },
});
