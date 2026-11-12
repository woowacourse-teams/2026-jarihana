import { requestRoomAdmission } from "./api.js";
import { parseRoomMessage, RoomConnectionError } from "./protocol.js";

const TERMINAL_CLOSES = new Set([4001, 4002, 4003, 4400, 4401, 4403, 4409]);

export function createRoomConnection({ groupId, store, admission = requestRoomAdmission, Socket = WebSocket,
  now = Date.now, random = Math.random }) {
  let socket;
  let stopped = true;
  let generation = 0;
  let attempts = 0;
  let retryTimer;
  let authTimer;
  let heartbeat;
  let abort;
  let lastReceived = 0;
  let lastMove = 0;
  let moveSeq = 0;
  let commandSeq = 0;
  let layoutRevision = null;
  let resyncPending = false;
  const pending = new Map();
  const prefix = `${now().toString(36)}-${random().toString(36).slice(2)}`;
  function context() {
    const state = store.getState();
    return { roomEpoch: state.roomEpoch, connectionGeneration: state.connectionGeneration, layoutRevision: state.layoutRevision };
  }
  function rejectPending(error) {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
  function clearConnection() {
    clearTimeout(authTimer); clearInterval(heartbeat);
    rejectPending(new RoomConnectionError("DISCONNECTED", "연결이 끊겼어요. 다시 연결한 뒤 시도해 주세요."));
  }
  function send(value) {
    if (socket?.readyState !== 1) return false;
    socket.send(JSON.stringify(value));
    return true;
  }
  function schedule() {
    if (stopped) return;
    store.setStatus("reconnecting");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(15000, 500 * 2 ** Math.min(attempts++, 5)) * (0.8 + random() * 0.4));
  }
  function finish(error) {
    stopped = true;
    generation += 1;
    abort?.abort(); clearTimeout(retryTimer); clearConnection();
    socket?.close();
    store.clear("error"); store.setStatus("error", error);
  }
  async function connect() {
    const current = ++generation;
    abort = new AbortController();
    store.setStatus(attempts ? "reconnecting" : "connecting");
    try {
      const ticket = await admission(groupId, abort.signal);
      if (stopped || current !== generation) return;
      moveSeq = 0; lastMove = 0; resyncPending = false;
      socket = new Socket(ticket.websocketUrl);
      const activeSocket = socket;
      authTimer = setTimeout(() => activeSocket.close(), 10000);
      const active = () => !stopped && current === generation && socket === activeSocket;
      activeSocket.onopen = () => {
        if (!active()) { activeSocket.close(); return; }
        send({ type: "AUTH_JOIN", protocolVersion: 1, token: ticket.token });
        clearTimeout(authTimer);
        authTimer = setTimeout(() => activeSocket.close(), 10000);
        lastReceived = now();
        heartbeat = setInterval(() => {
          if (now() - lastReceived > 35000) { activeSocket.close(); return; }
          send({ type: "PING", ...context() });
        }, 10000);
      };
      activeSocket.onmessage = ({ data }) => {
        if (!active()) return;
        lastReceived = now();
        let message;
        try { message = parseRoomMessage(data); } catch (error) { finish(error); return; }
        if (["ROOM_SNAPSHOT", "ROOM_STATE", "MOVEMENT_FRAME"].includes(message.type)) {
          if (message.roomId !== String(groupId)) { finish(new RoomConnectionError("ROOM_MISMATCH", "공간 연결을 다시 확인해 주세요.")); return; }
          const result = store.apply(message);
          if (result === "resync" && !resyncPending) { resyncPending = true; send({ type: "RESYNC", ...context() }); }
          if (message.type === "ROOM_SNAPSHOT") {
            clearTimeout(authTimer); attempts = 0; resyncPending = false;
          }
        } else if (message.type === "COMMAND_RESULT") {
          const request = pending.get(message.commandId);
          if (!request) return;
          clearTimeout(request.timer); pending.delete(message.commandId);
          if (message.success) request.resolve(message);
          else request.reject(new RoomConnectionError(message.code || "REJECTED", message.message || "지금은 할 수 없는 행동이에요."));
        } else if (message.type === "ERROR") {
          // Realtime sends an authoritative snapshot right after rejecting this update.
          if (store.getStatus().status === "connected" &&
            (message.code === "INVALID_MOVEMENT" || message.code === "LAYOUT_MISMATCH")) return;
          const error = new RoomConnectionError(message.code, message.message);
          if (message.retryable) { store.setStatus("reconnecting", error); activeSocket.close(); }
          else finish(error);
        } else if (message.type === "ROOM_CLOSED") {
          finish(new RoomConnectionError(message.code || "ROOM_CLOSED", message.message || "공간이 종료됐어요."));
        }
      };
      activeSocket.onclose = ({ code, reason }) => {
        if (!active()) return;
        clearConnection();
        if (TERMINAL_CLOSES.has(code)) {
          const failure = /^[A-Z_]{1,80}$/.test(reason ?? "") ? reason : code === 4002 ? "CONNECTION_REPLACED" : "ACCESS_DENIED";
          finish(new RoomConnectionError(failure, "연결이 종료됐어요. 입장 상태를 확인해 주세요."));
        }
        else schedule();
      };
      activeSocket.onerror = () => { if (active()) activeSocket.close(); };
    } catch (error) {
      if (stopped || current !== generation || error?.name === "AbortError") return;
      if ([400, 401, 403, 404, 409, 503].includes(error?.status)) finish(error);
      else schedule();
    }
  }
  function ready() { return store.getStatus().status === "connected" && layoutRevision === store.getState().layoutRevision && socket?.readyState === 1; }
  return {
    start() { if (!stopped) return; stopped = false; attempts = 0; void connect(); },
    stop() { stopped = true; generation += 1; abort?.abort(); clearTimeout(retryTimer); clearConnection(); socket?.close(1000, "LEAVE"); store.clear(); },
    ready,
    layoutMatches: () => layoutRevision === store.getState().layoutRevision,
    setLayoutRevision(value) { if (value === layoutRevision) return; layoutRevision = value; store.refresh(); },
    move(payload, force = false) {
      if (!ready() || socket.bufferedAmount > 65536 || (!force && now() - lastMove < 100)) return;
      lastMove = now(); send({ type: "MOVE", ...context(), moveSeq: ++moveSeq, payload });
    },
    command(payload) {
      if (!ready()) return Promise.reject(new RoomConnectionError(store.getStatus().status === "connected" ? "LAYOUT_MISMATCH" : "NOT_READY", "공간에 연결하고 있어요. 잠시 뒤 다시 시도해 주세요."));
      if (pending.size >= 16 || socket.bufferedAmount > 131072) return Promise.reject(new RoomConnectionError("BUSY", "앞선 동작을 처리하고 있어요."));
      const commandId = `${prefix}-${++commandSeq}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(commandId); reject(new RoomConnectionError("TIMEOUT", "동작 결과를 확인하지 못했어요. 현재 상태를 다시 확인해 주세요.")); send({ type: "RESYNC", ...context() }); }, 5000);
        pending.set(commandId, { resolve, reject, timer });
        send({ type: "COMMAND", ...context(), commandId, payload });
      });
    },
    resync() { if (socket?.readyState === 1) send({ type: "RESYNC", ...context() }); }
  };
}
