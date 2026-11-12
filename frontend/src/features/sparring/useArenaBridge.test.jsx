import { act, renderHook, waitFor } from "@testing-library/react";
import { AVATAR_PRESETS } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { useArenaBridge } from "./useArenaBridge";
import { getSparring, getSparringAvatarPools, getSparringPosts, postSparring, voteSparring } from "./api";

jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  getSparring: jest.fn(),
  getSparringAvatarPools: jest.fn(),
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
  getSparringAvatarPools.mockResolvedValue({ mint: [], coral: [] });
  getSparringPosts.mockResolvedValue({ items: [], nextCursor: null, hasNext: false });
});
function setup(actor = member) {
  const hook = renderHook(
    ({ actorAppearance }) => useArenaBridge({ topicId: "1", member: actor, login, retry: 0, actorAppearance }),
    { initialProps: { actorAppearance: null } }
  );
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

it("publishes a late composer appearance without restarting the stream or replaying posts", async () => {
  const { receive, result, rerender, target } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(snapshots(target).at(-1).state.actorAppearance).toBeNull();
  const appearance = AVATAR_PRESETS[0].appearance;
  rerender({ actorAppearance: appearance });
  expect(snapshots(target).at(-1)).toMatchObject({ fresh: [], state: { actorAppearance: appearance } });
  expect(Stream.instances).toHaveLength(1);
});

it("refreshes the separate decorative pools once for a burst of votes and never for post-only updates", async () => {
  const mint = AVATAR_PRESETS[0].appearance;
  const coral = AVATAR_PRESETS[1].appearance;
  getSparringAvatarPools.mockResolvedValueOnce({ mint: [mint], coral: [] });
  const { receive, result, target } = setup();
  receive({ kind: "ready" });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await waitFor(() => expect(snapshots(target).at(-1).state.avatarPools).toEqual({ a: [mint], b: [] }));
  const stream = Stream.instances.at(-1);
  act(() => stream.emit("update", streamData([post], 2)));
  await act(async () => new Promise(resolve => setTimeout(resolve, 220)));
  expect(getSparringAvatarPools).toHaveBeenCalledTimes(1);

  getSparringAvatarPools.mockResolvedValueOnce({ mint: [], coral: [coral] });
  act(() => {
    // The first update includes two switches with no change in the aggregate vote counts.
    stream.emit("update", streamData([], 4, { postCount: 1 }));
    stream.emit("update", streamData([], 5, { postCount: 1, votesA: 0, votesB: 1 }));
  });
  await waitFor(() => expect(snapshots(target).at(-1).state.avatarPools).toEqual({ a: [], b: [coral] }));
  expect(getSparringAvatarPools).toHaveBeenCalledTimes(2);
});

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

  it("forwards a streamed reply with the appearance and side of each actual author", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const mint = AVATAR_PRESETS[0].appearance;
    const coral = AVATAR_PRESETS[1].appearance;
    const reply = {
      ...post, id: 2, authorId: 2, side: "CORAL", appearance: coral,
      replyTo: { ...post, appearance: mint }
    };
    act(() => Stream.instances.at(-1).emit("update", streamData([reply], 3, { postCount: 2 })));
    expect(snapshots(target).at(-1).livePosts).toEqual([expect.objectContaining({
      authorId: "2", side: "b", appearance: coral,
      replyTo: expect.objectContaining({ authorId: "1", side: "a", appearance: mint })
    })]);
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
  const appearance = AVATAR_PRESETS[0].appearance;
  getSparringPosts.mockResolvedValue({ items: [{ ...post, appearance }], nextCursor: null, hasNext: false });
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
  expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    kind: "result", requestId: "rpc1", result: expect.objectContaining({ appearance })
  }), window.location.origin);
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

describe("demand-driven replay history", () => {
  const items = (first, last, side = "MINT") => Array.from({ length: last - first + 1 }, (_, index) => ({ ...post, id: first + index, side }));
  const advance = milliseconds => act(async () => { await jest.advanceTimersByTimeAsync(milliseconds); });
  const currentHistory = target => snapshots(target).at(-1).state.history;
  const historyIds = target => currentHistory(target).posts.map(item => Number(item.id));
  const pageFor = (all, query) => {
    const beforeId = query.cursor ? Number(query.cursor.replace("before-", "")) : Infinity;
    const remaining = all.filter(item => item.side === query.side && item.id <= query.throughId && item.id < beforeId)
      .sort((a, b) => b.id - a.id);
    const batch = remaining.slice(0, query.size), hasNext = remaining.length > query.size;
    return { items: batch, nextCursor: hasNext ? `before-${batch.at(-1).id}` : null, hasNext };
  };
  const store = all => getSparringPosts.mockImplementation((_id, query) => Promise.resolve(pageFor(all, query)));
  let hidden;
  const visibility = value => {
    hidden = value;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  };
  async function start(initial = items(61, 90), actor = member) {
    Stream.autoSnapshot = false;
    const hook = setup(actor);
    await act(async () => {
      Stream.instances.at(-1).onopen();
      Stream.instances.at(-1).emit("snapshot", streamData(initial, 1, { postCount: initial.at(-1)?.id ?? 0 }));
    });
    hook.receive({ kind: "ready" });
    return hook;
  }
  beforeEach(() => {
    jest.useFakeTimers();
    hidden = false;
    jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it("starts both sides latest first when the latest 60 of 89 posts are all mint", async () => {
    const all = [...items(1, 11, "CORAL"), ...items(12, 89)];
    store(all);
    const { receive, target } = await start(all.slice(-30));
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(historyIds(target).slice(0, 6)).toEqual([89, 11, 88, 10, 87, 9]);
    expect(currentHistory(target).posts.filter(item => item.side === "b").map(item => Number(item.id)))
      .toEqual(items(1, 11).map(item => item.id).reverse());
    expect(getSparringPosts.mock.calls).toEqual([
      ["1", { size: 30, side: "MINT", throughId: 89 }],
      ["1", { size: 30, side: "CORAL", throughId: 89 }]
    ]);
    expect(snapshots(target).at(-1).fresh).toEqual([]);
  });

  it("finishes both independent cursors without repeats before starting the next cycle", async () => {
    const all = [...items(1, 44, "CORAL"), ...items(45, 119)];
    store(all);
    const { receive, target } = await start(all.slice(-30));
    await advance(1000);
    expect(getSparringPosts).not.toHaveBeenCalled();
    const played = [];
    for (let page = 0; page < 4; page++) {
      receive({ kind: "history", page }); await advance(0);
      played.push(...currentHistory(target).posts);
    }
    expect(played).toHaveLength(119);
    expect(new Set(played.map(item => item.id)).size).toBe(119);
    for (const [side, expected] of [["a", items(45, 119)], ["b", items(1, 44)]]) {
      expect(played.filter(item => item.side === side).map(item => Number(item.id)))
        .toEqual(expected.map(item => item.id).reverse());
    }
    expect(played.slice(28, 34).map(item => item.side)).toEqual(["a", "b", "a", "b", "a", "b"]);
    expect(getSparringPosts.mock.calls.some(([, query]) => query.side === "MINT" && query.cursor === "before-90")).toBe(true);
    expect(getSparringPosts.mock.calls.some(([, query]) => query.side === "CORAL" && query.cursor === "before-15")).toBe(true);
    receive({ kind: "history", page: 4 }); await advance(0);
    expect(historyIds(target).slice(0, 4)).toEqual([119, 44, 118, 43]);
  });

  it("keeps the cycle boundary and cursor during live posts and SSE reconnection", async () => {
    const all = items(1, 90);
    store(all);
    const { receive, target } = await start();
    receive({ kind: "history", page: 0 }); await advance(0);
    const stream = Stream.instances.at(-1);
    all.push(...items(91, 130));
    act(() => stream.emit("update", streamData([{ ...post, id: 91, authorId: 2 }], 2, { postCount: 91 })));
    expect(snapshots(target).at(-1).fresh).toEqual(["91"]);
    act(() => {
      stream.onerror(); stream.onopen();
      stream.emit("snapshot", streamData(items(101, 130), 3, { postCount: 130 }));
    });
    expect(snapshots(target).at(-1).fresh).toEqual([]);
    receive({ kind: "history", page: 1 }); await advance(0);
    expect(historyIds(target)).toEqual(items(31, 60).map(item => item.id).reverse());
    expect(getSparringPosts).toHaveBeenLastCalledWith("1", { size: 30, side: "MINT", throughId: 90, cursor: "before-61" });
    receive({ kind: "history", page: 2 }); await advance(0);
    expect(historyIds(target)).toEqual(items(1, 30).map(item => item.id).reverse());
    receive({ kind: "history", page: 3 }); await advance(0);
    expect(historyIds(target)).toEqual(items(101, 130).map(item => item.id).reverse());
    expect(getSparringPosts.mock.calls.at(-2)[1]).toEqual({ size: 30, side: "MINT", throughId: 130 });
  });

  it("preserves a partial batch when the other side fails and retries only that request", async () => {
    const all = [...items(1, 40, "CORAL"), ...items(41, 80)];
    let coralFailures = 2;
    getSparringPosts.mockImplementation((_id, query) => query.side === "CORAL" && coralFailures-- > 0
      ? Promise.reject(new Error("offline")) : Promise.resolve(pageFor(all, query)));
    const { receive, target } = await start(all.slice(-30));
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(currentHistory(target).page).toBe(0);
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
    await advance(999); expect(getSparringPosts).toHaveBeenCalledTimes(2);
    await advance(1); expect(getSparringPosts).toHaveBeenCalledTimes(3);
    visibility(true); await advance(5000);
    expect(getSparringPosts).toHaveBeenCalledTimes(3);
    visibility(false); await advance(0);
    expect(getSparringPosts).toHaveBeenCalledTimes(4);
    expect(getSparringPosts.mock.calls.slice(1).map(([, query]) => query)).toEqual(Array(3).fill({ size: 30, side: "CORAL", throughId: 80 }));
    expect(historyIds(target).slice(0, 6)).toEqual([80, 40, 79, 39, 78, 38]);
    expect(new Set(historyIds(target)).size).toBe(30);
  });

  it("includes a confirmed own post in the next cycle even before its SSE update", async () => {
    const all = items(1, 3);
    getSparringPosts.mockImplementation((_id, query) => Promise.resolve(query.afterId == null
      ? pageFor(all, query)
      : { items: all.filter(item => item.id > query.afterId).slice(0, query.size), hasNext: false, nextCursor: null }));
    const { receive, target } = await start(all);
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(historyIds(target)).toEqual([3, 2, 1]);
    all.push({ ...post, id: 4 });
    postSparring.mockResolvedValueOnce({ id: 4 });
    receive({
      kind: "command", action: "post", requestId: "own-before-stream",
      payload: { text: post.text, replyToId: null, postId: "bc2eb62e-b004-4b9c-8bde-dcd9fd86be72" }
    });
    await advance(0);
    expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "result", requestId: "own-before-stream", result: expect.objectContaining({ id: "4" })
    }), window.location.origin);
    receive({ kind: "history", page: 1 }); await advance(0);
    expect(historyIds(target)).toEqual([4, 3, 2, 1]);
    expect(getSparringPosts.mock.calls.at(-2)[1]).toEqual({ size: 30, side: "MINT", throughId: 4 });
  });

  it("shares in-flight work and rejects stale, future and untrusted acknowledgements", async () => {
    const all = items(1, 90);
    let finishHistory;
    store(all);
    getSparringPosts.mockImplementationOnce((_id, query) => new Promise(resolve => { finishHistory = () => resolve(pageFor(all, query)); }));
    const { receive, target } = await start();
    receive({ kind: "history", page: 0 }, "https://untrusted.example");
    for (const value of [-1, 0.5, 1, "0"]) receive({ kind: "history", page: value });
    await advance(0);
    expect(getSparringPosts).not.toHaveBeenCalled();
    receive({ kind: "history", page: 0 }); receive({ kind: "history", page: 0 }); await advance(0);
    receive({ kind: "history", page: 0 });
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    await act(async () => finishHistory());
    expect(currentHistory(target).page).toBe(1);
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
    receive({ kind: "history", page: 0 }); receive({ kind: "history", page: 2 }); await advance(0);
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
  });

  it("pauses history while hidden and resumes an in-flight page without losing its cursor", async () => {
    const all = items(1, 90);
    let finishHistory;
    store(all);
    getSparringPosts.mockImplementationOnce((_id, query) => new Promise(resolve => { finishHistory = () => resolve(pageFor(all, query)); }));
    const { receive, target } = await start();
    receive({ kind: "history", page: 0 }); visibility(true); await advance(1000);
    expect(getSparringPosts).not.toHaveBeenCalled();
    visibility(false); await advance(0);
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    visibility(true); target.postMessage.mockClear();
    await act(async () => finishHistory());
    expect(snapshots(target)).toEqual([]);
    visibility(false); await advance(0);
    expect(historyIds(target)).toEqual(items(61, 90).map(item => item.id).reverse());
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
  });

  it("discards late results after unmount and clears scheduled work", async () => {
    let finishHistory;
    getSparringPosts.mockImplementationOnce(() => new Promise(resolve => { finishHistory = resolve; }));
    const { receive, target, unmount } = await start();
    receive({ kind: "history", page: 0 }); await advance(0);
    unmount(); target.postMessage.mockClear();
    await act(async () => finishHistory(pageFor(items(1, 90), { size: 30, side: "MINT", throughId: 90 })));
    await advance(10000);
    expect(target.postMessage).not.toHaveBeenCalled();
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([null, "before-61"])("stops on a missing or repeated cursor (%s)", async cursor => {
    const all = items(1, 90);
    store(all);
    const { receive, target } = await start();
    receive({ kind: "history", page: 0 }); await advance(0);
    getSparringPosts.mockResolvedValueOnce({ items: items(31, 60).reverse(), hasNext: true, nextCursor: cursor });
    receive({ kind: "history", page: 1 }); await advance(0);
    const calls = getSparringPosts.mock.calls.length;
    receive({ kind: "history", page: 1 }); await advance(60000);
    expect(getSparringPosts).toHaveBeenCalledTimes(calls);
    expect(currentHistory(target).page).toBe(1);
    expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "failure" }), window.location.origin);
  });

  it.each([
    [{ ...post, id: 91 }],
    [{ ...post, side: "CORAL" }],
    items(1, 2),
    []
  ].map(invalid => [invalid]))("stops when a history page violates its side, boundary or descending progress (%j)", async invalid => {
    getSparringPosts.mockResolvedValueOnce({ items: invalid, hasNext: true, nextCursor: "next" });
    const { receive, target } = await start();
    receive({ kind: "history", page: 0 }); await advance(60000);
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    expect(currentHistory(target).page).toBe(0);
    expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "failure" }), window.location.origin);
  });

  it("does not spin on empty history and resumes demand when posts arrive", async () => {
    const { receive, target } = await start([]);
    receive({ kind: "history", page: 0 }); await advance(10000);
    expect(getSparringPosts).not.toHaveBeenCalled();
    act(() => Stream.instances.at(-1).emit("update", streamData([post], 2, { postCount: 1 })));
    await advance(0);
    const calls = getSparringPosts.mock.calls.length;
    receive({ kind: "history", page: 0 }); await advance(10000);
    expect(getSparringPosts).toHaveBeenCalledTimes(calls);
    store(items(1, 2));
    act(() => Stream.instances.at(-1).emit("update", streamData([{ ...post, id: 2 }], 3, { postCount: 2 })));
    await advance(0);
    expect(historyIds(target)).toEqual([2, 1]);
  });

  it("lets guests read history without including posts newer than the entry snapshot", async () => {
    store(items(1, 110));
    const { receive, target } = await start(items(61, 90), null);
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(historyIds(target)).toEqual(items(61, 90).map(item => item.id).reverse());
    expect(login).not.toHaveBeenCalled();
    expect(snapshots(target).at(-1).state.actorId).toBe("guest");
  });

  it.each(["MINT", "CORAL"])("plays a short %s-only discussion once per complete cycle", async side => {
    const all = items(1, 3, side);
    store(all);
    const { receive, target } = await start(all);
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(historyIds(target)).toEqual([3, 2, 1]);
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
    await advance(10000);
    expect(getSparringPosts).toHaveBeenCalledTimes(2);
    receive({ kind: "history", page: 1 }); await advance(0);
    expect(historyIds(target)).toEqual([3, 2, 1]);
    expect(getSparringPosts).toHaveBeenCalledTimes(4);
  });

  it("cancels a scheduled retry when the room unmounts", async () => {
    getSparringPosts.mockRejectedValue(new Error("offline"));
    const { receive, unmount } = await start();
    receive({ kind: "history", page: 0 }); await advance(0);
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    unmount(); await advance(60000);
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
