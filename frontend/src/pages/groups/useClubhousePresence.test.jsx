import { act, renderHook, waitFor } from "@testing-library/react";
import { useChatSession } from "../../features/chat/ChatSessionProvider.jsx";
import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { useClubhousePresence } from "./useClubhousePresence.js";

jest.mock("../../features/chat/ChatSessionProvider.jsx", () => ({ useChatSession: jest.fn() }));
jest.mock("../../features/member/index.js", () => ({ useInfiniteGroupMembers: jest.fn() }));

const group = { id: 1, leader: { memberId: 8 }, status: "ACTIVE" };
const auth = { member: { id: 2 }, status: "authenticated", sessionVersion: 1 };
const message = (sequence, extra = {}) => ({ id: sequence, sequence, groupId: "1", senderId: "3", content: "반가워요", ...extra });
let session;
beforeEach(() => {
  jest.clearAllMocks();
  useInfiniteGroupMembers.mockReturnValue({ data: { pages: [{ items: [{ memberId: 2 }, { memberId: 8 }] }] }, fetchNextPage: jest.fn(), hasNextPage: false });
  session = { activeRoomId: "1", selectBackgroundRoom: jest.fn(), chat: {
    send: jest.fn().mockResolvedValue(message("11")),
    history: { data: { items: [message("10")], latestSequence: "10", status: "ACTIVE" } }
  } };
  useChatSession.mockImplementation(() => session);
});
const setup = () => renderHook(({ listen = true, member = true } = {}) => useClubhousePresence(group, auth, { listen, isMember: member }));

test("all member pages supply unique greeters including the leader", async () => {
  const fetchNextPage = jest.fn();
  useInfiniteGroupMembers.mockReturnValue({ data: { pages: [{ items: [{ memberId: 2 }, { memberId: 8 }] }, { items: [{ memberId: 3 }] }] }, fetchNextPage, hasNextPage: true, isFetchingNextPage: false });
  const hook = setup();
  expect(hook.result.current.greetingMembers).toEqual([8, 2, 3]);
  await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));
});

test("initial history stays silent and only confirmed new messages get eight second bubbles", () => {
  const hook = setup();
  expect(hook.result.current.speechMessages).toEqual([]);
  session.chat.history = { data: { status: "ACTIVE", latestSequence: "11", items: [message("10"), message("11"), message("12", { pending: true }), message("13", { failed: true }), message("14", { groupId: "2" })] } };
  hook.rerender();
  expect(hook.result.current.speechMessages).toEqual([expect.objectContaining({ sequence: "11", memberId: "3" })]);
  const expiry = hook.result.current.speechMessages[0].expiresAt;
  expect(expiry - Date.now()).toBeGreaterThan(7900);
  expect(expiry - Date.now()).toBeLessThanOrEqual(8000);
  session.chat.history = { data: { ...session.chat.history.data, items: [...session.chat.history.data.items] } };
  hook.rerender();
  expect(hook.result.current.speechMessages).toHaveLength(1);
  expect(hook.result.current.speechMessages[0].expiresAt).toBe(expiry);
  hook.rerender({ listen: false });
  expect(hook.result.current.speechMessages).toEqual([]);
});

test("greetings only send on explicit calls to the currently selected authorized room", async () => {
  const hook = setup();
  expect(session.chat.send).not.toHaveBeenCalled();
  await act(async () => expect(await hook.result.current.greet()).toBe(true));
  expect(session.chat.send).toHaveBeenCalledTimes(1);
  session.activeRoomId = "2";
  hook.rerender();
  expect(hook.result.current.canGreet).toBe(false);
  await act(async () => expect(await hook.result.current.greet()).toBe(false));
  expect(session.chat.send).toHaveBeenCalledTimes(1);
});

test("failed sends report failure and release the greeting lock", async () => {
  session.chat.send.mockResolvedValue(false);
  const hook = setup();
  await act(async () => expect(hook.result.current.greet()).rejects.toThrow("인사를 보내지 못했어요"));
  expect(hook.result.current.greetingBusy).toBe(false);
});

test("visitors do not subscribe or send and immersive departure releases background room", () => {
  const hook = setup();
  expect(session.selectBackgroundRoom).toHaveBeenCalledWith("1");
  hook.rerender({ listen: true, member: false });
  expect(session.selectBackgroundRoom).toHaveBeenLastCalledWith(undefined);
  expect(hook.result.current.canGreet).toBe(false);
  expect(session.chat.send).not.toHaveBeenCalled();
});
