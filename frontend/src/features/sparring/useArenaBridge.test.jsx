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
  constructor() {
    this.listeners = {};
    this.close = jest.fn();
    Stream.instances.push(this);
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

describe("background catch-up", () => {
  let hidden;
  const snapshots = target => target.postMessage.mock.calls.map(([message]) => message).filter(message => message.kind === "snapshot");
  function visibility(value) {
    hidden = value;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  }
  beforeEach(() => {
    hidden = false;
    jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  });
  afterEach(() => jest.restoreAllMocks());

  it("defers hidden revisions, restores every page without live effects, then resumes live messages", async () => {
    const { receive, target, result, unmount } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const stream = Stream.instances.at(-1);
    getSparring.mockClear(); getSparringPosts.mockClear(); target.postMessage.mockClear();
    visibility(true);
    for (let revision = 2; revision <= 251; revision++) {
      await act(async () => stream.listeners.revision({ data: JSON.stringify({ revision }) }));
    }
    expect(getSparring).not.toHaveBeenCalled();
    expect(getSparringPosts).not.toHaveBeenCalled();
    expect(snapshots(target)).toHaveLength(0);

    const missed = Array.from({ length: 250 }, (_, index) => ({ ...post, id: index + 1, authorId: 2 }));
    getSparring.mockResolvedValue({ ...topic, revision: 251, postCount: 250 });
    getSparringPosts.mockImplementation(async (_topicId, { afterId }) => {
      const items = missed.filter(item => item.id > afterId).slice(0, 100);
      return { items, hasNext: items.at(-1)?.id < 250, nextCursor: null };
    });
    visibility(false);
    await waitFor(() => expect(snapshots(target).at(-1)?.state.posts).toHaveLength(250));
    expect(getSparring).toHaveBeenCalledTimes(1);
    expect(getSparringPosts.mock.calls.map(([, query]) => query.afterId)).toEqual([0, 100, 200]);
    expect(snapshots(target)).toHaveLength(1);
    expect(snapshots(target)[0].fresh).toEqual([]);

    getSparring.mockResolvedValue({ ...topic, revision: 252, postCount: 251 });
    getSparringPosts.mockResolvedValue({ items: [{ ...post, id: 251, authorId: 2 }], hasNext: false });
    await act(async () => stream.listeners.revision({ data: '{"revision":252}' }));
    expect(snapshots(target).at(-1).fresh).toEqual(["251"]);
    unmount();
    getSparring.mockClear(); visibility(true); visibility(false);
    expect(getSparring).not.toHaveBeenCalled();
  });

  it("does not animate a request started before hiding even when it resolves after returning", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let finish;
    getSparringPosts.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    getSparring.mockResolvedValue({ ...topic, revision: 2, postCount: 1 });
    await act(async () => Stream.instances.at(-1).listeners.revision({ data: '{"revision":2}' }));
    visibility(true); visibility(false);
    await act(async () => finish({ items: [{ ...post, authorId: 2 }], hasNext: false }));
    expect(snapshots(target).at(-1).state.posts).toHaveLength(1);
    expect(snapshots(target).every(message => message.fresh.length === 0)).toBe(true);
  });

  it("keeps burst messages in history but limits immediate effects to the four latest", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    getSparring.mockResolvedValue({ ...topic, revision: 81, postCount: 80 });
    getSparringPosts.mockResolvedValue({ items: Array.from({ length: 80 }, (_, i) => ({ ...post, id: i + 1, authorId: 2 })), hasNext: false });
    await act(async () => Stream.instances.at(-1).listeners.revision({ data: '{"revision":81}' }));
    const latest = snapshots(target).at(-1);
    expect(latest.state.posts).toHaveLength(80);
    expect(latest.fresh).toEqual(["77", "78", "79", "80"]);
  });

  it("stops an in-flight catch-up while hidden and retains the last completed page for resuming", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    getSparring.mockResolvedValue({ ...topic, revision: 3, postCount: 2 });
    let finishPage;
    getSparringPosts
      .mockResolvedValueOnce({ items: [post], hasNext: true })
      .mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }));
    await act(async () => Stream.instances.at(-1).listeners.revision({ data: '{"revision":3}' }));
    target.postMessage.mockClear();
    visibility(true);
    await act(async () => finishPage({ items: [{ ...post, id: 2 }], hasNext: true }));
    expect(snapshots(target)).toHaveLength(0);
    getSparringPosts.mockClear();
    getSparringPosts.mockResolvedValue({ items: [{ ...post, id: 2 }], hasNext: false });
    visibility(false);
    await waitFor(() => expect(snapshots(target).at(-1)?.state.posts).toHaveLength(2));
    expect(getSparringPosts).toHaveBeenCalledTimes(1);
    expect(getSparringPosts).toHaveBeenCalledWith("1", { size: 100, afterId: 1 });
    expect(snapshots(target)[0].fresh).toEqual([]);
  });

  it("keeps missed effects suppressed when the first resume request fails", async () => {
    const { receive, target, result } = setup();
    receive({ kind: "ready" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    visibility(true);
    getSparring.mockRejectedValueOnce(new Error("offline"));
    visibility(false);
    await waitFor(() => expect(result.current.error).toBe("offline"));
    getSparring.mockResolvedValue({ ...topic, revision: 2, postCount: 1 });
    getSparringPosts.mockResolvedValue({ items: [post], hasNext: false });
    await act(async () => Stream.instances.at(-1).onopen());
    expect(result.current.error).toBeNull();
    expect(snapshots(target).at(-1).state.posts).toHaveLength(1);
    expect(snapshots(target).at(-1).fresh).toEqual([]);
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
  expect(Stream.instances).toHaveLength(0);
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

it("starts both initial requests before iframe readiness and delivers buffered data on handshake", async () => {
  let finishTopic, finishPosts;
  getSparring.mockImplementationOnce(() => new Promise(resolve => { finishTopic = resolve; }));
  getSparringPosts.mockImplementationOnce(() => new Promise(resolve => { finishPosts = resolve; }));
  const { result, target, receive } = setup();
  expect(getSparring).toHaveBeenCalledWith("1");
  expect(getSparringPosts).toHaveBeenCalledWith("1", { size: 30 });
  await act(async () => finishPosts({ items: [post], nextCursor: "older", hasNext: true }));
  expect(result.current.loaded).toBe(false);
  await act(async () => finishTopic(topic));
  expect(result.current.loaded).toBe(true);
  expect(result.current.sceneReady).toBe(false);
  expect(target.postMessage).not.toHaveBeenCalled();
  receive({ kind: "ready" });
  expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    kind: "snapshot",
    state: expect.objectContaining({ posts: [expect.objectContaining({ id: "1" })], more: { all: true, mine: false } })
  }), window.location.origin);
  receive({ kind: "scene", status: "ready" }, "https://untrusted.example");
  expect(result.current.sceneReady).toBe(false);
  receive({ kind: "scene", status: "ready" });
  expect(result.current.sceneReady).toBe(true);
});

it("keeps the preview pending until both initial responses and the first rendered scene arrive", async () => {
  let finishPosts;
  getSparringPosts.mockImplementationOnce(() => new Promise(resolve => { finishPosts = resolve; }));
  const { result, target, receive } = setup();
  receive({ kind: "ready" });
  await act(async () => {});
  expect(result.current.loaded).toBe(false);
  expect(target.postMessage.mock.calls.some(([message]) => message.kind === "snapshot")).toBe(false);
  await act(async () => finishPosts({ items: [], nextCursor: null, hasNext: false }));
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
  expect(getSparringPosts).toHaveBeenCalledWith("1", { size: 100, afterId: 0 });
  getSparring.mockResolvedValue({ ...topic, revision: 2 });
  act(() => Stream.instances.at(-1).listeners.revision({ data: '{"revision":2}' }));
  await waitFor(() => expect(getSparringPosts.mock.calls.length).toBeGreaterThan(2));
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
  act(() => Stream.instances.at(-1).listeners.revision({ data: '{"revision":2}' }));
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

it("keeps a newer vote when an older refresh finishes later", async () => {
  const { receive, target } = setup();
  receive({ kind: "ready" });
  await waitFor(() =>
    expect(target.postMessage.mock.calls.some(([message]) => message.kind === "snapshot")).toBe(
      true
    )
  );
  let finishRefresh;
  getSparring.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      })
  );
  act(() => Stream.instances.at(-1).listeners.revision({ data: '{"revision":2}' }));
  await waitFor(() => expect(finishRefresh).toBeDefined());
  getSparring.mockResolvedValue({ ...topic, votesA: 2, revision: 3 });
  receive({ kind: "command", action: "vote", requestId: "vote1", payload: { side: "a" } });
  await waitFor(() =>
    expect(
      target.postMessage.mock.calls.some(
        ([message]) => message.kind === "result" && message.requestId === "vote1"
      )
    ).toBe(true)
  );
  const afterVote = target.postMessage.mock.calls.length;
  await act(async () => finishRefresh({ ...topic, revision: 2 }));
  const snapshots = target.postMessage.mock.calls
    .slice(afterVote)
    .map(([message]) => message)
    .filter((message) => message.kind === "snapshot");
  expect(snapshots.length).toBeGreaterThan(0);
  expect(
    snapshots.every(
      (message) => message.state.topic.revision === 3 && message.state.balance.a === 2
    )
  ).toBe(true);
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
