import { act, renderHook, waitFor } from "@testing-library/react";
import { useArenaBridge } from "./useArenaBridge";
import { getSparring, getSparringPosts, postSparring, voteSparring } from "./api";

jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  getSparring: jest.fn(),
  getSparringPosts: jest.fn(),
  postSparring: jest.fn(),
  voteSparring: jest.fn()
}));
jest.mock("../auth", () => ({ storeReturnTarget: jest.fn() }));
const topic = {
  id: 1,
  title: "점심",
  a: "기다려",
  b: "다른 곳",
  description: "",
  votesA: 1,
  votesB: 0,
  postCount: 0,
  revision: 1,
  mySide: "MINT"
};
const post = {
  id: 1,
  authorId: 1,
  name: "가온",
  memberType: "CREW",
  side: "MINT",
  text: "맛있으면 기다려",
  createdAt: "2026-10-29T12:00:00",
  replyTo: null
};
class Stream {
  static instances = [];
  static autoSnapshot = true;
  constructor() {
    this.listeners = {};
    this.close = jest.fn();
    Stream.instances.push(this);
    if (Stream.autoSnapshot) queueMicrotask(() => {
      this.onopen?.();
      this.emit("snapshot", streamData());
    });
  }
  emit(kind, data) {
    this.listeners[kind]?.({ data: JSON.stringify(data) });
  }
  addEventListener(kind, listener) {
    this.listeners[kind] = listener;
  }
}
const member = { id: 1 },
  login = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Stream.instances = [];
  Stream.autoSnapshot = true;
  global.EventSource = Stream;
  getSparring.mockResolvedValue(topic);
  getSparringPosts.mockResolvedValue({ items: [], nextCursor: null, hasNext: false });
});
function setup() {
  const hook = renderHook(() => useArenaBridge({ topicId: "1", member, login, retry: 0 }));
  const target = { postMessage: jest.fn() };
  hook.result.current.frame.current = {
    contentWindow: target,
    style: {},
    getBoundingClientRect: () => ({ top: 100 })
  };
  const receive = (data, origin = window.location.origin) =>
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: target,
          origin,
          data: { channel: "jarihana-sparring", ...data }
        })
      )
    );
  return { ...hook, target, receive };
}

const streamData = (posts = [], revision = 1, counts = {}) => ({
  revision, votesA: 1, votesB: 0, postCount: posts.length, posts, ...counts
});
const snapshots = target => target.postMessage.mock.calls.map(([message]) => message).filter(message => message.kind === "snapshot");

it("exposes entry metadata before the SSE snapshot or renderer is ready", async () => {
  Stream.autoSnapshot = false;
  const { result } = setup();
  await waitFor(() => expect(result.current.topic).toEqual(topic));
  expect(result.current.loaded).toBe(false);
  expect(result.current.sceneReady).toBe(false);
});

it("serializes entry votes with an unfinished post and avoids repeating the saved side", async () => {
  const { receive, result } = setup();
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let finishPost;
  postSparring.mockImplementationOnce(() => new Promise(resolve => { finishPost = resolve; }));
  receive({
    kind: "command", action: "post", requestId: "before-entry",
    payload: { text: post.text, replyToId: null, postId: "bc2eb62e-b004-4b9c-8bde-dcd9fd86be72" }
  });
  await waitFor(() => expect(finishPost).toBeDefined());
  const first = result.current.selectSide("CORAL");
  const second = result.current.selectSide("CORAL");
  await act(async () => {});
  expect(voteSparring).not.toHaveBeenCalled();
  getSparringPosts.mockResolvedValue({ items: [post], nextCursor: null, hasNext: false });
  getSparring.mockResolvedValue({ ...topic, mySide: "CORAL", revision: 2 });
  await act(async () => { finishPost({ id: 1 }); await Promise.all([first, second]); });
  expect(voteSparring).toHaveBeenCalledTimes(1);
  expect(voteSparring).toHaveBeenCalledWith("1", "CORAL");
  expect(result.current.topic.mySide).toBe("CORAL");
});

it("rejects entry votes after the deadline and discards calls after unmount", async () => {
  getSparring.mockResolvedValue({ ...topic, closesAt: "2020-01-01T00:00:00Z" });
  const { result, unmount } = setup();
  await waitFor(() => expect(result.current.topic).not.toBeNull());
  await expect(result.current.selectSide("CORAL")).rejects.toThrow("마감된 토론");
  const selectSide = result.current.selectSide;
  unmount();
  await expect(selectSide("CORAL")).resolves.toBe(false);
  expect(voteSparring).not.toHaveBeenCalled();
});

it.each([false, true])("ignores the removed history command (mine=%s) without reading or writing posts", async mine => {
  const { receive, target, result } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  getSparring.mockClear(); getSparringPosts.mockClear(); target.postMessage.mockClear();
  receive({ kind: "command", action: "history", requestId: "old-history", payload: { mine, reset: true } });
  await act(async () => {});
  expect(getSparring).not.toHaveBeenCalled();
  expect(getSparringPosts).not.toHaveBeenCalled();
  expect(postSparring).not.toHaveBeenCalled();
  expect(voteSparring).not.toHaveBeenCalled();
  expect(target.postMessage).not.toHaveBeenCalled();
});

describe("SSE message delivery", () => {
  let hidden;
  function visibility(value) {
    hidden = value;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  }
  beforeEach(() => {
    hidden = false;
    jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  });
  afterEach(() => jest.restoreAllMocks());

  it("accepts all 1000 streamed posts, keeps the latest 30 and forwards every new post for launch without HTTP reads", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    getSparring.mockClear(); getSparringPosts.mockClear();
    const items = Array.from({ length: 1000 }, (_, i) => ({ ...post, id: i + 1, authorId: 2 }));
    act(() => Stream.instances.at(-1).emit("update", streamData(items, 1001)));
    const latest = snapshots(target).at(-1);
    expect(latest.state.posts.map(item => item.id)).toEqual(items.slice(-30).map(item => String(item.id)));
    expect(latest.fresh).toEqual(items.map(item => String(item.id)));
    expect(latest.livePosts.map(item => item.id)).toEqual(items.map(item => String(item.id)));
    expect(latest.state.postCount).toBe(1000);
    expect(getSparring).not.toHaveBeenCalled();
    expect(getSparringPosts).not.toHaveBeenCalled();
    act(() => Stream.instances.at(-1).emit("update", streamData([{ ...post, id: 1001, authorId: 2 }], 1002)));
    expect(snapshots(target).at(-1).fresh).toEqual(["1001"]);
    expect(snapshots(target).at(-1).state.posts).toHaveLength(30);
  });

  it("replaces replay on reconnect without replaying missed launches or calling REST", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const stream = Stream.instances.at(-1);
    act(() => stream.emit("update", streamData([post], 2)));
    getSparring.mockClear(); getSparringPosts.mockClear();
    act(() => { stream.onerror(); stream.onopen(); });
    const recent = Array.from({ length: 30 }, (_, i) => ({ ...post, id: i + 971 }));
    act(() => stream.emit("snapshot", streamData(recent, 1001)));
    expect(snapshots(target).at(-1).state.posts.map(item => item.id)).toEqual(recent.map(item => String(item.id)));
    expect(snapshots(target).at(-1).fresh).toEqual([]);
    expect(getSparring).not.toHaveBeenCalled();
    expect(getSparringPosts).not.toHaveBeenCalled();
  });

  it("updates replay while hidden and resumes without missed effects or catch-up requests", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    target.postMessage.mockClear(); getSparring.mockClear();
    visibility(true);
    act(() => Stream.instances.at(-1).emit("update", streamData([{ ...post, authorId: 2 }], 2)));
    expect(snapshots(target)).toHaveLength(0);
    visibility(false);
    expect(snapshots(target).at(-1).state.posts).toHaveLength(1);
    expect(snapshots(target).at(-1).fresh).toEqual([]);
    act(() => Stream.instances.at(-1).emit("update", streamData([{ ...post, id: 2, authorId: 2 }], 3)));
    expect(snapshots(target).at(-1).fresh).toEqual(["2"]);
    expect(getSparring).not.toHaveBeenCalled();
    expect(getSparringPosts).not.toHaveBeenCalled();
  });

  it("applies vote-only counts without losing personal state or replaying duplicate/stale updates", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const stream = Stream.instances.at(-1);
    act(() => stream.emit("update", streamData([post], 2)));
    act(() => stream.emit("update", streamData([], 3, { votesA: 2, postCount: 1 })));
    expect(snapshots(target).at(-1)).toMatchObject({ fresh: [], state: { mySide: "a", balance: { a: 2 }, posts: [{ id: "1" }] } });
    const count = snapshots(target).length;
    act(() => stream.emit("update", streamData([post], 2)));
    act(() => stream.emit("update", streamData([], 3)));
    expect(snapshots(target)).toHaveLength(count);
  });

  it("reconnects on invalid event data and ignores old-stream callbacks and post-unmount events", async () => {
    const { receive, target, result, unmount } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const old = Stream.instances.at(-1);
    await act(async () => old.emit("update", { revision: 2, posts: [{ id: 2 }] }));
    expect(old.close).toHaveBeenCalled();
    expect(Stream.instances).toHaveLength(2);
    target.postMessage.mockClear();
    act(() => old.emit("update", streamData([post], 3)));
    expect(target.postMessage).not.toHaveBeenCalled();
    const current = Stream.instances.at(-1);
    unmount();
    act(() => current.emit("update", streamData([post], 4)));
    expect(target.postMessage).not.toHaveBeenCalled();
  });
});
it("sends the available height and remeasures the shared content width on resize", () => {
  const { receive, target, result, unmount } = setup();
  let contentWidth = 1358;
  const rail = { getBoundingClientRect: () => ({ width: contentWidth }) };
  result.current.frame.current.closest = jest.fn(() => ({
    querySelector: () => rail
  }));
  receive({ kind: "ready" });
  expect(target.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "viewport", height: window.innerHeight - 100, contentWidth: 1358 }),
    window.location.origin
  );
  target.postMessage.mockClear();
  contentWidth = 720;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(target.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "viewport", height: window.innerHeight - 100, contentWidth: 720 }),
    window.location.origin
  );
  for (const invalid of [0, -1, Infinity, NaN]) {
    target.postMessage.mockClear();
    contentWidth = invalid;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(target.postMessage).toHaveBeenCalledWith(
      { channel: "jarihana-sparring", kind: "viewport", height: window.innerHeight - 100 },
      window.location.origin
    );
  }
  unmount();
  target.postMessage.mockClear();
  act(() => window.dispatchEvent(new Event("resize")));
  expect(target.postMessage).not.toHaveBeenCalled();
});
it("remeasures space after the arena reports its height", async () => {
  const { receive, target, result } = setup();
  result.current.frame.current.getBoundingClientRect = () => ({ top: 148 });
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  result.current.frame.current.getBoundingClientRect = () => ({ top: 100 });
  target.postMessage.mockClear();
  receive({ kind: "height", height: 1200 });
  expect(target.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "viewport", height: window.innerHeight - 100 }),
    window.location.origin
  );
});
it("rejects foreign origins, validates payloads and closes the stream on unmount", async () => {
  const { receive, target, unmount } = setup();
  receive({ kind: "ready" }, "https://untrusted.example");
  expect(Stream.instances).toHaveLength(1);
  expect(target.postMessage).not.toHaveBeenCalled();
  receive({ kind: "ready" });
  await waitFor(() =>
    expect(target.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "snapshot" }),
      window.location.origin
    )
  );
  receive({ kind: "command", action: "post", requestId: "bad", payload: { text: "bad" } });
  expect(postSparring).not.toHaveBeenCalled();
  const stream = Stream.instances.at(-1);
  unmount();
  expect(stream.close).toHaveBeenCalled();
});

it("buffers an SSE snapshot and newer counts while the initial personal summary is still loading", async () => {
  let finishTopic;
  getSparring.mockImplementationOnce(() => new Promise(resolve => { finishTopic = resolve; }));
  const { result, target, receive } = setup();
  await act(async () => {});
  act(() => Stream.instances.at(-1).emit("update", streamData([post], 3, { votesA: 3 })));
  expect(result.current.loaded).toBe(false);
  await act(async () => finishTopic(topic));
  expect(result.current.loaded).toBe(true);
  expect(getSparringPosts).not.toHaveBeenCalled();
  expect(snapshots(target)).toHaveLength(0);
  receive({ kind: "ready" });
  expect(snapshots(target).at(-1)).toMatchObject({ fresh: [], state: { posts: [{ id: "1" }], balance: { a: 3 }, mySide: "a" } });
  receive({ kind: "scene", status: "ready" }, "https://untrusted.example");
  expect(result.current.sceneReady).toBe(false);
  receive({ kind: "scene", status: "ready" });
  expect(result.current.sceneReady).toBe(true);
});

it("waits for the initial stream snapshot as well as the summary and first rendered scene", async () => {
  Stream.autoSnapshot = false;
  const { result, target, receive } = setup();
  receive({ kind: "ready" });
  await act(async () => {});
  expect(result.current.loaded).toBe(false);
  expect(snapshots(target)).toHaveLength(0);
  act(() => Stream.instances.at(-1).emit("snapshot", streamData()));
  expect(result.current.loaded).toBe(true);
  expect(result.current.sceneReady).toBe(false);
  receive({ kind: "scene", status: "error" });
  expect(result.current.sceneError).toContain("3D 화면");
  receive({ kind: "scene", status: "ready" });
  expect(result.current.sceneReady).toBe(true);
  expect(result.current.sceneError).toBeNull();
});

it("offers recovery when the renderer never signals readiness and clears the timeout on unmount", async () => {
  jest.useFakeTimers();
  const { result, unmount } = setup();
  await act(async () => {});
  act(() => jest.advanceTimersByTime(30000));
  expect(result.current.sceneError).toContain("늦어지고");
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
it("catches up an initially empty room and never re-emits an acknowledged own post", async () => {
  const { receive, target } = setup();
  receive({ kind: "ready" });
  await waitFor(() =>
    expect(target.postMessage.mock.calls.some(([message]) => message.kind === "snapshot")).toBe(
      true
    )
  );
  postSparring.mockResolvedValue({ id: 1 });
  getSparringPosts.mockResolvedValue({ items: [post], nextCursor: null, hasNext: false });
  receive({
    kind: "command",
    action: "post",
    requestId: "rpc1",
    payload: { text: post.text, replyToId: null, postId: "bc2eb62e-b004-4b9c-8bde-dcd9fd86be72" }
  });
  await waitFor(() =>
    expect(
      target.postMessage.mock.calls.some(
        ([message]) => message.kind === "result" && message.requestId === "rpc1"
      )
    ).toBe(true)
  );
  expect(getSparringPosts).toHaveBeenCalledWith("1", { size: 1, afterId: 0 });
  getSparring.mockResolvedValue({ ...topic, revision: 2 });
  act(() => Stream.instances.at(-1).emit("update", streamData([post], 2)));
  expect(getSparringPosts).toHaveBeenCalledTimes(1);
  const snapshots = target.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.kind === "snapshot");
  expect(snapshots.every((message) => message.fresh.length === 0)).toBe(true);
});

it("queues rapid submissions in order while suppressing their own SSE launches", async () => {
  const { receive, target, result } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const second = { ...post, id: 2, text: "다음 한마디" };
  const pending = [];
  postSparring.mockImplementation(
    () => new Promise((resolve) => pending.push(resolve))
  );
  for (const [index, text] of [post.text, second.text].entries()) {
    receive({
      kind: "command",
      action: "post",
      requestId: `rpc${index + 1}`,
      payload: {
        text,
        replyToId: null,
        postId: `bc2eb62e-b004-4b9c-8bde-dcd9fd86be7${index + 1}`
      }
    });
  }
  await waitFor(() => expect(postSparring).toHaveBeenCalledTimes(1));
  getSparringPosts.mockResolvedValue({ items: [post], nextCursor: null, hasNext: false });
  await act(async () => pending[0]({ id: 1 }));
  await waitFor(() =>
    expect(target.postMessage.mock.calls.some(
      ([message]) => message.kind === "result" && message.requestId === "rpc1"
    )).toBe(true)
  );
  await waitFor(() => expect(postSparring).toHaveBeenCalledTimes(2));
  expect(postSparring.mock.calls.map(([, payload]) => payload.text)).toEqual([post.text, second.text]);
  target.postMessage.mockClear();
  getSparring.mockResolvedValue({ ...topic, revision: 2 });
  getSparringPosts.mockResolvedValue({ items: [second], nextCursor: null, hasNext: false });
  act(() => Stream.instances.at(-1).emit("update", streamData([second], 2)));
  await waitFor(() => expect(target.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "snapshot",
      state: expect.objectContaining({ posts: expect.arrayContaining([
        expect.objectContaining({ id: "2" })
      ]) }),
      fresh: []
    }),
    window.location.origin
  ));
  await act(async () => pending[1]({ id: 2 }));
  await waitFor(() => expect(target.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "result", requestId: "rpc2", result: expect.objectContaining({ id: "2" }) }),
    window.location.origin
  ));
});

it("keeps newer streamed totals but accepts personal vote state from a slower HTTP response", async () => {
  const { receive, target, result } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let finishVote;
  getSparring.mockImplementationOnce(() => new Promise(resolve => { finishVote = resolve; }));
  receive({ kind: "command", action: "vote", requestId: "vote1", payload: { side: "b" } });
  await waitFor(() => expect(finishVote).toBeDefined());
  act(() => Stream.instances.at(-1).emit("update", streamData([], 4, { votesA: 2, votesB: 3 })));
  await act(async () => finishVote({ ...topic, revision: 3, votesA: 0, votesB: 1, mySide: "CORAL" }));
  expect(snapshots(target).at(-1)).toMatchObject({ state: { mySide: "b", topic: { revision: 4 }, balance: { a: 2, b: 3 } } });
});

it("does not let a later vote overtake an unfinished post even after the iframe stops waiting", async () => {
  const { receive, target, result } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let finishPost;
  postSparring.mockImplementation(() => new Promise(resolve => { finishPost = resolve; }));
  receive({
    kind: "command", action: "post", requestId: "slow-post",
    payload: { text: post.text, replyToId: null, postId: "bc2eb62e-b004-4b9c-8bde-dcd9fd86be72" }
  });
  await waitFor(() => expect(postSparring).toHaveBeenCalledTimes(1));
  receive({ kind: "command", action: "vote", requestId: "later-vote", payload: { side: "b" } });
  await act(async () => {});
  expect(voteSparring).not.toHaveBeenCalled();
  getSparringPosts.mockResolvedValue({ items: [post], nextCursor: null, hasNext: false });
  await act(async () => finishPost({ id: 1 }));
  await waitFor(() => expect(voteSparring).toHaveBeenCalledWith("1", "CORAL"));
  const results = target.postMessage.mock.calls.map(([message]) => message)
    .filter(message => message.kind === "result").map(message => message.requestId);
  expect(results[0]).toBe("slow-post");
});

it("continues the write queue after a failed request but discards queued writes after unmount", async () => {
  const { receive, result, unmount } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let failFirst, finishSecond;
  postSparring.mockImplementationOnce(() => new Promise((_resolve, reject) => { failFirst = reject; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
  const send = index => receive({
    kind: "command", action: "post", requestId: `queued-${index}`,
    payload: { text: `한마디 ${index}`, replyToId: null, postId: `bc2eb62e-b004-4b9c-8bde-dcd9fd86be7${index}` }
  });
  send(1); send(2);
  await waitFor(() => expect(postSparring).toHaveBeenCalledTimes(1));
  await act(async () => failFirst(new Error("연결 실패")));
  await waitFor(() => expect(postSparring).toHaveBeenCalledTimes(2));
  send(3);
  unmount();
  getSparringPosts.mockResolvedValue({ items: [post], nextCursor: null, hasNext: false });
  await act(async () => finishSecond({ id: 1 }));
  expect(postSparring).toHaveBeenCalledTimes(2);
});
