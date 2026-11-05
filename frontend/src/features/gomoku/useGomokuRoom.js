import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { getMe } from "../auth/api";
import { gomokuApi, newerSnapshot, roomSchema } from "./api";
import { chatSignalSchema } from "./chatApi";

function retryDelay(failures) {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5));
  return ceiling * (0.5 + Math.random() * 0.5);
}

export function useGomokuRoom(roomId) {
  const { member, status, sessionVersion } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [chatSignal, setChatSignal] = useState(null);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const refreshTimer = useRef(null);
  const refreshVersion = useRef(0);
  const offset = useRef(0);
  const accept = useCallback((next) => {
    clearTimeout(refreshTimer.current);
    refreshVersion.current += 1;
    setSnapshot((previous) => {
      const accepted = previous?.id === next.id ? newerSnapshot(previous, next) : next;
      if (accepted === next) offset.current = next.serverNow - Date.now();
      return accepted;
    });
  }, []);
  useEffect(() => {
    const version = ++generation.current;
    actionLock.current = false;
    if (status !== "authenticated") return undefined;
    let cancelled = false;
    let terminal = false;
    let failures = 0;
    let initializing = true;
    let stream;
    let timer;
    let snapshotTimer;
    const controller = new AbortController();
    const active = () => !cancelled && generation.current === version;
    function retry(message) {
      failures += 1;
      setConnected(false);
      setError(failures >= 3 ? message : null);
      clearTimeout(timer);
      timer = setTimeout(connect, retryDelay(failures));
    }
    async function connect() {
      if (!active() || terminal) return;
      if (initializing) {
        initializing = false;
        setConnected(false);
        setError(null);
        setPending(false);
      }
      try {
        await getMe(undefined, { signal: controller.signal });
        if (!active()) return;
        const current = await gomokuApi.room(roomId, controller.signal);
        if (!active()) return;
        accept(current);
        if (current.status === "CLOSED") {
          setConnected(false);
          setError(null);
          terminal = true;
          return;
        }
        stream = new EventSource(`/api/games/gomoku/rooms/${roomId}/events`, {
          withCredentials: true
        });
        const source = stream;
        let receivedSnapshot = false;
        function disconnect(message, allowGrace) {
          if (!active() || terminal || stream !== source) return;
          source.close();
          stream = null;
          clearTimeout(snapshotTimer);
          if (allowGrace && receivedSnapshot) void connect();
          else retry(message);
        }
        snapshotTimer = setTimeout(() => disconnect(
          "게임 정보를 계속 확인하지 못하고 있어요. 자동으로 다시 시도해요.", false
        ), 10_000);
        source.addEventListener("chat_changed", (event) => {
          if (cancelled || generation.current !== version || stream !== source) return;
          try {
            const signal = chatSignalSchema.safeParse(JSON.parse(event.data));
            if (signal.success) setChatSignal(signal.data);
          } catch {
            // Chat recovery also runs on reconnect and visibility changes.
          }
        });
        source.addEventListener("snapshot", (event) => {
          if (!active() || stream !== source) return;
          try {
            const next = roomSchema.parse(JSON.parse(event.data));
            if (next.id !== Number(roomId)) throw new Error("room mismatch");
            accept(next);
            receivedSnapshot = true;
            clearTimeout(snapshotTimer);
            setConnected(next.status !== "CLOSED");
            failures = 0;
            setError(null);
            if (next.status === "CLOSED") {
              terminal = true;
              source.close();
              clearTimeout(timer);
            }
          } catch {
            disconnect("게임 정보를 계속 확인하지 못하고 있어요. 자동으로 다시 시도해요.", false);
          }
        });
        source.onerror = () => disconnect(
          "연결을 복구하지 못하고 있어요. 제한 시간은 계속 흐르며 자동으로 다시 시도해요.", true
        );
      } catch (failure) {
        if (!active()) return;
        if ([403, 404].includes(failure.status)) {
          terminal = true;
          setConnected(false);
          setError("참여 중인 방이 아니거나 종료된 방이에요.");
        } else {
          retry("방에 계속 연결하지 못하고 있어요. 자동으로 다시 시도해요.");
        }
      }
    }
    void connect();
    return () => {
      cancelled = true;
      generation.current += 1;
      refreshVersion.current += 1;
      controller.abort();
      stream?.close();
      clearTimeout(timer);
      clearTimeout(snapshotTimer);
      clearTimeout(refreshTimer.current);
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
      if (generation.current !== version) return false;
      const refreshId = ++refreshVersion.current;
      clearTimeout(refreshTimer.current);
      let failures = 0;
      async function refresh() {
        if (generation.current !== version || refreshVersion.current !== refreshId) return;
        try {
          const latest = await gomokuApi.room(roomId);
          if (generation.current !== version || refreshVersion.current !== refreshId) return;
          accept(latest);
          setError((previous) => previous?.startsWith("요청은 처리") ? null : previous);
        } catch (failure) {
          if (generation.current !== version || refreshVersion.current !== refreshId) return;
          if ([403, 404].includes(failure.status)) {
            setConnected(false);
            setError("요청은 처리됐지만 더 이상 이 방을 조회할 수 없어요.");
            return;
          }
          setError("요청은 처리됐어요. 최신 게임 정보를 다시 확인하고 있어요.");
          refreshTimer.current = setTimeout(refresh, retryDelay(++failures));
        }
      }
      void refresh();
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
      if (generation.current === version) {
        actionLock.current = false;
        setPending(false);
      }
    }
  }
  return {
    room: snapshot?.id === Number(roomId) ? snapshot : null,
    connected,
    pending,
    error,
    chatSignal,
    act,
    offset
  };
}
