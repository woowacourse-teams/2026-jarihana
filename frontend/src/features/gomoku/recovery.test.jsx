import { act, renderHook } from "@testing-library/react";
import { useGomokuRoom } from "./useGomokuRoom";
import { gomokuApi } from "./api";
import { getMe } from "../auth/api";

jest.mock("../auth", () => ({
  useAuth: () => ({ member: { id: 10 }, status: "authenticated", sessionVersion: 1 })
}));
jest.mock("../auth/api", () => ({ getMe: jest.fn() }));
jest.mock("./api", () => ({ ...jest.requireActual("./api"), gomokuApi: { room: jest.fn() } }));

const room = {
  id: 1, hostMemberId: 10, hostName: "호스트", guestMemberId: 20, guestName: "친구",
  visibility: "PUBLIC", rule: "RENJU", status: "PLAYING", hostReady: false, guestReady: false,
  gameNumber: 1, blackMemberId: 10, board: "0".repeat(225), ply: 0,
  lastX: null, lastY: null, winnerMemberId: null, endReason: null,
  revision: 2, serverNow: 1000, turnDeadline: 61000
};
let streams;
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(1);
  streams = [];
  getMe.mockResolvedValue({ member: { id: 10 } });
  gomokuApi.room.mockResolvedValue(room);
  global.EventSource = class {
    constructor() { this.close = jest.fn(); streams.push(this); }
    addEventListener(name, callback) { this[name] = callback; }
  };
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.resetAllMocks();
  delete global.EventSource;
});
async function open() {
  const hook = renderHook(({ id }) => useGomokuRoom(id), { initialProps: { id: "1" } });
  await act(async () => {});
  act(() => streams[0].snapshot({ data: JSON.stringify(room) }));
  return hook;
}

test("healthy stream reconnects immediately and permits a move just before the deadline", async () => {
  const { result } = await open();
  const old = streams[0];
  await act(async () => old.onerror());
  expect(streams).toHaveLength(2);
  expect(result.current.connected).toBe(true);
  const move = jest.fn().mockResolvedValue({ roomId: 1 });
  await act(async () => expect(await result.current.act(move)).toBe(true));
  expect(move).toHaveBeenCalledTimes(1);
  act(() => old.onerror());
  expect(streams).toHaveLength(2);
  act(() => streams[1].onerror());
  expect(result.current.connected).toBe(false);
});

test("failed recovery backs off to thirty seconds and a snapshot resets the delay", async () => {
  const { result, unmount } = await open();
  await act(async () => streams[0].onerror());
  act(() => streams[1].onerror());
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = streams.length;
    await act(async () => jest.advanceTimersByTimeAsync(delay - 1));
    expect(streams).toHaveLength(count);
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(streams).toHaveLength(count + 1);
    act(() => streams.at(-1).onerror());
  }
  expect(result.current.error).toContain("연결을 복구하지 못하고 있어요");
  await act(async () => jest.advanceTimersByTimeAsync(30000));
  act(() => streams.at(-1).snapshot({ data: JSON.stringify(room) }));
  expect(result.current.error).toBeNull();
  await act(async () => streams.at(-1).onerror());
  expect(result.current.connected).toBe(true);
  act(() => streams.at(-1).onerror());
  const count = streams.length;
  await act(async () => jest.advanceTimersByTimeAsync(1000));
  expect(streams).toHaveLength(count + 1);
  unmount();
  await act(async () => jest.advanceTimersByTimeAsync(60000));
  expect(streams).toHaveLength(count + 1);
});

test("successful command stays successful if refresh fails and only the query is retried", async () => {
  const { result } = await open();
  gomokuApi.room.mockRejectedValueOnce({ status: 503 });
  const command = jest.fn().mockResolvedValue({ roomId: 1 });
  await act(async () => expect(await result.current.act(command)).toBe(true));
  expect(result.current.pending).toBe(false);
  expect(result.current.error).not.toContain("요청을 완료하지 못했어요");
  gomokuApi.room.mockResolvedValue({ ...room, revision: 3, ply: 1 });
  await act(async () => jest.advanceTimersByTimeAsync(1000));
  expect(result.current.room.ply).toBe(1);
  expect(result.current.error).toBeNull();
  expect(command).toHaveBeenCalledTimes(1);
});

test("command result does not wait for a stalled refresh and old refresh cannot cross rooms", async () => {
  const { result, rerender } = await open();
  let rejectOld;
  gomokuApi.room.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  await act(async () => expect(await result.current.act(() => Promise.resolve())).toBe(true));
  expect(result.current.pending).toBe(false);
  gomokuApi.room.mockResolvedValue({ ...room, id: 2 });
  await act(async () => rerender({ id: "2" }));
  await act(async () => rejectOld({ status: 503 }));
  expect(result.current.room.id).toBe(2);
  expect(result.current.error).toBeNull();
});

test("jitter spreads first retries and access denial does not keep retrying", async () => {
  Math.random.mockReturnValue(0);
  const { result } = await open();
  await act(async () => streams[0].onerror());
  act(() => streams[1].onerror());
  await act(async () => jest.advanceTimersByTimeAsync(499));
  expect(streams).toHaveLength(2);
  gomokuApi.room.mockRejectedValueOnce({ status: 403 });
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(result.current.connected).toBe(false);
  expect(result.current.error).toContain("참여 중인 방이 아니거나 종료된 방");
  const count = gomokuApi.room.mock.calls.length;
  await act(async () => jest.advanceTimersByTimeAsync(60000));
  expect(gomokuApi.room).toHaveBeenCalledTimes(count);
});

test("fresh snapshot cancels refresh retries without resending the command", async () => {
  const { result } = await open();
  gomokuApi.room.mockRejectedValueOnce({ status: 503 });
  const command = jest.fn().mockResolvedValue({ roomId: 1 });
  await act(async () => result.current.act(command));
  act(() => streams[0].snapshot({ data: JSON.stringify({ ...room, revision: 3, ply: 1 }) }));
  const count = gomokuApi.room.mock.calls.length;
  await act(async () => jest.advanceTimersByTimeAsync(60000));
  expect(gomokuApi.room).toHaveBeenCalledTimes(count);
  expect(command).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
});
