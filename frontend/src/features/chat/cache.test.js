import { QueryClient } from "@tanstack/react-query";
import { applyChatMessage, applyChatReadState, mergeRoomSnapshot } from "./cache";

test("late list snapshot preserves newer message, read state, and closure", () => {
  const old = { groupId: "1", latestSequence: "3", lastReadSequence: "1", unreadCount: 2, updatedAt: "2026-10-25T12:00:00", status: "ACTIVE" };
  const newer = { ...old, latestSequence: "5", lastReadSequence: "5", unreadCount: 0, updatedAt: "2026-10-25T13:00:00", status: "ENDED", lastMessage: { id: "5" } };
  expect(mergeRoomSnapshot([old], [newer])[0]).toEqual({ ...newer, unreadThrough: "5" });
});

test.each(["4", "5"])("stale count watermark cannot overwrite messages when read cursor is %s", (lastReadSequence) => {
  const client = new QueryClient();
  const scope = ["chat", "2", 1];
  const roomsKey = [...scope, "rooms"];
  client.setQueryData(roomsKey, [{ groupId: "1", latestSequence: "5", lastReadSequence: "4", unreadCount: 1, updatedAt: "2026-10-25T12:00:00" }]);
  applyChatMessage(client, scope, { id: "6", sequence: "6", groupId: "1", senderId: "3", createdAt: "2026-10-25T13:00:00" }, "2");
  expect(applyChatReadState(client, scope, { groupId: "1", lastReadSequence, latestSequence: "5", unreadCount: 0 })).toBe(lastReadSequence === "5");
  expect(client.getQueryData(roomsKey)[0]).toMatchObject({ latestSequence: "6", unreadThrough: "6", lastReadSequence, unreadCount: 2 });
});

test("read count covering a future message prevents duplicate increment without moving message cursor", () => {
  const client = new QueryClient();
  const scope = ["chat", "2", 1];
  const roomsKey = [...scope, "rooms"];
  client.setQueryData(roomsKey, [{ groupId: "1", latestSequence: "5", lastReadSequence: "4", unreadCount: 1, updatedAt: "2026-10-25T12:00:00" }]);
  applyChatReadState(client, scope, { groupId: "1", lastReadSequence: "5", latestSequence: "6", unreadCount: 1 });
  expect(client.getQueryData(roomsKey)[0]).toMatchObject({ latestSequence: "5", unreadThrough: "6", unreadCount: 1 });
  applyChatMessage(client, scope, { id: "6", sequence: "6", groupId: "1", senderId: "3", createdAt: "2026-10-25T13:00:00" }, "2");
  expect(client.getQueryData(roomsKey)[0]).toMatchObject({ latestSequence: "6", unreadThrough: "6", unreadCount: 1 });
  const stale = { groupId: "1", latestSequence: "5", lastReadSequence: "5", unreadCount: 0, updatedAt: "2026-10-25T12:00:00" };
  expect(mergeRoomSnapshot([stale], client.getQueryData(roomsKey))[0].unreadCount).toBe(1);
});

test("sequence 5 arriving before 4 requests recovery without jumping cursor", () => {
  const client = new QueryClient();
  const scope = ["chat", "2", 1];
  client.setQueryData([...scope, "messages", "1"], { items: [], syncCursor: "3", latestSequence: "3" });
  client.setQueryData([...scope, "rooms"], [{ groupId: "1", latestSequence: "3", lastReadSequence: "3", unreadCount: 0, updatedAt: "2026-10-25T12:00:00" }]);
  const message = (sequence) => ({ id: sequence, sequence, clientMessageId: sequence, senderId: "3", groupId: "1", createdAt: "2026-10-25T13:00:00" });
  expect(applyChatMessage(client, scope, message("5"), "2")).toBe(true);
  expect(client.getQueryData([...scope, "messages", "1"]).syncCursor).toBe("3");
  expect(applyChatMessage(client, scope, message("4"), "2")).toBe(false);
  expect(client.getQueryData([...scope, "messages", "1"]).syncCursor).toBe("4");
  expect(client.getQueryData([...scope, "messages", "1"]).items.map((item) => item.sequence)).toEqual(["4", "5"]);
});

test("unopened room sequence gap also requests unread reconciliation", () => {
  const client = new QueryClient();
  const scope = ["chat", "2", 1];
  client.setQueryData([...scope, "rooms"], [{ groupId: "1", latestSequence: "3", lastReadSequence: "3", unreadCount: 0, updatedAt: "2026-10-25T12:00:00" }]);
  expect(applyChatMessage(client, scope, { id: "5", sequence: "5", groupId: "1", senderId: "3", createdAt: "2026-10-25T13:00:00" }, "2")).toBe(true);
});

test("room snapshots and new messages share latest activity and large ID tie ordering", () => {
  const room = (groupId, updatedAt) => ({ groupId, updatedAt, latestSequence: "0", lastReadSequence: "0", unreadCount: 0 });
  const older = room("1", "2026-10-25T11:00:00");
  const smaller = room("9007199254740992", "2026-10-25T12:00:00");
  const larger = room("9007199254740993", "2026-10-25T12:00:00");
  const rooms = [older, smaller, larger];
  expect(mergeRoomSnapshot(rooms).map((item) => item.groupId)).toEqual([larger.groupId, smaller.groupId, older.groupId]);
  const client = new QueryClient();
  const scope = ["chat", "2", 1];
  const roomsKey = [...scope, "rooms"];
  client.setQueryData(roomsKey, rooms);
  applyChatMessage(client, scope, { id: "1", sequence: "1", groupId: "1", senderId: "2", createdAt: "2026-10-25T13:00:00" }, "2");
  expect(client.getQueryData(roomsKey).map((item) => item.groupId)).toEqual([older.groupId, larger.groupId, smaller.groupId]);
  expect(client.getQueryData(roomsKey)[0].unreadCount).toBe(0);
});
