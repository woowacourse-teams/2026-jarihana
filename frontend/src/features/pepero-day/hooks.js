import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../auth";
import { getPeperoDayRankings, getPeperoDayStatus, parseServiceTime } from "./api";

const DAY_MILLIS = 24 * 60 * 60 * 1000;
const BOUNDARY_JITTER_MILLIS = 3000;

export const peperoDayKeys = Object.freeze({
  all: ["pepero-day"],
  rankings: (viewer) => ["pepero-day", "rankings", viewer],
  status: (viewer) => ["pepero-day", "status", viewer]
});

function useViewerKey() {
  const { member, status } = useAuth();
  if (status === "authenticated") return `member-${member?.id ?? "unknown"}`;
  return status === "loading" ? "loading" : "anonymous";
}

// 이벤트 진행 상태다. 여는 시각이나 닫는 시각이 하루 안에 오면 그 순간에 맞춰 다시 받아
// 헤더 진입점과 게임 화면이 새로고침 없이 열리고 닫히게 한다. 정각에 요청이 몰리지 않도록
// 0~3초 사이에서 흩어 보낸다.
export function usePeperoDayStatus({ enabled = true } = {}) {
  const queryClient = useQueryClient();
  const viewer = useViewerKey();
  const query = useQuery({
    enabled: enabled && viewer !== "loading",
    queryFn: getPeperoDayStatus,
    queryKey: peperoDayKeys.status(viewer),
    retry: 1,
    staleTime: 60_000
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return undefined;
    const boundary = data.status === "UPCOMING" ? data.opensAt : data.status === "OPEN" ? data.closesAt : null;
    if (!boundary) return undefined;
    const offset = parseServiceTime(data.serverTime) - Date.now();
    const wait = parseServiceTime(boundary) - (Date.now() + offset);
    if (!(wait > 0) || wait > DAY_MILLIS) return undefined;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
    }, wait + Math.random() * BOUNDARY_JITTER_MILLIS);
    return () => clearTimeout(timer);
  }, [data, queryClient]);

  return query;
}

export function usePeperoDayRankings({ enabled = true } = {}) {
  const viewer = useViewerKey();
  return useQuery({
    enabled: enabled && viewer !== "loading",
    queryFn: getPeperoDayRankings,
    queryKey: peperoDayKeys.rankings(viewer),
    staleTime: 30_000
  });
}
