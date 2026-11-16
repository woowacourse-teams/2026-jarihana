import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { rhythmRankedApi } from "./rankedApi.js";

// 난이도별 회원 최고 기록 랭킹이다. 랭킹 도전을 마친 직후에도 새 기록이 보이도록 매번 다시 읽는다.
export function useRhythmRanking(level, enabled = true) {
  const { member, status, sessionVersion } = useAuth();
  return useInfiniteQuery({
    queryKey: ["rhythm-harpoon", "ranking", level, member?.id, sessionVersion],
    queryFn: ({ pageParam, signal }) => rhythmRankedApi.rankings(level, pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (page) => (page.hasNext ? page.nextCursor : undefined),
    enabled: enabled && status === "authenticated",
    gcTime: 0,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always"
  });
}
