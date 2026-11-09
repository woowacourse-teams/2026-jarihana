import { act, renderHook, waitFor } from "@testing-library/react";
import { useGomokuChat } from "./useGomokuChat";
import { gomokuChatApi } from "./chatApi";

let mockAuth;
jest.mock("../auth", () => ({ useAuth: () => mockAuth }));
jest.mock("./chatApi", () => ({
  ...jest.requireActual("./chatApi"),
  gomokuChatApi: { history: jest.fn(), send: jest.fn() }
}));
const participationId = "11111111-1111-4111-8111-111111111111";
const message = (seq, key = `key-${seq}`) => ({
  id: String(seq),
  sequence: String(seq),
  senderId: "2",
  author: "상대",
  content: `대화 ${seq}`,
  clientMessageId: key,
  createdAt: "2026-11-05T12:00:00"
});
const page = (items = [], latest = "0", rest = {}) => ({
  participationId,
  items,
  latestSequence: latest,
  hasNext: false,
  nextCursor: null,
  ...rest
});
const initial = { connected: true, closed: false, chatSignal: null };
beforeEach(() => {
  mockAuth = { member: { id: 1 }, status: "authenticated", sessionVersion: 1 };
  gomokuChatApi.history.mockReset().mockResolvedValue(page());
  gomokuChatApi.send.mockReset();
});

test("coalesces SSE signals and recovers every catch-up page without skipping a gap", async () => {
  gomokuChatApi.history.mockResolvedValueOnce(page([message(50)], "50"));
  const { result, rerender } = renderHook((props) => useGomokuChat("1", props), {
    initialProps: initial
  });
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  gomokuChatApi.history
    .mockResolvedValueOnce(
      page([message(51), message(52)], "53", { hasNext: true, nextCursor: "52" })
    )
    .mockResolvedValueOnce(page([message(53)], "53"));
  rerender({ ...initial, chatSignal: { participationId, latestSequence: "53" } });
  await waitFor(() => expect(result.current.messages).toHaveLength(4));
  expect(gomokuChatApi.history.mock.calls[1][1]).toMatchObject({ afterSequence: "50" });
  expect(gomokuChatApi.history.mock.calls[2][1]).toMatchObject({ afterSequence: "52" });
});

test("a lost POST response is confirmed by recovery and removes its failed optimistic message", async () => {
  const { result } = renderHook(() => useGomokuChat("1", initial));
  await waitFor(() => expect(result.current.enabled).toBe(true));
  gomokuChatApi.send.mockImplementation(async (room, body) => {
    gomokuChatApi.history.mockResolvedValue(
      page([{ ...message(1, body.clientMessageId), senderId: "1", content: body.content }], "1")
    );
    throw new Error("Response lost");
  });
  act(() => expect(result.current.send("  원문  ")).toBe(true));
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  expect(result.current.pending).toHaveLength(0);
  expect(result.current.messages[0].content).toBe("  원문  ");
});

test("retry keeps UUID and original body, late successful recovery wins over a POST failure", async () => {
  const { result, rerender } = renderHook((props) => useGomokuChat("1", props), {
    initialProps: initial
  });
  await waitFor(() => expect(result.current.enabled).toBe(true));
  gomokuChatApi.send.mockRejectedValueOnce(new Error("offline"));
  act(() => result.current.send("줄바꿈\n유지"));
  await waitFor(() => expect(result.current.pending[0]?.failed).toBe(true));
  const body = gomokuChatApi.send.mock.calls[0][1];
  let reject;
  gomokuChatApi.send.mockImplementationOnce(
    () =>
      new Promise((resolve, fail) => {
        reject = fail;
      })
  );
  act(() => result.current.retry(result.current.pending[0]));
  expect(gomokuChatApi.send.mock.calls[1][1]).toEqual(body);
  gomokuChatApi.history.mockResolvedValue(
    page([{ ...message(1, body.clientMessageId), senderId: "1" }], "1")
  );
  rerender({ ...initial, chatSignal: { participationId, latestSequence: "1" } });
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  await act(async () => reject(new Error("late failure")));
  expect(result.current.pending).toHaveLength(0);
});

test("closed room aborts requests while retaining confirmed messages, account change clears them", async () => {
  gomokuChatApi.history.mockResolvedValue(page([message(1)], "1"));
  const { result, rerender } = renderHook((props) => useGomokuChat("1", props), {
    initialProps: initial
  });
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  const signal = gomokuChatApi.history.mock.calls[0][2];
  rerender({ ...initial, closed: true, connected: false });
  expect(signal.aborted).toBe(true);
  expect(result.current.messages).toHaveLength(1);
  expect(result.current.send("종료 뒤")).toBe(false);
  mockAuth = { ...mockAuth, member: { id: 3 }, sessionVersion: 2 };
  rerender({ ...initial, connected: false, closed: true });
  expect(result.current.messages).toHaveLength(0);
});

test("leaving the screen aborts requests and rejects a stale history response", async () => {
  let resolve;
  gomokuChatApi.history.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { result, unmount } = renderHook(() => useGomokuChat("1", initial));
  const signal = gomokuChatApi.history.mock.calls[0][2];
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(page([message(1)], "1")));
  expect(result.current.messages).toHaveLength(0);
});

test("disabled chat stays hidden and does not keep retrying on online events", async () => {
  gomokuChatApi.history.mockRejectedValue({ status: 404, code: "GOMOKU_CHAT_DISABLED" });
  const { result } = renderHook(() => useGomokuChat("1", initial));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => window.dispatchEvent(new Event("online")));
  expect(result.current.enabled).toBe(false);
  expect(gomokuChatApi.history).toHaveBeenCalledTimes(1);
});

test("signals received during recovery trigger one more catch-up from the completed cursor", async () => {
  const { result, rerender } = renderHook((props) => useGomokuChat("1", props), {
    initialProps: initial
  });
  await waitFor(() => expect(result.current.enabled).toBe(true));
  let finish;
  gomokuChatApi.history
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce(page([message(2)], "2"));
  rerender({ ...initial, chatSignal: { participationId, latestSequence: "1" } });
  rerender({ ...initial, chatSignal: { participationId, latestSequence: "2" } });
  expect(gomokuChatApi.history).toHaveBeenCalledTimes(2);
  await act(async () => finish(page([message(1)], "1")));
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
  expect(gomokuChatApi.history.mock.calls[2][1].afterSequence).toBe("1");
});

test("closure detected by HTTP before the SSE snapshot retains already received conversation", async () => {
  gomokuChatApi.history.mockResolvedValueOnce(page([message(1)], "1"));
  const { result } = renderHook(() => useGomokuChat("1", initial));
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  gomokuChatApi.history.mockRejectedValue({ status: 403, code: "ACCESS_DENIED" });
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(result.current.ended).toBe(true));
  expect(result.current.messages).toHaveLength(1);
  expect(result.current.send("종료 뒤")).toBe(false);
});
