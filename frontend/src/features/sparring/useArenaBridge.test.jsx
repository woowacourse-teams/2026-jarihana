import { act, renderHook, waitFor } from "@testing-library/react";
import { useArenaBridge } from "./useArenaBridge";
import { getSparring, getSparringPosts, postSparring } from "./api";

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
  hook.result.current.frame.current = { contentWindow: target, style: {} };
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
it("rejects foreign origins, validates payloads and closes the stream on unmount", async () => {
  const { receive, target, unmount } = setup();
  receive({ kind: "ready" }, "https://untrusted.example");
  expect(getSparring).not.toHaveBeenCalled();
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
