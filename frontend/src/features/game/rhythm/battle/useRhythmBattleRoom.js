import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../auth";
import { battleBatchesSchema, battleChatSchema, battleRoomSchema, rhythmBattleApi } from "./battleApi";

function retryDelay(failures) {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5));
  return ceiling * (0.5 + Math.random() * 0.5);
}

function mergeById(previous, added) {
  const known = new Set(previous.map((item) => item.id));
  const fresh = added.filter((item) => !known.has(item.id));
  if (!fresh.length) return previous;
  return [...previous, ...fresh].sort((a, b) => a.id - b.id);
}

// 대전 방의 현재 모습, 지금 판의 입력 묶음, 채팅을 실시간 연결(SSE)로 받는다.
// 끊기면 방을 다시 읽고 다시 연결한다. 방 모습은 revision이 큰 것만 받아 순서가 뒤집히지 않게 한다.
// serverOffset은 서버 시계와 이 브라우저 시계의 차이(밀리초)이며, 공통 시작 시각에 음악을 맞출 때 쓴다.
export function useRhythmBattleRoom(roomId) {
  const { status, member } = useAuth();
  const [room, setRoom] = useState(null);
  const [batches, setBatches] = useState({ gameNumber: 0, items: [] });
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const serverOffset = useRef(0);
  const actionLock = useRef(false);

  const accept = useCallback((next) => {
    setRoom((previous) => {
      if (previous && previous.id === next.id && previous.revision > next.revision) return previous;
      serverOffset.current = next.serverNow - Date.now();
      return next;
    });
  }, []);

  const acceptBatches = useCallback((next) => {
    setBatches((previous) =>
      previous.gameNumber === next.gameNumber
        ? { gameNumber: next.gameNumber, items: mergeById(previous.items, next.items) }
        : next
    );
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return undefined;
    let cancelled = false;
    let terminal = false;
    let failures = 0;
    let stream = null;
    let timer = null;
    const controller = new AbortController();

    function retry(message) {
      failures += 1;
      setConnected(false);
      setError(failures >= 3 ? message : null);
      clearTimeout(timer);
      timer = setTimeout(connect, retryDelay(failures));
    }

    async function connect() {
      if (cancelled || terminal) return;
      try {
        const current = await rhythmBattleApi.room(roomId, controller.signal);
        if (cancelled) return;
        accept(current);
        if (current.status === "CLOSED") {
          terminal = true;
          setConnected(false);
          return;
        }
        rhythmBattleApi
          .chat(roomId, controller.signal)
          .then((history) => !cancelled && setMessages((previous) => mergeById(previous, history.items)))
          .catch(() => {});
        stream = new EventSource(`/api/games/rhythm-battle/rooms/${roomId}/events`, { withCredentials: true });
        const source = stream;
        source.addEventListener("snapshot", (event) => {
          if (cancelled || stream !== source) return;
          try {
            const next = battleRoomSchema.parse(JSON.parse(event.data));
            if (next.id !== Number(roomId)) return;
            accept(next);
            failures = 0;
            setConnected(next.status !== "CLOSED");
            setError(null);
            if (next.status === "CLOSED") {
              terminal = true;
              source.close();
            }
          } catch {
            source.close();
            retry("방 정보를 계속 확인하지 못하고 있어요. 자동으로 다시 시도해요.");
          }
        });
        source.addEventListener("batches", (event) => {
          if (cancelled || stream !== source) return;
          try {
            const parsed = battleBatchesSchema.safeParse(JSON.parse(event.data));
            if (parsed.success) acceptBatches(parsed.data);
          } catch {
            // 다음 묶음과 다시 연결할 때 처음부터 다시 받는다.
          }
        });
        source.addEventListener("chat", (event) => {
          if (cancelled || stream !== source) return;
          try {
            const parsed = battleChatSchema.safeParse(JSON.parse(event.data));
            if (parsed.success) setMessages((previous) => mergeById(previous, parsed.data.items));
          } catch {
            // 다시 연결할 때 채팅 기록을 다시 읽는다.
          }
        });
        source.onerror = () => {
          if (cancelled || terminal || stream !== source) return;
          source.close();
          stream = null;
          retry("연결을 복구하지 못하고 있어요. 자동으로 다시 시도해요.");
        };
      } catch (failure) {
        if (cancelled) return;
        if ([403, 404].includes(failure.status)) {
          terminal = true;
          setConnected(false);
          setError("참여 중인 방이 아니거나 닫힌 방이에요.");
          return;
        }
        retry("방에 계속 연결하지 못하고 있어요. 자동으로 다시 시도해요.");
      }
    }

    void connect();
    return () => {
      cancelled = true;
      controller.abort();
      stream?.close();
      clearTimeout(timer);
    };
  }, [roomId, status, member?.id, accept, acceptBatches]);

  // 방 명령을 한 번에 하나씩 보내고, 끝나면 방을 다시 읽어 실시간 연결보다 먼저 화면을 맞춘다.
  const act = useCallback(
    async (operation) => {
      if (actionLock.current) return false;
      actionLock.current = true;
      setPending(true);
      setError(null);
      try {
        await operation();
        try {
          accept(await rhythmBattleApi.room(roomId));
        } catch {
          // 실시간 연결이 곧 새 모습을 보내 준다.
        }
        return true;
      } catch (failure) {
        setError(
          failure.status === 409
            ? "방 상태가 바뀌었어요. 최신 상태를 확인해 주세요."
            : failure.message || "요청을 완료하지 못했어요. 다시 시도해 주세요."
        );
        return false;
      } finally {
        actionLock.current = false;
        setPending(false);
      }
    },
    [roomId, accept]
  );

  const addMessage = useCallback((message) => setMessages((previous) => mergeById(previous, [message])), []);

  return {
    room: room?.id === Number(roomId) ? room : null,
    batches,
    messages,
    connected,
    error,
    pending,
    act,
    accept,
    addMessage,
    serverOffset
  };
}
