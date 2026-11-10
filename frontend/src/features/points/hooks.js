import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { pointsApi } from "./api";

function usePointScope() {
  const { member, sessionVersion, status, logoutPending } = useAuth();
  return {
    key: ["points", member?.id, sessionVersion],
    active: Boolean(member?.id) && status === "authenticated" && !logoutPending
  };
}

export function usePointSummary() {
  const { key, active } = usePointScope();
  return useQuery({
    queryKey: [...key, "summary"],
    queryFn: ({ signal }) => pointsApi.summary(signal),
    enabled: active,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => query.state.data?.processing ? 5000 : false
  });
}

export function usePointHistory(enabled, processing) {
  const { key, active } = usePointScope();
  return useInfiniteQuery({
    queryKey: [...key, "transactions"],
    queryFn: ({ pageParam, signal }) => pointsApi.history(pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: active && enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      processing || query.state.data?.pages.some(({ items }) =>
        items.some(({ status }) => status === "PENDING")) ? 5000 : false
  });
}
