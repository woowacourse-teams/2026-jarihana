import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { gomokuApi } from "./api";

export function useGomokuHistory() {
  const { member, status, sessionVersion } = useAuth();
  const options = {
    enabled: status === "authenticated",
    gcTime: 0,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  };
  const key = ["gomoku", "statistics", member?.id, sessionVersion];
  const summary = useQuery({
    ...options,
    queryKey: [...key, "summary"],
    queryFn: ({ signal }) => gomokuApi.statistics(signal)
  });
  const history = useInfiniteQuery({
    ...options,
    queryKey: [...key, "history"],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => gomokuApi.history(pageParam, signal),
    getNextPageParam: (page) => (page.hasNext ? page.nextCursor : undefined)
  });
  return { summary, history };
}

export function useGomokuRanking() {
  const { member, status, sessionVersion } = useAuth();
  return useInfiniteQuery({
    queryKey: ["gomoku", "statistics", member?.id, sessionVersion, "ranking"],
    queryFn: ({ pageParam, signal }) => gomokuApi.ranking(pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (page) => (page.hasNext ? page.nextCursor : undefined),
    enabled: status === "authenticated",
    gcTime: 0,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });
}
