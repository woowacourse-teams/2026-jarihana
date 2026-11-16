import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../auth";
import { getPeperoDayRankings, getPeperoDayStatus, getStickHalvingRoomRankings, parseServiceTime } from "./api";

const DAY_MILLIS = 24 * 60 * 60 * 1000;
const BOUNDARY_JITTER_MILLIS = 3000;
const RETRY_AFTER_ERROR_MILLIS = 30_000;

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

// 이벤트 진행 상태다. 여는 시각, 닫는 시각, 게임방으로 옮기는 시각에 맞춰 다시 받아 게임 화면과
// 게임방 카드가 새로고침 없이 바뀌게 한다. 정각에 요청이 몰리지 않도록 0~3초 사이에서 흩어 보낸다.
// 다음 경계가 하루보다 멀면 하루 뒤에 한 번 다시 받고, 그때 받은 상태로 남은 시간을 다시 예약한다.
// 다시 받기가 실패하면 마지막으로 받은 상태를 그대로 두고 30초 뒤에 또 받는다. 받은 상태가 바뀌지 않아
// 경계 예약이 다시 걸리지 않으므로, 이렇게 하지 않으면 경계를 넘긴 상태가 화면에 반영되지 않는다.
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
    else if (data.status === "OPEN") boundary = data.closesAt;
    else if (!data.gameRoomOpen) boundary = data.gameRoomOpensAt;
    if (!boundary) return undefined;
    const offset = parseServiceTime(data.serverTime) - Date.now();
    const wait = parseServiceTime(boundary) - (Date.now() + offset);
    if (!(wait > 0)) return undefined;
    const delay = wait > DAY_MILLIS ? DAY_MILLIS : wait + Math.random() * BOUNDARY_JITTER_MILLIS;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
    }, delay);
    return () => clearTimeout(timer);
  }, [data, queryClient]);

  const failedWithData = query.isError && Boolean(data);
  const failedAt = query.errorUpdatedAt;
  useEffect(() => {
    if (!failedWithData) return undefined;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
    }, RETRY_AFTER_ERROR_MILLIS + Math.random() * BOUNDARY_JITTER_MILLIS);
    return () => clearTimeout(timer);
  }, [failedAt, failedWithData, queryClient]);

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
