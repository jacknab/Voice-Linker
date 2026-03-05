import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

// Log zod errors for debugging
function parseWithLogging<T>(schema: any, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useStats() {
  return useQuery({
    queryKey: [api.stats.get.path],
    queryFn: async () => {
      const res = await fetch(api.stats.get.path, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.status}`);
      }
      const data = await res.json();
      return parseWithLogging(api.stats.get.responses[200], data, "stats.get");
    },
    // Refetch stats every 10 seconds to keep the switchboard feeling "live"
    refetchInterval: 10000,
  });
}
