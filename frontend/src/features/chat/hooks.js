import { Client } from "@stomp/stompjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compareSequence, mergeMessages, messageSchema, readSchema } from "../../entities/chat";
import { getCookieValue } from "../../shared/api/cookies";
import { getMe, useAuth } from "../auth";
import { catchUp, fetchAllRooms, fetchMessages, markRead, postMessage } from "./api";
import { applyChatMessage, applyChatReadState, mergeRoomSnapshot } from "./cache";

export function useChat(roomId) {
  const auth = useAuth();
  const memberId = String(auth.member.id);
  const reloadAuth = auth.reload;
  const scope = useMemo(() => ["chat", memberId, auth.sessionVersion], [memberId, auth.sessionVersion]);
  const roomsKey = useMemo(() => [...scope, "rooms"], [scope]);
  const historyKey = useMemo(() => [...scope, "messages", roomId], [scope, roomId]);
  const client = useQueryClient();
  const lifetime = useRef(null);
  const synchronize = useRef(() => {});
  const readPending = useRef(false);
  const removedRooms = useRef(new Set());
  const [connection, setConnection] = useState("connecting");
  const [actionError, setActionError] = useState(null);
  const [historyLoad, setHistoryLoad] = useState(null);
  const loadingHistory = Boolean(historyLoad && historyLoad.roomId === roomId && !historyLoad.controller.signal.aborted);
  const rooms = useQuery({ queryKey: roomsKey, queryFn: async ({ signal }) => {
    let snapshot = await fetchAllRooms(signal);
    const current = client.getQueryData(roomsKey);
    if (snapshot.some((room) => {
      const existing = current?.find((item) => item.groupId === room.groupId);
      return existing && (compareSequence(existing.unreadThrough ?? existing.latestSequence, room.latestSequence) > 0 || compareSequence(existing.lastReadSequence, room.lastReadSequence) > 0);
    })) snapshot = await fetchAllRooms(signal);
    return mergeRoomSnapshot(snapshot.filter((room) => !removedRooms.current.has(room.groupId)), client.getQueryData(roomsKey));
  } });
  const history = useQuery({
    queryKey: historyKey, enabled: Boolean(roomId), staleTime: Infinity, retry: false,
    queryFn: async ({ signal }) => {
      const page = await fetchMessages(roomId, {}, signal);
      return { ...page, syncCursor: page.latestSequence };
    }
  });

  useEffect(() => {
    return () => {
      void client.cancelQueries({ queryKey: scope });
      client.removeQueries({ queryKey: scope });
    };
  }, [client, scope]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let running = false;
    let again = false;
    let reconnectTimer;
    const active = () => !controller.signal.aborted;
    const updateHistory = (page) => {
      if (!active()) return;
      client.setQueryData(historyKey, (old) => old ? {
        ...old, items: mergeMessages(old.items, page.items), status: old.status === "ENDED" ? "ENDED" : page.status,
        latestSequence: compareSequence(old.latestSequence, page.latestSequence) > 0 ? old.latestSequence : page.latestSequence,
        lastReadSequence: compareSequence(old.lastReadSequence, page.lastReadSequence) > 0 ? old.lastReadSequence : page.lastReadSequence
      } : old);
    };
    async function sync() {
      if (!active() || document.visibilityState === "hidden") return;
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          await client.invalidateQueries({ queryKey: roomsKey });
          if (roomId) {
            // Wait for the initial snapshot; only contiguous socket messages advance its cursor.
            const initial = await client.fetchQuery({ queryKey: historyKey, staleTime: Infinity, queryFn: async () => {
              const page = await fetchMessages(roomId, {}, controller.signal);
              return { ...page, syncCursor: page.latestSequence };
            } });
            const cursor = await catchUp(roomId, initial.syncCursor, updateHistory, controller.signal);
            if (active()) client.setQueryData(historyKey, (old) => old ? { ...old, syncCursor: compareSequence(old.syncCursor, cursor) > 0 ? old.syncCursor : cursor } : old);
          }
        } while (again && active());
      } catch (error) {
        if (active() && [403, 404].includes(error.status)) {
          client.removeQueries({ queryKey: historyKey, exact: true });
          client.setQueryData(roomsKey, (old) => old?.filter((room) => room.groupId !== roomId));
        }
      } finally { running = false; }
    }
    synchronize.current = sync;
    const socket = new Client({
      brokerURL: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws/chat`,
      reconnectDelay: 3000, connectionTimeout: 10000, heartbeatIncoming: 10000, heartbeatOutgoing: 10000,
      beforeConnect: async () => {
        // The common HTTP client performs the single-flight 401 refresh before a new handshake.
        try {
          const profile = await getMe();
          if (!profile.signupCompleted || String(profile.member?.id) !== memberId) {
            await socket.deactivate();
            if (active()) void reloadAuth();
            return;
          }
        }
        catch {
          await socket.deactivate();
          if (active()) {
            setConnection("reconnecting");
            reconnectTimer = window.setTimeout(() => { if (active()) socket.activate(); }, 3000);
          }
          return;
        }
        if (!active()) { await socket.deactivate(); return; }
        socket.connectHeaders = { "X-XSRF-TOKEN": getCookieValue(document.cookie, "XSRF-TOKEN") ?? "" };
      },
      onConnect: () => {
        if (!active()) return;
        setConnection("connected");
        socket.subscribe("/user/queue/chat-events", (frame) => {
          if (!active()) return;
          let event;
          try { event = JSON.parse(frame.body); } catch { return; }
          if (event.version !== 1) return;
          if (event.type === "MESSAGE_CREATED") {
            const parsed = messageSchema.safeParse(event.message);
            if (parsed.success && parsed.data.groupId === event.groupId && applyChatMessage(client, scope, parsed.data, memberId)) void sync();
          }
          if (event.type === "ROOM_CLOSED") {
            client.setQueryData([...scope, "messages", event.groupId], (old) => old ? { ...old, status: "ENDED" } : old);
            client.setQueryData(roomsKey, (old) => old?.map((room) => room.groupId === event.groupId ? { ...room, status: "ENDED" } : room));
          }
          if (event.type === "ROOM_REMOVED") {
            removedRooms.current.add(event.groupId);
            client.setQueryData(roomsKey, (old) => old?.filter((room) => room.groupId !== event.groupId));
            client.removeQueries({ queryKey: [...scope, "messages", event.groupId], exact: true });
          }
          if (event.type === "READ_STATE_UPDATED") {
            const parsed = readSchema.safeParse(event);
            if (parsed.success && applyChatReadState(client, scope, parsed.data)) void sync();
          }
          if (event.type === "RESYNC_REQUIRED") void sync();
        });
        void sync();
      },
      onWebSocketClose: () => { if (active()) setConnection("reconnecting"); },
      onStompError: () => { if (active()) setConnection("reconnecting"); }
    });
    socket.activate();
    const interval = window.setInterval(sync, 30000);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      controller.abort();
      client.setQueryData(historyKey, (old) => old ? { ...old, items: old.items.map((message) => message.pending ? { ...message, pending: false, failed: true } : message) } : old);
      window.clearTimeout(reconnectTimer);
      void socket.deactivate({ force: true });
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [client, historyKey, roomId, roomsKey, scope, memberId, reloadAuth]);

  const send = useCallback(async (content, retryMessage) => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    const message = retryMessage ?? {
      id: `pending-${crypto.randomUUID()}`, clientMessageId: crypto.randomUUID(),
      groupId: roomId, senderId: memberId, author: auth.member.crewName ?? "나",
      content, createdAt: new Date().toISOString()
    };
    setActionError(null);
    client.setQueryData(historyKey, (old) => old ? { ...old, items: mergeMessages(old.items, [{ ...message, failed: false, pending: true }]) } : old);
    try {
      const saved = await postMessage(roomId, { content: message.content, clientMessageId: message.clientMessageId }, controller.signal);
      if (!controller.signal.aborted) {
        if (applyChatMessage(client, scope, saved, memberId)) void synchronize.current();
      }
    } catch {
      if (!controller.signal.aborted) {
        client.setQueryData(historyKey, (old) => old ? { ...old, items: mergeMessages(old.items, [{ ...message, pending: false, failed: true }]) } : old);
        setActionError("메시지를 보내지 못했어요. 실패한 메시지에서 다시 보내기를 눌러 주세요.");
        void synchronize.current();
      }
    }
  }, [auth.member.crewName, client, historyKey, memberId, roomId, scope]);

  const read = useCallback(async (sequence) => {
    const controller = lifetime.current;
    const current = client.getQueryData(historyKey);
    if (!sequence || !current || readPending.current || document.visibilityState !== "visible" ||
      !document.hasFocus() || compareSequence(sequence, current.lastReadSequence) <= 0 ||
      compareSequence(sequence, current.syncCursor) > 0 || controller?.signal.aborted) return;
    readPending.current = true;
    try {
      const state = await markRead(roomId, sequence, controller.signal);
      if (!controller.signal.aborted) {
        if (applyChatReadState(client, scope, state)) void synchronize.current();
      }
    } catch { /* A future foreground observation retries the monotone server read cursor. */ }
    finally { readPending.current = false; }
  }, [client, historyKey, roomId, scope]);

  async function loadOlder() {
    const current = client.getQueryData(historyKey);
    const controller = lifetime.current;
    if (!current?.hasNext || loadingHistory || controller?.signal.aborted) return;
    const operation = { roomId, controller };
    setHistoryLoad(operation);
    setActionError(null);
    try {
      const page = await fetchMessages(roomId, { beforeSequence: current.nextCursor }, controller.signal);
      if (!controller.signal.aborted) client.setQueryData(historyKey, (old) => ({ ...old, items: mergeMessages(old.items, page.items), nextCursor: page.nextCursor, hasNext: page.hasNext }));
    } catch { if (!controller.signal.aborted) setActionError("이전 대화를 불러오지 못했어요. 다시 시도해 주세요."); }
    finally { setHistoryLoad((currentLoad) => currentLoad === operation ? null : currentLoad); }
  }
  return { rooms, history, connection, actionError, loadingHistory, send, read, loadOlder, sync: () => synchronize.current() };
}
