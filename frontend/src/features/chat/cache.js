import { compareSequence, mergeMessages } from "../../entities/chat";

function compareRoomActivity(a, b) {
  return b.updatedAt.localeCompare(a.updatedAt) || compareSequence(b.groupId, a.groupId);
}

export function mergeRoomSnapshot(snapshot, current = []) {
  return snapshot.map((room) => {
    const existing = current.find((item) => item.groupId === room.groupId);
    if (!existing) return { ...room, unreadThrough: room.latestSequence };
    const newerMessage = compareSequence(existing.latestSequence, room.latestSequence) > 0;
    const newerRead = compareSequence(existing.lastReadSequence, room.lastReadSequence) > 0;
    const unreadThrough = existing.unreadThrough ?? existing.latestSequence;
    const preserveCount = compareSequence(unreadThrough, room.latestSequence) > 0 || newerRead;
    return {
      ...room,
      ...(newerMessage ? { lastMessage: existing.lastMessage, latestSequence: existing.latestSequence, updatedAt: existing.updatedAt } : {}),
      ...(newerRead ? { lastReadSequence: existing.lastReadSequence } : {}),
      unreadCount: preserveCount ? existing.unreadCount : room.unreadCount,
      unreadThrough: preserveCount ? unreadThrough : room.latestSequence,
      status: existing.status === "ENDED" ? "ENDED" : room.status
    };
  }).sort(compareRoomActivity);
}

export function applyChatReadState(client, scope, state) {
  let reconcile = false;
  client.setQueryData([...scope, "messages", state.groupId], (history) => {
    if (!history || compareSequence(state.lastReadSequence, history.lastReadSequence) <= 0) return history;
    return { ...history, lastReadSequence: state.lastReadSequence };
  });
  client.setQueryData([...scope, "rooms"], (rooms) => rooms?.map((room) => {
    if (room.groupId !== state.groupId) return room;
    const unreadThrough = room.unreadThrough ?? room.latestSequence;
    const readOrder = compareSequence(state.lastReadSequence, room.lastReadSequence);
    const countOrder = compareSequence(state.latestSequence, unreadThrough);
    if (readOrder < 0) {
      reconcile = countOrder > 0;
      return room;
    }
    if (countOrder < 0) {
      reconcile = readOrder > 0;
      return { ...room, lastReadSequence: state.lastReadSequence };
    }
    return { ...room, lastReadSequence: state.lastReadSequence, unreadCount: state.unreadCount, unreadThrough: state.latestSequence };
  }));
  return reconcile;
}

export function applyChatMessage(client, scope, message, memberId) {
  const historyKey = [...scope, "messages", message.groupId];
  let gap = false;
  client.setQueryData(historyKey, (old) => {
    if (!old) return old;
    const contiguous = message.sequence === String(BigInt(old.syncCursor) + 1n);
    gap = compareSequence(message.sequence, old.syncCursor) > 0 && !contiguous;
    return {
      ...old, items: mergeMessages(old.items, [message]),
      latestSequence: compareSequence(message.sequence, old.latestSequence) > 0 ? message.sequence : old.latestSequence,
      syncCursor: contiguous ? message.sequence : old.syncCursor
    };
  });
  let missingRoom = false;
  client.setQueryData([...scope, "rooms"], (rooms) => {
    if (!rooms) { missingRoom = true; return rooms; }
    missingRoom = !rooms.some((room) => room.groupId === message.groupId);
    return rooms.map((room) => {
      if (room.groupId !== message.groupId || compareSequence(message.sequence, room.latestSequence) <= 0) return room;
      if (message.sequence !== String(BigInt(room.latestSequence) + 1n)) gap = true;
      const unreadThrough = room.unreadThrough ?? room.latestSequence;
      const beyondCount = compareSequence(message.sequence, unreadThrough) > 0;
      const addsUnread = beyondCount && message.senderId !== memberId &&
        compareSequence(message.sequence, room.lastReadSequence) > 0;
      return {
        ...room,
        lastMessage: message,
        latestSequence: message.sequence,
        updatedAt: message.createdAt,
        unreadThrough: beyondCount ? message.sequence : unreadThrough,
        unreadCount: room.unreadCount + (addsUnread ? 1 : 0)
      };
    }).sort(compareRoomActivity);
  });
  return gap || missingRoom;
}
