import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { gomokuChatApi, mergeChatMessages } from "./chatApi";

const emptyState = () => ({
  enabled: false,
  loading: true,
  messages: [],
  pending: [],
  error: null,
  historyError: null,
  historyLoading: false,
  hasHistory: false
});

export function useGomokuChat(roomId, { connected, closed, chatSignal }) {
  const { member, status, sessionVersion } = useAuth();
  const owner = `${roomId}:${member?.id}:${status}:${sessionVersion}`;
  const [state, setState] = useState(() => ({ ...emptyState(), owner }));
  const runtime = useRef(null);
  if (state.owner !== owner) setState({ ...emptyState(), owner });

  useEffect(() => {
    if (status !== "authenticated") return undefined;
    const controller = new AbortController();
    const live = {
      participationId: null,
      cursor: "0",
      wanted: false,
      busy: false,
      disabled: false,
      closed: false,
      cancelled: false,
      retryTimer: null,
      historyCursor: null,
      historyLoading: false,
      messages: [],
      pending: [],
      sending: new Set()
    };
    runtime.current = live;
    const active = () => !live.cancelled && !live.closed && !live.disabled;
    function update(change) {
      if (!live.cancelled)
        setState((previous) => (previous.owner === owner ? { ...previous, ...change } : previous));
    }
    function accept(messages) {
      live.messages = mergeChatMessages(live.messages, messages);
      const confirmed = new Set(
        live.messages.map((message) => `${message.senderId}:${message.clientMessageId}`)
      );
      live.pending = live.pending.filter(
        (message) => !confirmed.has(`${message.senderId}:${message.clientMessageId}`)
      );
      update({ messages: live.messages, pending: live.pending });
    }
    function accessFailure(error) {
      if (error.code === "GOMOKU_CHAT_DISABLED" || error.status === 404) {
        live.disabled = true;
        update({ enabled: false, loading: false });
        return true;
      }
      if (error.status === 403 || error.code === "GOMOKU_CHAT_CLOSED") {
        live.disabled = true;
        live.pending = [];
        update({
          enabled: live.messages.length > 0,
          ended: true,
          loading: false,
          pending: [],
          error: null
        });
        controller.abort();
        return true;
      }
      if (error.status === 409) {
        live.disabled = true;
        live.messages = [];
        live.pending = [];
        update({
          enabled: true,
          loading: false,
          messages: [],
          pending: [],
          error: "참가 상태가 바뀌었어요. 방에 다시 들어와 주세요."
        });
        controller.abort();
        return true;
      }
      return false;
    }
    live.sync = async () => {
      if (!active()) return;
      live.wanted = true;
      if (live.busy) return;
      live.busy = true;
      clearTimeout(live.retryTimer);
      try {
        do {
          live.wanted = false;
          if (!live.participationId) {
            const page = await gomokuChatApi.history(
              roomId,
              { size: 50 },
              controller.signal
            );
            if (!active()) return;
            live.participationId = page.participationId;
            live.cursor = page.latestSequence;
            live.historyCursor = page.nextCursor;
            accept(page.items);
            update({ enabled: true, loading: false, hasHistory: page.hasNext, error: null });
          } else {
            let hasNext;
            do {
              const page = await gomokuChatApi.history(
                roomId,
                {
                  participationId: live.participationId,
                  afterSequence: live.cursor,
                  size: 100
                },
                controller.signal
              );
              if (!active()) return;
              if (page.participationId !== live.participationId) throw { status: 409 };
              accept(page.items);
              hasNext = page.hasNext;
              if (hasNext && (!page.nextCursor || BigInt(page.nextCursor) <= BigInt(live.cursor)))
                throw new Error("Chat recovery cursor did not advance");
              live.cursor = hasNext ? page.nextCursor : page.latestSequence;
            } while (hasNext && active());
            update({ error: null, loading: false });
          }
        } while (live.wanted && active());
      } catch (error) {
        if (!active() || controller.signal.aborted) return;
        if (!accessFailure(error)) {
          update({
            enabled: true,
            loading: false,
            error: "대화를 불러오지 못했어요. 다시 연결하고 있어요."
          });
          live.retryTimer = setTimeout(() => void live.sync(), 3000);
        }
      } finally {
        live.busy = false;
      }
    };
    live.loadHistory = async () => {
      if (!active() || live.historyLoading || !live.historyCursor || !live.participationId) return;
      live.historyLoading = true;
      update({ historyLoading: true, historyError: null });
      try {
        const page = await gomokuChatApi.history(
          roomId,
          {
            participationId: live.participationId,
            beforeSequence: live.historyCursor,
            size: 50
          },
          controller.signal
        );
        if (!active()) return;
        if (page.participationId !== live.participationId) throw { status: 409 };
        accept(page.items);
        live.historyCursor = page.nextCursor;
        update({ hasHistory: page.hasNext });
      } catch (error) {
        if (active() && !controller.signal.aborted && !accessFailure(error))
          update({ historyError: "이전 대화를 불러오지 못했어요. 다시 시도해 주세요." });
      } finally {
        live.historyLoading = false;
        update({ historyLoading: false });
      }
    };
    async function transmit(message) {
      if (!active() || live.sending.has(message.clientMessageId)) return;
      live.sending.add(message.clientMessageId);
      live.pending = live.pending.map((item) =>
        item.clientMessageId === message.clientMessageId ? { ...item, failed: false } : item
      );
      update({ pending: live.pending });
      try {
        const saved = await gomokuChatApi.send(
          roomId,
          {
            participationId: live.participationId,
            clientMessageId: message.clientMessageId,
            content: message.content
          },
          controller.signal
        );
        if (active()) accept([saved]);
      } catch (error) {
        if (!active() || controller.signal.aborted) return;
        if (
          error.status === 403 ||
          error.status === 404 ||
          error.code === "GOMOKU_CHAT_PARTICIPATION_CHANGED"
        ) {
          accessFailure(error);
          return;
        }
        live.pending = live.pending.map((item) =>
          item.clientMessageId === message.clientMessageId ? { ...item, failed: true } : item
        );
        update({ pending: live.pending });
        void live.sync();
      } finally {
        live.sending.delete(message.clientMessageId);
      }
    }
    live.send = (content) => {
      if (!active() || !live.participationId || !content.trim() || content.length > 2000)
        return false;
      const message = {
        clientMessageId: crypto.randomUUID(),
        senderId: String(member.id),
        author: "나",
        content,
        failed: false
      };
      live.pending = [...live.pending, message];
      update({ pending: live.pending });
      void transmit(message);
      return true;
    };
    live.retry = (message) => void transmit(message);
    const resume = () => {
      if (document.visibilityState !== "hidden") void live.sync();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    live.stop = () => {
      live.closed = true;
      live.pending = live.pending.map((message) => ({ ...message, failed: true }));
      update({ pending: live.pending, loading: false, error: null });
      controller.abort();
      clearTimeout(live.retryTimer);
    };
    return () => {
      live.cancelled = true;
      controller.abort();
      clearTimeout(live.retryTimer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      if (runtime.current === live) runtime.current = null;
    };
  }, [
    roomId,
    member?.id,
    status,
    sessionVersion,
    owner
  ]);

  useEffect(() => {
    if (closed) runtime.current?.stop();
    else if (connected) void runtime.current?.sync();
  }, [connected, closed, owner]);

  useEffect(() => {
    const live = runtime.current;
    if (!live || !chatSignal || closed) return;
    if (live.participationId && live.participationId !== chatSignal.participationId) {
      live.stop();
      live.disabled = true;
      setState({
        ...emptyState(),
        owner,
        enabled: true,
        loading: false,
        ended: true,
        error: "참가 상태가 바뀌었어요. 방에 다시 들어와 주세요."
      });
      return;
    }
    if (!live.participationId || BigInt(chatSignal.latestSequence) > BigInt(live.cursor))
      void live.sync();
  }, [chatSignal, closed, owner]);

  const send = useCallback((content) => runtime.current?.send(content) ?? false, []);
  const retry = useCallback((message) => runtime.current?.retry(message), []);
  const loadHistory = useCallback(() => runtime.current?.loadHistory(), []);
  const refresh = useCallback(() => void runtime.current?.sync(), []);
  return { ...state, send, retry, loadHistory, refresh };
}
