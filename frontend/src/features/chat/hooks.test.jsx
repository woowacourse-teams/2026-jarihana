import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Client } from "@stomp/stompjs";
import { useChat } from "./hooks";
import { catchUp, fetchAllRooms, fetchMessages, markRead, postMessage } from "./api";
import { getMe } from "../auth";

jest.mock("@stomp/stompjs", () => ({ Client: jest.fn() }));
jest.mock("./api", () => ({ catchUp: jest.fn(), fetchAllRooms: jest.fn(), fetchMessages: jest.fn(), markRead: jest.fn(), postMessage: jest.fn() }));
jest.mock("../auth", () => ({ useAuth: () => ({ member: { id: 2, crewName: "크루" }, sessionVersion: 1, reload: mockReload }), getMe: jest.fn() }));
const mockReload = jest.fn();
const saved = (sequence, extra = {}) => ({ id: sequence, sequence, groupId: "1", senderId: "2", author: "크루", content: "안녕", clientMessageId: `key-${sequence}`, createdAt: "2026-10-25T12:00:00", ...extra });
let config, receive, socket, queryClient;
const key = ["chat", "2", 1, "messages", "1"];
beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  socket = { activate: jest.fn(), deactivate: jest.fn().mockResolvedValue(), subscribe: jest.fn((_path, listener) => { receive = listener; }) };
  Client.mockImplementation((options) => { config = options; return socket; });
  getMe.mockResolvedValue({ signupCompleted: true, member: { id: 2 } });
  fetchAllRooms.mockResolvedValue([{ groupId: "1", latestSequence: "10", lastReadSequence: "0", unreadCount: 2, updatedAt: "2026-10-25T12:00:00" }]);
  fetchMessages.mockResolvedValue({ items: [saved("10")], latestSequence: "10", lastReadSequence: "0", hasNext: false, nextCursor: null, status: "ACTIVE" });
  catchUp.mockImplementation(async (_room, cursor) => cursor);
});
function setup() {
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(({ roomId }) => useChat(roomId), { wrapper, initialProps: { roomId: "1" } });
}

test("inbox without a selected room has no history loading state", () => {
  const hook = setup();
  hook.rerender({ roomId: undefined });
  expect(hook.result.current.loadingHistory).toBe(false);
  hook.unmount();
});

test("subscription event before initial snapshot is recovered after that snapshot", async () => {
  let resolveInitial;
  fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }));
  catchUp.mockImplementation(async (_room, cursor, onPage) => {
    expect(cursor).toBe("10");
    onPage({ items: [saved("11")], latestSequence: "11", lastReadSequence: "0", status: "ACTIVE" });
    return "11";
  });
  const hook = setup();
  await waitFor(() => expect(fetchMessages).toHaveBeenCalled());
  await act(async () => {
    config.onConnect();
    receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("11") }) });
    resolveInitial({ items: [saved("10")], latestSequence: "10", lastReadSequence: "0", hasNext: false, nextCursor: null, status: "ACTIVE" });
  });
  await waitFor(() => expect(queryClient.getQueryData(key)?.syncCursor).toBe("11"));
  expect(queryClient.getQueryData(key).items.map((item) => item.id)).toEqual(["10", "11"]);
  hook.unmount();
});

test("HTTP session check gates handshake and missing member reloads auth", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { await config.beforeConnect(); });
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(socket.connectHeaders).toEqual({ "X-XSRF-TOKEN": "" });
  getMe.mockResolvedValueOnce({ signupCompleted: false, member: null });
  await act(async () => { await config.beforeConnect(); });
  expect(socket.deactivate).toHaveBeenCalled();
  expect(mockReload).toHaveBeenCalledTimes(1);
  hook.unmount();
});

test("late room snapshot cannot resurrect a removed room", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalledTimes(1));
  let resolveRooms;
  fetchAllRooms.mockImplementationOnce(() => new Promise((resolve) => { resolveRooms = resolve; }));
  await act(async () => { hook.result.current.sync(); });
  await act(async () => {
    receive({ body: JSON.stringify({ version: 1, type: "ROOM_REMOVED", groupId: "1" }) });
    resolveRooms([{ groupId: "1", latestSequence: "10", lastReadSequence: "0", unreadCount: 2, updatedAt: "2026-10-25T12:00:00" }]);
  });
  expect(queryClient.getQueryData(["chat", "2", 1, "rooms"])).toEqual([]);
  hook.unmount();
});

test("event does not advance recovery cursor and subscription triggers repair", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data?.syncCursor).toBe("10"));
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalled());
  await act(async () => { receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("15") }) }); });
  expect(queryClient.getQueryData(key).items.map((item) => item.sequence)).toEqual(["10", "15"]);
  expect(queryClient.getQueryData(key).syncCursor).toBe("10");
  expect(catchUp.mock.calls.at(-1)[1]).toBe("10");
  hook.unmount();
});

test("failed send retries the exact original body and idempotency key", async () => {
  postMessage.mockRejectedValueOnce(new Error("lost response")).mockImplementation(async (_room, payload) => saved("11", payload));
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { await hook.result.current.send(" 원문\n"); });
  const failed = queryClient.getQueryData(key).items.find((item) => item.failed);
  expect(failed.content).toBe(" 원문\n");
  await act(async () => { await hook.result.current.send(failed.content, failed); });
  expect(postMessage.mock.calls[0].slice(0, 2)).toEqual(postMessage.mock.calls[1].slice(0, 2));
  expect(queryClient.getQueryData(key).items.filter((item) => item.clientMessageId === failed.clientMessageId)).toHaveLength(1);
  hook.unmount();
});

test("contiguous message and private read events update caches without REST per message", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalledTimes(1));
  const listCalls = fetchAllRooms.mock.calls.length;
  await act(async () => {
    const event = { body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("11", { senderId: "3" }) }) };
    receive(event);
    receive(event);
  });
  expect(queryClient.getQueryData(key).syncCursor).toBe("11");
  expect(queryClient.getQueryData(["chat", "2", 1, "rooms"])[0].unreadCount).toBe(3);
  expect(fetchAllRooms).toHaveBeenCalledTimes(listCalls);
  expect(catchUp).toHaveBeenCalledTimes(1);
  await act(async () => {
    receive({ body: JSON.stringify({ version: 1, type: "READ_STATE_UPDATED", groupId: "1", lastReadSequence: "11", latestSequence: "11", unreadCount: 0 }) });
    receive({ body: JSON.stringify({ version: 1, type: "READ_STATE_UPDATED", groupId: "1", lastReadSequence: "9", latestSequence: "10", unreadCount: 2 }) });
  });
  expect(queryClient.getQueryData(key).lastReadSequence).toBe("11");
  expect(queryClient.getQueryData(["chat", "2", 1, "rooms"])[0].unreadCount).toBe(0);
  expect(fetchAllRooms).toHaveBeenCalledTimes(listCalls);
  hook.unmount();
});

test("a socket-confirmed message survives a later failed HTTP response", async () => {
  let rejectSend;
  postMessage.mockImplementation(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  let sending;
  await act(async () => { sending = hook.result.current.send("안녕"); });
  const payload = postMessage.mock.calls[0][1];
  await act(async () => {
    receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("11", payload) }) });
    rejectSend(new Error("response lost"));
    await sending;
  });
  const confirmed = queryClient.getQueryData(key).items.find((item) => item.clientMessageId === payload.clientMessageId);
  expect(confirmed.id).toBe("11");
  expect(confirmed.failed).toBeUndefined();
  expect(hook.result.current.actionError).toBeNull();
  hook.unmount();
});

test("background and unrecovered messages cannot mark read; teardown removes cache and aborts requests", async () => {
  const focus = jest.spyOn(document, "hasFocus").mockReturnValue(false);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { await hook.result.current.read("10"); });
  focus.mockReturnValue(true);
  await act(async () => { await hook.result.current.read("15"); });
  expect(markRead).not.toHaveBeenCalled();
  markRead.mockResolvedValue({ groupId: "1", lastReadSequence: "10", latestSequence: "10", unreadCount: 0 });
  await act(async () => { await hook.result.current.read("10"); });
  expect(markRead).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(markRead.mock.calls[0][2].aborted).toBe(true);
  expect(socket.deactivate).toHaveBeenCalled();
  focus.mockRestore();
});

test("room change releases aborted history loading and old completion cannot clear the new request", async () => {
  const page = { items: [saved("10")], latestSequence: "10", lastReadSequence: "0", hasNext: true, nextCursor: "10", status: "ACTIVE" };
  fetchMessages.mockResolvedValue(page);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  let finishFirst, finishSecond, first, second;
  fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  await act(async () => { first = hook.result.current.loadOlder(); });
  expect(hook.result.current.loadingHistory).toBe(true);
  hook.rerender({ roomId: "2" });
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  expect(hook.result.current.loadingHistory).toBe(false);
  fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));
  await act(async () => { second = hook.result.current.loadOlder(); });
  expect(hook.result.current.loadingHistory).toBe(true);
  await act(async () => { finishFirst(page); await first; });
  expect(hook.result.current.loadingHistory).toBe(true);
  await act(async () => { finishSecond({ ...page, hasNext: false }); await second; });
  expect(hook.result.current.loadingHistory).toBe(false);
  expect(hook.result.current.history.data.hasNext).toBe(false);
  hook.unmount();
});

test.each(["event", "response"])("delayed read %s preserves newer message count and requests reconciliation", async (transport) => {
  const focus = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalledTimes(1));
  let resolveRead, reading;
  if (transport === "response") {
    markRead.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    await act(async () => { reading = hook.result.current.read("10"); });
  }
  await act(async () => { receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("11", { senderId: "3" }) }) }); });
  const calls = fetchAllRooms.mock.calls.length;
  fetchAllRooms.mockImplementation(() => new Promise(() => {}));
  const state = { groupId: "1", lastReadSequence: "10", latestSequence: "10", unreadCount: 0 };
  await act(async () => {
    if (transport === "response") { resolveRead(state); await reading; }
    else receive({ body: JSON.stringify({ ...state, version: 1, type: "READ_STATE_UPDATED" }) });
  });
  expect(queryClient.getQueryData(["chat", "2", 1, "rooms"])[0]).toMatchObject({ latestSequence: "11", unreadThrough: "11", unreadCount: 3, lastReadSequence: "10" });
  expect(fetchAllRooms.mock.calls.length).toBeGreaterThan(calls);
  hook.unmount();
  focus.mockRestore();
});

test.each(["socket", "recovery"])("HTTP failure followed by %s confirmation clears only that message failure", async (transport) => {
  postMessage.mockRejectedValue(new Error("response lost"));
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalled());
  await act(async () => { await hook.result.current.send("첫 번째"); });
  await act(async () => { await hook.result.current.send("두 번째"); });
  const first = postMessage.mock.calls[0][1];
  const second = postMessage.mock.calls[1][1];
  expect(queryClient.getQueryData(key).items.filter((item) => item.failed)).toHaveLength(2);
  expect(hook.result.current.actionError).toBeNull();

  const confirmed = saved("11", first);
  if (transport === "socket") {
    await act(async () => {
      receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: confirmed }) });
    });
  } else {
    catchUp.mockImplementationOnce(async (_room, _cursor, onPage) => {
      onPage({ items: [confirmed], latestSequence: "11", lastReadSequence: "0", status: "ACTIVE" });
      return "11";
    });
    await act(async () => { await hook.result.current.sync(); });
  }
  const items = queryClient.getQueryData(key).items;
  expect(items.find((item) => item.clientMessageId === first.clientMessageId)).toEqual(confirmed);
  expect(items.find((item) => item.clientMessageId === second.clientMessageId).failed).toBe(true);
  expect(hook.result.current.actionError).toBeNull();
  hook.unmount();
});

test("history loading errors remain visible when a message is confirmed", async () => {
  fetchMessages.mockResolvedValue({ items: [saved("10")], latestSequence: "10", lastReadSequence: "0", hasNext: true, nextCursor: "10", status: "ACTIVE" });
  const hook = setup();
  await waitFor(() => expect(hook.result.current.history.data).toBeDefined());
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(catchUp).toHaveBeenCalled());
  fetchMessages.mockRejectedValueOnce(new Error("history unavailable"));
  await act(async () => { await hook.result.current.loadOlder(); });
  const error = hook.result.current.actionError;
  expect(error).toBe("이전 대화를 불러오지 못했어요. 다시 시도해 주세요.");
  await act(async () => {
    receive({ body: JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "1", message: saved("11") }) });
  });
  expect(hook.result.current.actionError).toBe(error);
  hook.unmount();
});
