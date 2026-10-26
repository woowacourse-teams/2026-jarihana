import { apiClient } from "../../shared/api";
import { compareSequence, historySchema, messageSchema, readSchema, roomsSchema } from "../../entities/chat";

export const fetchRooms = (cursor, signal) => apiClient.request("chats", {
  schema: roomsSchema, signal, searchParams: { size: 100, ...(cursor ? { cursor } : {}) }
});
export async function fetchAllRooms(signal) {
  const rooms = new Map();
  const seen = new Set();
  let cursor;
  do {
    const page = await fetchRooms(cursor, signal);
    page.items.forEach((room) => rooms.set(room.groupId, room));
    if (!page.hasNext) return [...rooms.values()];
    if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error("Invalid chat list cursor");
    cursor = page.nextCursor;
    seen.add(cursor);
  } while (!signal?.aborted);
  throw new DOMException("Aborted", "AbortError");
}
export const fetchMessages = (groupId, params = {}, signal) => apiClient.request(`groups/${groupId}/chat/messages`, {
  schema: historySchema, signal, searchParams: { size: 100, ...params }
});
export const postMessage = (groupId, message, signal) => apiClient.request(`groups/${groupId}/chat/messages`, { method: "POST", json: message, schema: messageSchema, signal });
export const markRead = (groupId, lastReadSequence, signal) => apiClient.request(`groups/${groupId}/chat/read`, { method: "PUT", json: { lastReadSequence }, schema: readSchema, signal });

export async function catchUp(groupId, cursor, onPage, signal) {
  let next = cursor;
  while (!signal?.aborted) {
    const page = await fetchMessages(groupId, { afterSequence: next }, signal);
    onPage(page);
    if (!page.hasNext) return page.latestSequence;
    if (!page.nextCursor || compareSequence(page.nextCursor, next) <= 0) throw new Error("Invalid chat recovery cursor");
    next = page.nextCursor;
  }
  throw new DOMException("Aborted", "AbortError");
}
