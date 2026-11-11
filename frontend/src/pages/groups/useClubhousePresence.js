import { useEffect, useMemo, useRef, useState } from "react";
import { compareSequence } from "../../entities/chat/index.js";
import { useChatSession } from "../../features/chat/ChatSessionProvider.jsx";
import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { SPEECH_DURATION_MS } from "../space/clubhouseInteractions.js";

export function useClubhousePresence(group, auth, { listen, isMember }) {
  const members = useInfiniteGroupMembers(group.id, { forGreeters: listen });
  const { fetchNextPage, hasNextPage, isFetching, isError } = members;
  useEffect(() => {
    if (listen && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [listen, fetchNextPage, hasNextPage, isFetching, isError]);
  const greetingMembers = useMemo(() => {
    const ids = [group.leader?.memberId, ...(members.data?.pages ?? []).flatMap((page) => page.items.map((member) => member.memberId))];
    return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  }, [group.leader?.memberId, members.data]);

  const session = useChatSession();
  const roomId = String(group.id);
  const enabled = Boolean(listen && isMember && auth.status === "authenticated" && !auth.logoutPending);
  const selectBackgroundRoom = session?.selectBackgroundRoom;
  useEffect(() => {
    if (!enabled || !selectBackgroundRoom) return undefined;
    selectBackgroundRoom(roomId);
    return () => selectBackgroundRoom(undefined);
  }, [enabled, roomId, selectBackgroundRoom]);

  const chat = enabled && session?.activeRoomId === roomId ? session.chat : null;
  const history = chat?.history;
  const scope = `${roomId}:${auth.member?.id}:${auth.sessionVersion}:${enabled}`;
  const cursor = useRef(null);
  const [speech, setSpeech] = useState(null);
  useEffect(() => {
    if (!enabled || !history?.data || history.isError) {
      cursor.current = null;
      // Clear the visual buffer when the authenticated chat subscription leaves this room.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpeech(null);
      return;
    }
    const data = history.data;
    if (cursor.current?.scope !== scope) {
      cursor.current = { scope, sequence: data.latestSequence };
      return;
    }
    const fresh = data.items.filter((message) => message.groupId === roomId && message.sequence &&
      !message.pending && !message.failed && compareSequence(message.sequence, cursor.current.sequence) > 0);
    if (!fresh.length) return;
    cursor.current.sequence = fresh.reduce((latest, message) => compareSequence(message.sequence, latest) > 0 ? message.sequence : latest, cursor.current.sequence);
    const now = Date.now();
    const messages = fresh.map((message) => ({ ...message, memberId: message.senderId, expiresAt: now + SPEECH_DURATION_MS }));
    setSpeech((previous) => ({ scope, messages: [...(previous?.scope === scope ? previous.messages.filter((message) => message.expiresAt > now) : []), ...messages].slice(-3) }));
  }, [enabled, history?.data, history?.isError, roomId, scope]);

  return { greetingMembers, speechMessages: enabled && chat && speech?.scope === scope ? speech.messages : [] };
}
