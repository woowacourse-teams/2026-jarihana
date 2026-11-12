import { useCallback, useEffect, useRef, useState } from "react";
import { captureEvent } from "../../shared/analytics";
import { storeReturnTarget } from "../auth";
import { arenaMessageSchema, arenaPost } from "./arenaBridge";
import { getSparring, getSparringAvatarCandidates, getSparringPosts, postSparring, streamSchema, voteSparring } from "./api";

const REPLAY_SIZE = 30;
const AVATAR_REFRESH_MS = 30000;

export function useArenaBridge({ topicId, member, login, retry, actorAppearance = null }) {
  const frame = useRef(null);
  const entryVote = useRef(null);
  const appearance = useRef(null);
  const publishAppearance = useRef(null);
  const selectSide = useCallback(side => entryVote.current?.(side) ?? Promise.resolve(false), []);
  const [view, setView] = useState({
    error: null,
    status: "connecting",
    title: "토론해요",
    topic: null,
    loaded: false,
    sceneReady: false,
    sceneError: null
  });
  useEffect(() => {
    appearance.current = actorAppearance;
    publishAppearance.current?.();
  }, [actorAppearance]);
  useEffect(() => {
    let disposed = false,
      ready = false,
      initialized = false,
      sceneReady = false;
    let streamState = null, awaitingSnapshot = true;
    setView({ error: null, status: "connecting", title: "토론해요", topic: null, loaded: false, sceneReady: false, sceneError: null });
    const loadingTimeout = setTimeout(() => {
      if (!disposed && !sceneReady) setView(current => ({ ...current, sceneError: "화면 준비가 늦어지고 있어요. 다시 불러와 주세요." }));
    }, 30000);
    let topic = null,
      connection = "connecting",
      posting = 0,
      source;
    let lastStreamPostId = 0, latestPostId = 0;
    let history = { page: 0, posts: [] }, historyBoundary;
    let historyEmptyAt = null, historySide = 0, historyBatch = [];
    const historySides = ["MINT", "CORAL"].map(side => ({
      side, posts: [], cursor: undefined, done: false, lastId: Infinity, cursors: new Set()
    }));
    let historyDemand = false, historyRequest = false, historyBlocked = false;
    let historyTimer = null, historyRetryDelay = 1000;
    let avatarCandidates = [], avatarCandidatesKey = "[]", publishedAvatarCandidatesKey;
    let avatarTimer = null, avatarRequest = null, nextAvatarRefreshAt = 0;
    let mutationQueue = Promise.resolve();
    const posts = new Map(),
      seen = new Set();
    const send = (message) => {
      if (!disposed)
        frame.current?.contentWindow?.postMessage(
          { channel: "jarihana-sparring", ...message },
          window.location.origin
        );
    };
    function acceptTopic(updated) {
      if (!topic || updated.revision >= topic.revision) topic = updated;
      else topic = { ...topic, mySide: updated.mySide };
      if (streamState && streamState.revision >= topic.revision) {
        topic = { ...topic, ...streamState };
      }
      if (!disposed) setView(current => ({ ...current, topic, title: topic.title }));
    }
    function snapshot(fresh = [], livePosts = []) {
      if (!ready || !initialized || !topic || document.hidden) return;
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
          actorMemberType: member?.memberType ?? "CREW",
          actorAppearance: member ? appearance.current : null,
          postCount: topic.postCount,
          posts: [...posts.values()].sort((a, b) => Number(a.id) - Number(b.id)),
          history,
          connection
        },
        fresh,
        livePosts
      });
    }
    publishAppearance.current = snapshot;
    function publishAvatarCandidates() {
      if (!ready || document.hidden || publishedAvatarCandidatesKey === avatarCandidatesKey) return;
      send({ kind: "avatarCandidates", candidates: avatarCandidates });
      publishedAvatarCandidatesKey = avatarCandidatesKey;
    }
    function scheduleAvatarCandidates() {
      if (disposed || document.hidden || avatarTimer !== null || avatarRequest) return;
      const delay = Math.max(0, nextAvatarRefreshAt - Date.now());
      avatarTimer = setTimeout(() => {
        avatarTimer = null;
        if (!document.hidden) void loadAvatarCandidates();
      }, delay);
    }
    async function loadAvatarCandidates() {
      const request = new AbortController();
      avatarRequest = request;
      try {
        const { appearances } = await getSparringAvatarCandidates(topicId, { signal: request.signal });
        avatarCandidates = appearances;
        avatarCandidatesKey = JSON.stringify(appearances);
      } catch {
        // Keep the last successful list when refresh fails.
      } finally {
        avatarRequest = null;
        nextAvatarRefreshAt = Date.now() + AVATAR_REFRESH_MS;
      }
      if (disposed) return;
      publishAvatarCandidates();
      scheduleAvatarCandidates();
    }
    function trimReplay() {
      const ids = [...posts.keys()].sort((a, b) => Number(b) - Number(a));
      for (const id of ids.slice(REPLAY_SIZE)) posts.delete(id);
      for (const id of seen) if (!posts.has(id)) seen.delete(id);
    }
    function scheduleHistory(delay = 0) {
      if (disposed || !ready || !initialized || document.hidden || !historyDemand ||
          historyRequest || historyTimer !== null || historyBlocked ||
          !topic?.postCount || historyEmptyAt === topic.postCount) return;
      historyTimer = setTimeout(() => {
        historyTimer = null;
        void loadHistory();
      }, delay);
    }
    const historyExhausted = () => historySides.every(side => side.done && side.posts.length === 0);
    function restartHistory() {
      historyBoundary = latestPostId;
      historySide = 0;
      for (const side of historySides) {
        side.cursor = undefined;
        side.done = false;
        side.lastId = Infinity;
        side.cursors.clear();
      }
    }
    async function loadHistory() {
      historyRequest = true;
      let delay = 0;
      try {
        if (!historyBatch.length && historyExhausted()) restartHistory();
        while (!disposed && !document.hidden && historyDemand) {
          if (historyBatch.length === REPLAY_SIZE || historyExhausted()) {
            if (historyBatch.length) {
              history = { page: history.page + 1, posts: historyBatch };
              historyBatch = [];
              historyDemand = false;
              historyRetryDelay = 1000;
              historyEmptyAt = null;
              snapshot();
            } else if (historyBoundary < latestPostId) {
              restartHistory();
              continue;
            } else historyEmptyAt = topic.postCount;
            return;
          }
          let side = historySides[historySide];
          if (side.done && !side.posts.length) {
            historySide = 1 - historySide;
            side = historySides[historySide];
          }
          if (!side.posts.length) {
            const page = await getSparringPosts(topicId, {
              size: REPLAY_SIZE, side: side.side, throughId: historyBoundary,
              ...(side.cursor ? { cursor: side.cursor } : {})
            });
            if (disposed) return;
            const invalidItems = page.items.some((post, index) => post.side !== side.side ||
              post.id > historyBoundary || post.id >= (index ? page.items[index - 1].id : side.lastId));
            if (invalidItems || (page.hasNext && (!page.items.length || !page.nextCursor ||
                page.nextCursor === side.cursor || side.cursors.has(page.nextCursor)))) {
              historyBlocked = true;
              send({ kind: "failure", message: "이전 대화의 목록 위치를 확인하지 못했어요. 다시 연결해 주세요." });
              return;
            }
            side.posts = page.items.map(arenaPost);
            side.lastId = page.items.at(-1)?.id ?? side.lastId;
            side.cursor = page.hasNext ? page.nextCursor : undefined;
            side.done = !page.hasNext;
            if (side.cursor) side.cursors.add(side.cursor);
            continue;
          }
          historyBatch.push(side.posts.shift());
          historySide = 1 - historySide;
        }
      } catch {
        delay = historyRetryDelay;
        historyRetryDelay = Math.min(historyRetryDelay * 2, 30000);
      } finally {
        historyRequest = false;
        scheduleHistory(delay);
      }
    }
    function publish(fresh = [], livePosts = []) {
      if (!topic || !streamState) return;
      initialized = true;
      setView(current => ({ ...current, error: null, status: connection, title: topic.title, loaded: true }));
      snapshot(fresh, livePosts);
      scheduleHistory();
    }
    function acceptStream(data, reset) {
      if (streamState && data.revision < streamState.revision) return;
      if (!reset && (awaitingSnapshot || data.revision === streamState?.revision)) return;
      const fresh = [], livePosts = [];
      if (historyBoundary === undefined) historyBoundary = Math.max(0, ...data.posts.map(post => post.id));
      if (reset) {
        posts.clear();
        seen.clear();
      }
      for (const raw of [...data.posts].sort((a, b) => a.id - b.id)) {
        const post = arenaPost(raw);
        if (!reset && raw.id > lastStreamPostId && !seen.has(post.id) &&
            !(posting && raw.authorId === member?.id)) {
          fresh.push(post.id);
          livePosts.push(post);
        }
        posts.set(post.id, post);
        seen.add(post.id);
        lastStreamPostId = Math.max(lastStreamPostId, raw.id);
        latestPostId = Math.max(latestPostId, raw.id);
      }
      trimReplay();
      const { revision, votesA, votesB, postCount } = data;
      streamState = { revision, votesA, votesB, postCount };
      awaitingSnapshot = false;
      if (topic) acceptTopic(topic);
      publish(reset ? [] : fresh, reset ? [] : livePosts);
    }
    async function loadTopic() {
      try {
        const updated = await getSparring(topicId);
        if (disposed) return;
        acceptTopic(updated);
        publish();
      } catch (error) {
        if (!disposed) {
          setView(current => ({ ...current, error: error instanceof Error ? error.message : "연결을 확인해 주세요." }));
          send({ kind: "failure", message: "대화를 불러오지 못했어요. 다시 시도해 주세요." });
        }
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
      awaitingSnapshot = true;
      const stream = new EventSource(`/api/sparrings/${topicId}/events`, { withCredentials: true });
      source = stream;
      const current = () => !disposed && source === stream;
      stream.onopen = () => {
        if (!current()) return;
        awaitingSnapshot = true;
        setConnection("live");
      };
      stream.onerror = () => {
        if (current()) setConnection(navigator.onLine ? "reconnecting" : "offline");
      };
      for (const kind of ["snapshot", "update"]) stream.addEventListener(kind, event => {
        if (!current()) return;
        try {
          const parsed = streamSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) throw new Error("Invalid stream data");
          acceptStream(parsed.data, kind === "snapshot");
        } catch {
          setConnection("reconnecting");
          connect();
        }
      });
    }
    function start() {
      updateViewport();
      if (ready) return;
      ready = true;
      snapshot();
      publishAvatarCandidates();
      scheduleHistory();
    }
    function updateViewport() {
      if (!frame.current) return;
      const frameTop = frame.current.getBoundingClientRect().top + window.scrollY;
      const rail = frame.current.closest?.(".sparring-detail")?.querySelector(".sparring-detail__rail");
      const contentWidth = rail?.getBoundingClientRect().width;
      send({
        kind: "viewport",
        height: Math.max(0, window.innerHeight - frameTop),
        ...(Number.isFinite(contentWidth) && contentWidth > 0 ? { contentWidth } : {})
      });
    }
    async function saveVote(side) {
      if (side !== "MINT" && side !== "CORAL") throw new Error("참여할 편을 골라주세요.");
      if (!member) {
        storeReturnTarget(`/sparring/${topicId}`);
        login();
        return false;
      }
      if (!topic) throw new Error("토론을 불러온 뒤 다시 시도해 주세요.");
      if (topic.closesAt && Date.parse(topic.closesAt) <= Date.now()) {
        throw new Error("마감된 토론이에요. 결과를 구경할 수 있어요.");
      }
      if (topic.mySide === side) return true;
      await voteSparring(topicId, side);
      if (disposed) return false;
      const updated = await getSparring(topicId);
      if (disposed) return false;
      acceptTopic(updated);
      snapshot();
      return true;
    }
    entryVote.current = side => {
      // Entry votes and arena writes share one queue so a vote cannot overtake a post.
      const operation = mutationQueue.then(() => disposed ? false : saveVote(side));
      mutationQueue = operation.catch(() => {});
      return operation;
    };
    async function command(message) {
      const respond = (result, error) =>
        send({ kind: "result", requestId: message.requestId, result, error });
      let countedPost = false;
      try {
        if (message.action === "login" || !member) {
          storeReturnTarget(`/sparring/${topicId}`);
          login();
          respond(null, "로그인 후 참여할 수 있어요.");
          return;
        }
        if (message.action === "vote") {
          respond(await saveVote(message.payload.side === "a" ? "MINT" : "CORAL"));
          return;
        }
        posting++;
        countedPost = true;
        const result = await postSparring(topicId, {
          text: message.payload.text,
          replyToId: message.payload.replyToId ? Number(message.payload.replyToId) : null,
          requestId: message.payload.postId
        });
        seen.add(String(result.id));
        // The write response contains only an ID; fetch this saved post for the sender animation.
        const page = await getSparringPosts(topicId, { size: 1, afterId: result.id - 1 });
        const own = page.items.find((post) => post.id === result.id);
        if (!own) throw new Error("보낸 글을 다시 확인하고 있어요. 같은 내용으로 재시도해 주세요.");
        const post = arenaPost(own);
        latestPostId = Math.max(latestPostId, own.id);
        posts.set(post.id, post);
        trimReplay();
        snapshot();
        respond(post);
      } catch (error) {
        respond(null, error instanceof Error ? error.message : "전송하지 못했어요.");
      } finally {
        if (countedPost) posting--;
      }
    }
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      const parsed = arenaMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.kind === "ready") start();
      else if (message.kind === "history" && message.page === history.page) {
        historyDemand = true;
        scheduleHistory();
      }
      else if (message.kind === "scene" && ready && initialized) {
        if (message.status === "ready") {
          sceneReady = true;
          clearTimeout(loadingTimeout);
          setView(current => ({ ...current, sceneReady: true, sceneError: null }));
        } else if (!sceneReady) {
          clearTimeout(loadingTimeout);
          setView(current => ({ ...current, sceneError: "3D 화면을 불러오지 못했어요. 다시 시도해 주세요." }));
        }
      }
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
        updateViewport();
      } else if (message.kind === "command") {
        if (message.action === "post" || message.action === "vote") {
          // Keep server writes in input order; the composer can accept another draft immediately.
          // A timed-out iframe request must not let a later vote overtake its unfinished post.
          mutationQueue = mutationQueue.then(() => {
            if (!disposed) return command(message);
          });
        } else {
          void command(message);
        }
      }
    }
    const online = () => {
      connect();
      if (!topic) void loadTopic();
    };
    const offline = () => {
      source?.close();
      source = null;
      setConnection("offline");
    };
    const visibilityChanged = () => {
      if (document.hidden) {
        clearTimeout(historyTimer);
        historyTimer = null;
        clearTimeout(avatarTimer);
        avatarTimer = null;
      } else {
        snapshot();
        publishAvatarCandidates();
        scheduleHistory();
        scheduleAvatarCandidates();
      }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("message", receive);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("resize", updateViewport);
    void loadTopic();
    connect();
    scheduleAvatarCandidates();
    send({ kind: "hello" });
    return () => {
      disposed = true;
      entryVote.current = null;
      publishAppearance.current = null;
      clearTimeout(loadingTimeout);
      clearTimeout(historyTimer);
      clearTimeout(avatarTimer);
      avatarRequest?.abort();
      source?.close();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("message", receive);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("resize", updateViewport);
    };
  }, [topicId, member, login, retry]);
  return { frame, selectSide, ...view };
}
