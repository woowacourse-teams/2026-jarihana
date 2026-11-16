import { createRoomConnection } from "./connection.js";
import { createRoomStore } from "./roomStore.js";

const snapshot = (extra = {}) => ({ type: "ROOM_SNAPSHOT", protocolVersion: 1, roomId: "42", roomEpoch: "epoch",
  connectionGeneration: "generation", layoutRevision: 1, controlSeq: 1, frameSeq: 1, serverTime: 1000, selfId: "1",
  participants: [], items: [], assets: {}, ...extra });
class Socket {
  static instances = [];
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.sent = []; Socket.instances.push(this); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.onopen(); }
  receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  close(code = 1006, reason = "") { this.readyState = 3; this.onclose?.({ code, reason }); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
let connection;
beforeEach(() => { jest.useFakeTimers(); Socket.instances = []; });
afterEach(() => { connection?.stop(); jest.useRealTimers(); });
async function setup() {
  const store = createRoomStore();
  const admission = jest.fn().mockResolvedValue({ token: "ticket", websocketUrl: "ws://localhost/ws" });
  connection = createRoomConnection({ groupId: "42", store, admission, Socket, random: () => 0.5 });
  connection.setLayoutRevision(1); connection.start(); await flush();
  const socket = Socket.instances[0]; socket.open(); socket.receive(snapshot());
  return { store, socket, admission };
}
test("auth goes in first frame; movement sequence survives a same-session resync", async () => {
  const { socket } = await setup();
  expect(socket.sent[0]).toEqual({ type: "AUTH_JOIN", protocolVersion: 1, token: "ticket" });
  connection.move({ x: 0, y: 0, z: 0, yaw: 0, locomotion: "idle" }, true);
  socket.receive(snapshot());
  connection.move({ x: 1, y: 0, z: 0, yaw: 0, locomotion: "walking" }, true);
  expect(socket.sent.filter((message) => message.type === "MOVE").map((message) => message.moveSeq)).toEqual([1, 2]);
});
test.each(["INVALID_MOVEMENT", "LAYOUT_MISMATCH"])("%s applies the recovery snapshot without closing the socket", async (code) => {
  const { socket, store, admission } = await setup();
  const close = jest.spyOn(socket, "close");
  connection.move({ x: 1, y: 0, z: 0, yaw: 0, locomotion: "walking" }, true);
  socket.receive({ type: "ERROR", code, message: code, retryable: false });
  const layoutRevision = code === "LAYOUT_MISMATCH" ? 2 : 1;
  socket.receive(snapshot({ layoutRevision, frameSeq: 3 }));
  expect(store.getState().frameSeq).toBe(3);
  expect(connection.ready()).toBe(layoutRevision === 1);
  connection.setLayoutRevision(layoutRevision);
  connection.move({ x: 0, y: 0, z: 0, yaw: 0, locomotion: "idle" }, true);
  expect(socket.sent.at(-1)).toMatchObject({ type: "MOVE", layoutRevision, moveSeq: 2 });
  expect(close).not.toHaveBeenCalled();
  expect(admission).toHaveBeenCalledTimes(1);
});
test("connection loss rejects pending action and reconnect does not replay it", async () => {
  const { socket, admission } = await setup();
  const pending = connection.command({ action: "TAKE", assetId: "cabinet", kind: "cookie" });
  const rejected = expect(pending).rejects.toMatchObject({ code: "DISCONNECTED" });
  socket.close(); await rejected;
  jest.advanceTimersByTime(500); await flush();
  expect(admission).toHaveBeenCalledTimes(2);
  const next = Socket.instances[1]; next.open(); next.receive(snapshot({ connectionGeneration: "new" }));
  expect(next.sent.some((message) => message.type === "COMMAND")).toBe(false);
  socket.receive(snapshot({ connectionGeneration: "old" }));
  expect(connection.ready()).toBe(true);
});
test("layout mismatch blocks commands until geometry catches up", async () => {
  const { socket } = await setup();
  socket.receive(snapshot({ type: "ROOM_STATE", controlSeq: 2, layoutRevision: 2 }));
  await expect(connection.command({ action: "SIT", assetId: "removed", slot: 0 })).rejects.toMatchObject({ code: "LAYOUT_MISMATCH" });
  connection.setLayoutRevision(2); expect(connection.ready()).toBe(true);
});
test("unopened socket times out and obtains a fresh admission", async () => {
  const store = createRoomStore(); const admission = jest.fn().mockResolvedValue({ token: "ticket", websocketUrl: "ws://localhost/ws" });
  connection = createRoomConnection({ groupId: "42", store, admission, Socket, random: () => 0.5 });
  connection.start(); await flush(); jest.advanceTimersByTime(10500); await flush();
  expect(admission).toHaveBeenCalledTimes(2);
});
test("membership loss stops retries and clears actors", async () => {
  const { socket, store, admission } = await setup();
  const close = jest.spyOn(socket, "close");
  socket.receive({ type: "ERROR", code: "ACCESS_DENIED", message: "입장 권한이 없어요", retryable: false });
  jest.advanceTimersByTime(60000); await flush();
  expect(admission).toHaveBeenCalledTimes(1); expect(store.getStatus().status).toBe("error");
  expect(store.getState().participants).toEqual([]);
  expect(close).toHaveBeenCalledWith();
});

test("terminal close reason retains layout upgrade guidance when ERROR cannot flush", async () => {
  const { socket, store, admission } = await setup();
  socket.close(4003, "LAYOUT_UPGRADE_REQUIRED");
  jest.advanceTimersByTime(60000); await flush();
  expect(store.getStatus().error).toMatchObject({ code: "LAYOUT_UPGRADE_REQUIRED", message: expect.stringContaining("저장") });
  expect(admission).toHaveBeenCalledTimes(1);
});

test("explicit leave is distinguished from recoverable transport loss", async () => {
  const { socket, store, admission } = await setup();
  const close = jest.spyOn(socket, "close"); connection.stop();
  jest.advanceTimersByTime(60000); await flush();
  expect(close).toHaveBeenCalledWith(1000, "LEAVE");
  expect(admission).toHaveBeenCalledTimes(1);
  expect(store.getStatus().status).toBe("idle");
});

test("missing recovery snapshot automatically reconnects and stale frames cannot resume input", async () => {
  const { socket, store, admission } = await setup();
  socket.receive({ type: "ERROR", code: "INVALID_MOVEMENT", message: "INVALID_MOVEMENT" });
  expect(socket.sent.at(-1).type).toBe("RESYNC");
  socket.receive(snapshot({ type: "ROOM_STATE", frameSeq: 2 }));
  expect(store.getStatus().status).toBe("syncing");
  expect(connection.move({ x: 1 }, true)).toBe(false);
  jest.advanceTimersByTime(3000); await flush();
  expect(admission).toHaveBeenCalledTimes(2);
  const next = Socket.instances[1]; next.open(); next.receive(snapshot({ connectionGeneration: "new" }));
  expect(connection.ready()).toBe(true);
});

test.each(["INVALID_MOVEMENT", "ACCESS_EXPIRED"])("%s close automatically requests fresh admission", async (reason) => {
  const { socket, admission } = await setup();
  socket.close(4001, reason);
  jest.advanceTimersByTime(500); await flush();
  expect(admission).toHaveBeenCalledTimes(2);
});

test("temporary 503 during recovery retries but permission loss stops", async () => {
  const { socket, admission, store } = await setup();
  admission.mockRejectedValueOnce({ status: 503, code: "REALTIME_UNAVAILABLE" });
  socket.close(); jest.advanceTimersByTime(500); await flush();
  expect(store.getStatus().status).toBe("reconnecting");
  jest.advanceTimersByTime(1000); await flush();
  expect(admission).toHaveBeenCalledTimes(3);
  admission.mockRejectedValue({ status: 403, code: "ACCESS_DENIED" });
  Socket.instances[1].close(); jest.advanceTimersByTime(2000); await flush();
  expect(store.getStatus().status).toBe("error");
  jest.advanceTimersByTime(60000); await flush();
  expect(admission).toHaveBeenCalledTimes(4);
});

test("disabled realtime does not retry a 503 indefinitely", async () => {
  const { socket, admission, store } = await setup();
  admission.mockRejectedValue({ status: 503, code: "REALTIME_DISABLED" });
  socket.close(); jest.advanceTimersByTime(500); await flush();
  jest.advanceTimersByTime(60000); await flush();
  expect(admission).toHaveBeenCalledTimes(2);
  expect(store.getStatus().error.code).toBe("REALTIME_DISABLED");
});

test("a closed socket cannot apply late state while waiting for retry", async () => {
  const { socket, store } = await setup();
  socket.close(); socket.receive(snapshot({ frameSeq: 100 }));
  expect(store.getStatus().status).toBe("reconnecting");
  expect(store.getState().frameSeq).toBe(1);
});
