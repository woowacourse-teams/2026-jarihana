import { act, renderHook, waitFor } from "@testing-library/react";
import { useGomokuRoom } from "./useGomokuRoom";
import { gomokuApi } from "./api";
import { getMe } from "../auth/api";
jest.mock("../auth", () => ({
  useAuth: () => ({ member: { id: 10 }, status: "authenticated", sessionVersion: 1 })
}));
jest.mock("../auth/api", () => ({ getMe: jest.fn() }));
jest.mock("./api", () => {
  const actual = jest.requireActual("./api");
  return { ...actual, gomokuApi: { room: jest.fn() } };
});
const room = {
  id: 1,
  hostMemberId: 10,
  hostName: "호스트",
  guestMemberId: 20,
  guestName: "친구",
  visibility: "PUBLIC",
  rule: "RENJU",
  status: "PLAYING",
  hostReady: false,
  guestReady: false,
  gameNumber: 1,
  blackMemberId: 10,
  board: "0".repeat(225),
  ply: 0,
  lastX: null,
  lastY: null,
  winnerMemberId: null,
  endReason: null,
  revision: 2,
  serverNow: 1000,
  turnDeadline: 61000
};
let streams;
beforeEach(() => {
  streams = [];
  getMe.mockResolvedValue({ member: { id: 10 } });
  gomokuApi.room.mockResolvedValue(room);
  global.EventSource = class {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.close = jest.fn();
      streams.push(this);
    }
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    }
  };
});
afterEach(() => {
  jest.useRealTimers();
  delete global.EventSource;
  jest.clearAllMocks();
});
function send(data) {
  act(() => streams[0].listeners.snapshot({ data: JSON.stringify(data) }));
}
test("auth check precedes SSE, first snapshot unlocks, stale events are rejected, unmount closes", async () => {
  const { result, unmount } = renderHook(() => useGomokuRoom("1"));
  await waitFor(() => expect(streams).toHaveLength(1));
  expect(getMe).toHaveBeenCalled();
  expect(result.current.connected).toBe(false);
  send({ ...room, revision: 4, ply: 2 });
  expect(result.current.connected).toBe(true);
  send({ ...room, revision: 3, ply: 1 });
  expect(result.current.room.ply).toBe(2);
  unmount();
  expect(streams[0].close).toHaveBeenCalled();
});
test("room actions freeze disconnected and pending, then refresh snapshot after success", async () => {
  const { result } = renderHook(() => useGomokuRoom("1"));
  await waitFor(() => expect(streams).toHaveLength(1));
  const request = jest.fn();
  await act(async () => {
    expect(await result.current.act(request)).toBe(false);
  });
  expect(request).not.toHaveBeenCalled();
  send(room);
  let resolveRequest;
  request.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
  );
  let pending;
  act(() => {
    pending = result.current.act(request);
  });
  expect(result.current.pending).toBe(true);
  await act(async () => {
    expect(await result.current.act(request)).toBe(false);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveRequest();
    await pending;
  });
  expect(result.current.pending).toBe(false);
  expect(gomokuApi.room).toHaveBeenCalledTimes(2);
  act(() => streams[0].onerror());
  expect(result.current.connected).toBe(false);
  expect(streams[0].close).toHaveBeenCalled();
});

test("closed snapshot closes SSE and disables actions", async () => {
  const { result } = renderHook(() => useGomokuRoom("1"));
  await waitFor(() => expect(streams).toHaveLength(1));
  send(room);
  send({ ...room, status: "CLOSED", revision: 3 });
  expect(result.current.room.status).toBe("CLOSED");
  expect(result.current.connected).toBe(false);
  expect(streams[0].close).toHaveBeenCalled();
  const request = jest.fn();
  await act(async () => {
    expect(await result.current.act(request)).toBe(false);
  });
  expect(request).not.toHaveBeenCalled();
});

test("forbidden moves explain Renju restrictions and preserve the board", async () => {
  const { result } = renderHook(() => useGomokuRoom("1"));
  await waitFor(() => expect(streams).toHaveLength(1));
  send(room);
  await act(async () => {
    await result.current.act(() => Promise.reject({ code: "GOMOKU_FORBIDDEN_MOVE", status: 422 }));
  });
  expect(result.current.error).toContain("쌍3, 쌍4, 장목");
  expect(result.current.room.ply).toBe(0);
});


test("transient disconnects stay quiet and a successful snapshot resets failures", async () => {
  jest.useFakeTimers();
  const { result, unmount } = renderHook(() => useGomokuRoom("1"));
  await act(async () => {});
  send(room);
  const oldSource = streams[0];
  act(() => oldSource.onerror());
  expect(result.current.connected).toBe(false);
  expect(result.current.error).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  expect(streams).toHaveLength(2);
  act(() => streams[1].onerror());
  expect(result.current.error).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  act(() => streams[2].listeners.snapshot({ data: JSON.stringify(room) }));
  expect(result.current.connected).toBe(true);
  act(() => oldSource.onerror());
  expect(result.current.connected).toBe(true);
  act(() => streams[2].onerror());
  expect(result.current.error).toBeNull();
  unmount();
  await act(async () => jest.advanceTimersByTimeAsync(10000));
  expect(streams).toHaveLength(3);
});

test("three consecutive failures show a notice until an SSE snapshot restores the connection", async () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useGomokuRoom("1"));
  await act(async () => {});
  send(room);
  act(() => streams[0].onerror());
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  act(() => streams[1].onerror());
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  act(() => streams[2].onerror());
  expect(result.current.error).toContain("연결을 복구하지 못하고 있어요");
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  expect(result.current.error).toContain("연결을 복구하지 못하고 있어요");
  expect(result.current.connected).toBe(false);
  act(() => streams[3].listeners.snapshot({ data: JSON.stringify(room) }));
  expect(result.current.error).toBeNull();
  expect(result.current.connected).toBe(true);
});

test("HTTP reconnect failures count toward the notice and forbidden access reports immediately", async () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useGomokuRoom("1"));
  await act(async () => {});
  send(room);
  gomokuApi.room.mockRejectedValueOnce({ status: 503 }).mockRejectedValueOnce({ status: 503 });
  act(() => streams[0].onerror());
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  expect(result.current.error).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(3000));
  expect(result.current.error).toContain("방에 계속 연결하지 못하고 있어요");
  gomokuApi.room.mockRejectedValueOnce({ status: 403 });
  await act(async () => jest.advanceTimersByTimeAsync(3000));
  expect(result.current.error).toContain("참여 중인 방이 아니거나 종료된 방");
  const count = gomokuApi.room.mock.calls.length;
  await act(async () => jest.advanceTimersByTimeAsync(10000));
  expect(gomokuApi.room).toHaveBeenCalledTimes(count);
});
