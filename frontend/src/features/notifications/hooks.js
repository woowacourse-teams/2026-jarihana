import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { fetchNotifications, fetchUnreadCount } from "./api";

export function useNotificationScope() {
  const { member, sessionVersion = 0, status } = useAuth();
  const key = useMemo(() => ["notifications", member?.id ?? null, sessionVersion], [member?.id, sessionVersion]);
  return { key, enabled: status === "authenticated" };
}
export function useUnreadCount() {
  const scope = useNotificationScope();
  return useQuery({ queryKey: [...scope.key, "count"], enabled: scope.enabled,
    queryFn: ({ signal }) => fetchUnreadCount(undefined, signal),
    refetchInterval: 30_000, refetchOnWindowFocus: true });
}
export function useNotificationList(paused = false) {
  const scope = useNotificationScope();
  return useInfiniteQuery({ queryKey: [...scope.key, "list"], enabled: scope.enabled,
    initialPageParam: null, queryFn: ({ pageParam, signal }) => fetchNotifications(pageParam, undefined, signal),
    getNextPageParam: (lastPage, pages, lastCursor, cursors) => {
      if (!lastPage.hasNext) return undefined;
      if (cursors.includes(lastPage.nextCursor) || lastPage.nextCursor === lastCursor) return undefined;
      return lastPage.nextCursor;
    }, refetchOnWindowFocus: !paused });
}
