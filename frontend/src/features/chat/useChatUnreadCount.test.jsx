import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Client } from "@stomp/stompjs";
import { useAuth, getMe } from "../auth";
import { fetchAllRooms, fetchMessages, catchUp } from "./api";
import { ChatSessionProvider, useChatSession } from "./ChatSessionProvider";
import { useChatUnreadCount } from "./useChatUnreadCount";

jest.mock("../auth", () => ({ useAuth: jest.fn(), getMe: jest.fn() }));
jest.mock("@stomp/stompjs", () => ({ Client: jest.fn() }));
jest.mock("./api", () => ({ fetchAllRooms: jest.fn(), fetchMessages: jest.fn(), catchUp: jest.fn() }));
const room = (groupId, unreadCount) => ({ groupId, unreadCount, latestSequence: "10", lastReadSequence: "0", updatedAt: "2026-10-27T12:00:00" });
let client, socket, config, receive;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 2 }, sessionVersion: 1 });
  getMe.mockResolvedValue({ signupCompleted: true, member: { id: 2 } });
  fetchAllRooms.mockResolvedValue([room("1", 2), room("2", 3)]);
  fetchMessages.mockResolvedValue({ items: [], latestSequence: "10", syncCursor: "10", lastReadSequence: "0" });
  catchUp.mockImplementation(async (_room, cursor) => cursor);
  socket = { activate: jest.fn(), deactivate: jest.fn().mockResolvedValue(), subscribe: jest.fn((_path, handler) => { receive = handler; }) };
  Client.mockImplementation((options) => { config = options; return socket; });
});
function setup() {
  return renderHook(() => ({ count: useChatUnreadCount(), session: useChatSession() }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}><ChatSessionProvider>{children}</ChatSessionProvider></QueryClientProvider>
  });
}
const receivedMessage = { version: 1, type: "MESSAGE_CREATED", groupId: "1", message: {
  id: "11", groupId: "1", sequence: "11", senderId: "3", author: "하나", clientMessageId: "new", content: "새 메시지", createdAt: "2026-10-27T12:01:00"
} };

test("모달이 닫혀 있어도 수신과 읽음 이벤트를 즉시 반영하고 중복 이벤트는 합산하지 않는다", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.count).toBe(5));
  await act(async () => { config.onConnect(); });
  await waitFor(() => expect(fetchAllRooms).toHaveBeenCalledTimes(2));
  act(() => {
    receive({ body: JSON.stringify(receivedMessage) });
    receive({ body: JSON.stringify(receivedMessage) });
  });
  await waitFor(() => expect(hook.result.current.count).toBe(6));
  expect(fetchAllRooms).toHaveBeenCalledTimes(2);
  act(() => receive({ body: JSON.stringify({ version: 1, type: "READ_STATE_UPDATED", groupId: "1", lastReadSequence: "11", latestSequence: "11", unreadCount: 0 }) }));
  await waitFor(() => expect(hook.result.current.count).toBe(3));
  hook.unmount();
});

test("최신 대화를 보고 있는 방의 배지는 깜빡이지 않으며 닫아도 연결은 유지한다", async () => {
  const hook = setup();
  act(() => hook.result.current.session.selectRoom("1"));
  await waitFor(() => expect(hook.result.current.count).toBe(5));
  act(() => hook.result.current.session.onViewingLatestChange("1", true));
  expect(hook.result.current.count).toBe(3);
  await act(async () => { config.onConnect(); });
  act(() => receive({ body: JSON.stringify(receivedMessage) }));
  await waitFor(() => expect(hook.result.current.session.chat.rooms.data[0].unreadCount).toBe(3));
  expect(hook.result.current.count).toBe(3);
  act(() => hook.result.current.session.onViewingLatestChange("1", false));
  expect(hook.result.current.count).toBe(6);
  act(() => hook.result.current.session.selectRoom(undefined));
  expect(Client).toHaveBeenCalledTimes(1);
  expect(socket.deactivate).not.toHaveBeenCalled();
  hook.unmount();
  expect(socket.deactivate).toHaveBeenCalledTimes(1);
});

test("로그아웃 시 연결과 캐시를 정리하고 새 계정에는 이전 이벤트가 반영되지 않는다", async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.count).toBe(5));
  await act(async () => { config.onConnect(); });
  const oldReceive = receive;
  useAuth.mockReturnValue({ status: "anonymous", member: null, sessionVersion: 2 });
  hook.rerender();
  expect(hook.result.current.count).toBe(0);
  expect(socket.deactivate).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(["chat", "2", 1, "rooms"])).toBeUndefined();
  fetchAllRooms.mockResolvedValue([]);
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 3 }, sessionVersion: 3 });
  hook.rerender();
  act(() => oldReceive({ body: JSON.stringify(receivedMessage) }));
  expect(hook.result.current.count).toBe(0);
  await waitFor(() => expect(hook.result.current.session.chat.rooms.data).toEqual([]));
  expect(Client).toHaveBeenCalledTimes(2);
  hook.unmount();
});
