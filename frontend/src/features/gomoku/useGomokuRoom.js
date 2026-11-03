import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { getMe } from "../auth/api";
import { gomokuApi, newerSnapshot, roomSchema } from "./api";

export function useGomokuRoom(roomId) {
  const { member, status, sessionVersion } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const offset = useRef(0);
  const accept = useCallback((next) => {
    setSnapshot((previous) => {
      const accepted = newerSnapshot(previous, next);
      if (accepted === next) offset.current = next.serverNow - Date.now();
      return accepted;
    });
  }, []);
  useEffect(() => {
    const version = ++generation.current;
    if (status !== "authenticated") return undefined;
    let cancelled = false;
    let terminal = false;
    let failures = 0;
    let stream;
    let timer;
    const controller = new AbortController();
    function retry(message, delay = 2000) {
      failures += 1;
      setConnected(false);
      setError(failures >= 3 ? message : null);
      clearTimeout(timer);
      timer = setTimeout(connect, delay);
    }
    async function connect() {
      if (cancelled || terminal) return;
      setConnected(false);
      try {
        await getMe(undefined, { signal: controller.signal });
        const current = await gomokuApi.room(roomId, controller.signal);
        if (cancelled) return;
        accept(current);
        if (current.status === "CLOSED") {
          setError(null);
          terminal = true;
          return;
        }
        stream = new EventSource(`/api/games/gomoku/rooms/${roomId}/events`, {
          withCredentials: true
        });
        const source = stream;
        source.addEventListener("snapshot", (event) => {
          if (cancelled || generation.current !== version || stream !== source) return;
          try {
            const next = roomSchema.parse(JSON.parse(event.data));
            if (next.id !== Number(roomId)) throw new Error("room mismatch");
            accept(next);
            setConnected(next.status !== "CLOSED");
            failures = 0;
            setError(null);
            if (next.status === "CLOSED") {
              terminal = true;
              stream.close();
              clearTimeout(timer);
            }
          } catch {
            source.close();
            stream = null;
            retry("게임 정보를 계속 확인하지 못하고 있어요. 자동으로 다시 시도해요.");
          }
        });
        source.onerror = () => {
          if (cancelled || terminal || stream !== source) return;
          source.close();
          stream = null;
          retry("연결을 복구하지 못하고 있어요. 제한 시간은 계속 흐르며 자동으로 다시 시도해요.");
        };
      } catch (failure) {
        if (cancelled) return;
        if ([403, 404].includes(failure.status)) {
          terminal = true;
          setError("참여 중인 방이 아니거나 종료된 방이에요.");
        } else {
          retry("방에 계속 연결하지 못하고 있어요. 자동으로 다시 시도해요.", 3000);
        }
      }
    }
    void connect();
    return () => {
      cancelled = true;
      generation.current += 1;
      controller.abort();
      stream?.close();
      clearTimeout(timer);
    };
  }, [roomId, member?.id, status, sessionVersion, accept]);
  async function act(operation) {
    if (actionLock.current || !connected) return false;
    const version = generation.current;
    actionLock.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
      const latest = await gomokuApi.room(roomId);
      if (generation.current === version) accept(latest);
      return true;
    } catch (failure) {
      if (generation.current === version)
        setError(
          failure.code === "GOMOKU_FORBIDDEN_MOVE"
            ? "흑은 쌍3, 쌍4, 장목 자리에 놓을 수 없어요. 다른 자리를 선택해 주세요."
            : failure.status === 409
              ? "방 상태가 바뀌었거나 둘 수 없는 자리예요. 최신 판을 확인해 주세요."
              : "요청을 완료하지 못했어요. 선택한 자리는 유지돼요. 다시 시도해 주세요."
        );
      return false;
    } finally {
      actionLock.current = false;
      setPending(false);
    }
  }
  return {
    room: snapshot?.id === Number(roomId) ? snapshot : null,
    connected,
    pending,
    error,
    act,
    offset
  };
}
