import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth";
import { pointsApi } from "./api";

const CLAIM_RETRY_INITIAL_MS = 5000;
const CLAIM_RETRY_MAX_MS = 60_000;

function usePointScope() {
  const { member, sessionVersion, status, logoutPending } = useAuth();
  return {
    key: ["points", member?.id, sessionVersion],
    active: Boolean(member?.id) && status === "authenticated" && !logoutPending
  };
}

export function PointSessionClaim() {
  const { member, sessionVersion, status, logoutPending } = useAuth();
  const memberId = member?.id;
  const client = useQueryClient();

  useEffect(() => {
    if (!memberId || status !== "authenticated" || logoutPending) return;
    const controller = new AbortController();
    const key = ["points", memberId, sessionVersion];
    let retry;

    async function claim(retryDelay) {
      try {
        const { queued } = await pointsApi.claim(controller.signal);
        if (!controller.signal.aborted && (queued || retryDelay > CLAIM_RETRY_INITIAL_MS)) {
          void client.invalidateQueries({ queryKey: key });
        }
      } catch (error) {
        const status = error.status;
        const retryable = !status || status === 408 || status === 429 || status >= 500;
        if (!controller.signal.aborted && retryable) {
          retry = window.setTimeout(
            () => void claim(Math.min(retryDelay * 2, CLAIM_RETRY_MAX_MS)),
            retryDelay
          );
        }
      }
    }

    void claim(CLAIM_RETRY_INITIAL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(retry);
    };
  }, [client, memberId, sessionVersion, status, logoutPending]);

  return null;
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
        items.some(({ status }) => status === "PENDING" || status === "NEEDS_REVIEW")) ? 5000 : false
  });
}
