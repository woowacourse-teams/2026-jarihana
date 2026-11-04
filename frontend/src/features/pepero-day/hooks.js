import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../auth";
import { getPeperoDayRankings, getPeperoDayStatus, getStickHalvingRoomRankings, parseServiceTime } from "./api";

const DAY_MILLIS = 24 * 60 * 60 * 1000;
const BOUNDARY_JITTER_MILLIS = 3000;

export const peperoDayKeys = Object.freeze({
  all: ["pepero-day"],
  rankings: (viewer, board = "event") => ["pepero-day", "rankings", board, viewer],
  status: (viewer) => ["pepero-day", "status", viewer]
});

function useViewerKey() {
  const { member, status } = useAuth();
  if (status === "authenticated") return `member-${member?.id ?? "unknown"}`;
  return status === "loading" ? "loading" : "anonymous";
}

// 이벤트 진행 상태다. 여는 시각, 닫는 시각, 게임방으로 옮기는 시각이 하루 안에 오면 그 순간에 맞춰
// 다시 받아 헤더 진입점, 게임 화면, 게임방 카드가 새로고침 없이 바뀌게 한다. 정각에 요청이 몰리지 않도록
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
    let boundary = null;
    if (data.status === "UPCOMING") boundary = data.opensAt;
    else if (data.status === "OPEN") {
      // 로그인 회원은 매시 정각에 도전 횟수가 다시 채워지므로, 닫는 시각보다 먼저 오면 그때도 다시 받는다.
      const refill = data.remainingAttempts === null ? null : data.attemptsRefillAt;
      boundary = refill && parseServiceTime(refill) < parseServiceTime(data.closesAt) ? refill : data.closesAt;
    }
    else if (!data.gameRoomOpen) boundary = data.gameRoomOpensAt;
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

// board는 "event"(이벤트 최종 순위) 또는 "room"(게임방 순위)이다.
export function usePeperoDayRankings({ board = "event", enabled = true } = {}) {
  const viewer = useViewerKey();
  return useQuery({
    enabled: enabled && viewer !== "loading",
    queryFn: board === "room" ? getStickHalvingRoomRankings : getPeperoDayRankings,
    queryKey: peperoDayKeys.rankings(viewer, board),
    staleTime: 30_000
  });
}
