import { useEffect, useRef, useState } from "react";
import { captureEvent } from "../../shared/analytics";
import { storeReturnTarget } from "../auth";
import { arenaMessageSchema, arenaPost } from "./arenaBridge";
import { getSparring, getSparringPosts, postSparring, revisionSchema, voteSparring } from "./api";

export function useArenaBridge({ topicId, member, login, retry }) {
  const frame = useRef(null);
  const [view, setView] = useState({
    error: null,
    status: "connecting",
    title: "스파링",
    loaded: false
  });
  useEffect(() => {
    let disposed = false,
      ready = false,
      initialized = false,
      refreshing = false,
      refreshAgain = false;
    let topic = null,
      connection = "connecting",
      posting = false,
      source;
    let lastPostId = 0;
    const posts = new Map(),
      seen = new Set(),
      cursors = { all: null, mine: null },
      more = { all: false, mine: false };
    const send = (message) => {
      if (!disposed)
        frame.current?.contentWindow?.postMessage(
          { channel: "jarihana-sparring", ...message },
          window.location.origin
        );
    };
    function acceptTopic(updated) {
      if (!topic || updated.revision >= topic.revision) topic = updated;
    }
    function snapshot(fresh = []) {
      if (!topic) return;
      const total = topic.votesA + topic.votesB;
      send({
        kind: "snapshot",
        state: {
          topic: { ...topic, id: String(topic.id), example: false },
          balance: {
            a: topic.votesA,
            b: topic.votesB,
            total,
            ratio: total ? topic.votesA / total : 0.5
          },
          mySide: topic.mySide === "MINT" ? "a" : topic.mySide === "CORAL" ? "b" : null,
          actorId: member ? String(member.id) : "guest",
          postCount: topic.postCount,
          posts: [...posts.values()].sort((a, b) => Number(a.id) - Number(b.id)),
          more,
          connection
        },
        fresh
      });
    }
    function merge(items, fresh) {
      for (const raw of items) {
        const post = arenaPost(raw);
        posts.set(post.id, post);
        lastPostId = Math.max(lastPostId, raw.id);
        if (!seen.has(post.id)) {
          seen.add(post.id);
          if (initialized && !(posting && raw.authorId === member?.id)) fresh.push(post.id);
        }
      }
    }
    async function refresh() {
      if (!ready || disposed) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          const fresh = [];
          const updated = await getSparring(topicId);
          if (disposed) return;
          if (!initialized) {
            const history = await getSparringPosts(topicId, { size: 30 });
            if (disposed) return;
            merge(history.items, fresh);
            cursors.all = history.nextCursor;
            more.all = history.hasNext;
          } else {
            let page;
            do {
              page = await getSparringPosts(topicId, { size: 100, afterId: lastPostId });
              if (disposed) return;
              merge(page.items, fresh);
            } while (page.hasNext);
          }
          // A concurrent command can move the topic forward while catch-up is running; its SSE revision triggers another refresh.
          acceptTopic(updated);
          initialized = true;
          setView({ error: null, status: connection, title: topic.title, loaded: true });
          snapshot(fresh);
        } while (refreshAgain && !disposed);
      } catch (error) {
        if (!disposed) {
          setView((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "연결을 확인해 주세요."
          }));
          send({ kind: "failure", message: "대화를 불러오지 못했어요. 연결되면 다시 이어갈게요." });
        }
      } finally {
        refreshing = false;
      }
    }
    function setConnection(next) {
      connection = next;
      if (!disposed) {
        setView((current) => ({ ...current, status: next }));
        send({ kind: "connection", value: next });
      }
    }
    function connect() {
      source?.close();
      source = new EventSource(`/api/sparrings/${topicId}/events`, { withCredentials: true });
      source.onopen = () => {
        setConnection("live");
        void refresh();
      };
      source.onerror = () => setConnection(navigator.onLine ? "reconnecting" : "offline");
      source.addEventListener("revision", (event) => {
        try {
          const parsed = revisionSchema.safeParse(JSON.parse(event.data));
          if (parsed.success && parsed.data.revision !== topic?.revision) void refresh();
        } catch {
          setConnection("reconnecting");
        }
      });
    }
    function start() {
      if (ready) return;
      ready = true;
      void refresh();
      connect();
    }
    async function command(message) {
      const respond = (result, error) =>
        send({ kind: "result", requestId: message.requestId, result, error });
      try {
        if (message.action === "login" || (!member && message.action !== "history")) {
          storeReturnTarget(`/sparring/${topicId}`);
          login();
          respond(null, "로그인 후 참여할 수 있어요.");
          return;
        }
        if (message.action === "vote") {
          await voteSparring(topicId, message.payload.side === "a" ? "MINT" : "CORAL");
          acceptTopic(await getSparring(topicId));
          snapshot();
          respond(true);
          return;
        }
        if (message.action === "history") {
          const key = message.payload.mine ? "mine" : "all";
          const cursor = message.payload.reset ? null : cursors[key];
          const page = await getSparringPosts(topicId, {
            size: 30,
            mine: message.payload.mine,
            ...(cursor ? { cursor } : {})
          });
          for (const raw of page.items) {
            const post = arenaPost(raw);
            posts.set(post.id, post);
            seen.add(post.id);
          }
          cursors[key] = page.nextCursor;
          more[key] = page.hasNext;
          snapshot();
          respond(true);
          return;
        }
        posting = true;
        const result = await postSparring(topicId, {
          text: message.payload.text,
          replyToId: message.payload.replyToId ? Number(message.payload.replyToId) : null,
          requestId: message.payload.postId
        });
        seen.add(String(result.id));
        // Always retrieve the committed post even if an SSE refresh is already in flight.
        const page = await getSparringPosts(topicId, { size: 100, afterId: result.id - 1 });
        const own = page.items.find((post) => post.id === result.id);
        if (!own) throw new Error("보낸 글을 다시 확인하고 있어요. 같은 내용으로 재시도해 주세요.");
        const post = arenaPost(own);
        posts.set(post.id, post);
        acceptTopic(await getSparring(topicId));
        snapshot();
        respond(post);
      } catch (error) {
        respond(null, error instanceof Error ? error.message : "전송하지 못했어요.");
      } finally {
        if (message.action === "post") posting = false;
      }
    }
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      const parsed = arenaMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.kind === "ready") start();
      else if (message.kind === "reveal")
        frame.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth"
        });
      else if (message.kind === "interaction")
        captureEvent("sparring_interaction", { action: message.action });
      else if (message.kind === "height") {
        if (frame.current) frame.current.style.height = `${Math.ceil(message.height)}px`;
      } else if (message.kind === "command") void command(message);
    }
    const online = () => {
      connect();
      void refresh();
    };
    const offline = () => {
      source?.close();
      setConnection("offline");
    };
    window.addEventListener("message", receive);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    send({ kind: "hello" });
    return () => {
      disposed = true;
      source?.close();
      window.removeEventListener("message", receive);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [topicId, member, login, retry]);
  return { frame, ...view };
}
