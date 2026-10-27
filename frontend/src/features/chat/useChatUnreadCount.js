import { useChatSession } from "./ChatSessionProvider";

export function useChatUnreadCount() {
  const session = useChatSession();
  if (!session) return 0;
  const { chat, roomId, viewing } = session;
  return (chat.rooms.data ?? []).reduce((total, room) => {
    const readingLatest = room.groupId === roomId && viewing?.id === roomId && viewing.latest;
    return total + (readingLatest ? 0 : room.unreadCount);
  }, 0);
}
