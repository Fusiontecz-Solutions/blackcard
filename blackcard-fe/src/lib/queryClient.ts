import { QueryClient } from "@tanstack/react-query";
import { defaultQueryOptions } from "@/lib/queryDefaults";

/** Shared React Query client (used for dashboard invalidation from Redux thunks). */
export const appQueryClient = new QueryClient({
  defaultOptions: defaultQueryOptions,
});
