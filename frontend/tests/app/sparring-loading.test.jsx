import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SparringDetailPage } from "../../src/pages/sparring/SparringDetailPage";
import { ArenaPreview } from "../../src/pages/sparring/ArenaPreview";
import { useAuth } from "../../src/features/auth";
import { getSparring, getSparringPosts } from "../../src/features/sparring/api";
import { playgroundPeriod } from "../../public/sparring-arena/src/playground-sky.js";

jest.mock("react-router", () => ({
  useParams: () => ({ topicId: "1" }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn(), storeReturnTarget: jest.fn() }));
jest.mock("../../public/sparring-arena/src/playground-sky.js", () => ({ playgroundPeriod: jest.fn() }));
jest.mock("../../src/features/sparring/api", () => ({
  ...jest.requireActual("../../src/features/sparring/api"),
  getSparring: jest.fn(), getSparringPosts: jest.fn()
}));
const topic = { id: 1, title: "점심 토론", a: "기다려", b: "다른 곳", votesA: 1, votesB: 0, postCount: 0, revision: 1 };
let stream;
beforeEach(() => {
  jest.clearAllMocks();
  playgroundPeriod.mockReturnValue("day");
  localStorage.clear();
  global.EventSource = class {
    constructor() { this.listeners = {}; stream = this; }
    addEventListener(kind, listener) { this.listeners[kind] = listener; }
    close() {}
  };
  useAuth.mockReturnValue({ status: "anonymous", member: null, login: jest.fn() });
  getSparring.mockResolvedValue(topic);
  getSparringPosts.mockResolvedValue({ items: [], nextCursor: null, hasNext: false });
});
it("enables follow camera by default and persists opting out without replacing the room or refetching messages", async () => {
  const { container, unmount } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  const toggle = container.querySelector(".sparring-camera-switch");
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(toggle).toBeDisabled();
  receive(frame, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(frame, { kind: "scene", status: "ready" });
  await enter(frame);
  expect(send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind: "clash-camera", value: true }, window.location.origin);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(toggle).toHaveAttribute("data-ph-capture-attribute-action", "sparring_clash_camera_toggle");
  expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "clash-camera", value: false }, window.location.origin);
  expect(container.querySelector("iframe")).toBe(frame);
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).not.toHaveBeenCalled();
  unmount(); render(<SparringDetailPage />);
  expect(document.querySelector(".sparring-camera-switch")).toHaveAttribute("aria-checked", "false");
  await act(async () => {});
});
async function enter(frame) {
  frame.scrollIntoView = jest.fn();
  expect(frame).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  await waitFor(() => expect(frame).not.toHaveAttribute("inert"), { timeout: 2000 });
}
function receiveSnapshot() {
  act(() => {
    stream.onopen?.();
    stream.listeners.snapshot({ data: JSON.stringify({
      revision: topic.revision, votesA: topic.votesA, votesB: topic.votesB,
      postCount: topic.postCount, posts: []
    }) });
  });
}
function receive(frame, message) {
  act(() => window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin: window.location.origin,
    data: { channel: "jarihana-sparring", ...message }
  })));
}
it("switches only the view without remounting the iframe or refetching the discussion", async () => {
  const { container } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  expect(container.querySelector(".sparring-view-switch button")).toBeDisabled();
  receive(frame, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(frame, { kind: "scene", status: "ready" });
  await enter(frame);
  expect(screen.getByRole("button", { name: "아담한 구도" })).toHaveAttribute("aria-pressed", "true");
  expect(send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind: "view", value: "compact" }, window.location.origin);
  expect(screen.queryByRole("button", { name: "참고 구도" })).not.toBeInTheDocument();
  for (const [value, label] of [["original", "기존 구도"], ["compact", "아담한 구도"]]) {
    const button = screen.getByRole("button", { name: label });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-ph-capture-attribute-action", "sparring_view_change");
    expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "view", value }, window.location.origin);
    expect(container.querySelector("iframe")).toBe(frame);
  }
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).not.toHaveBeenCalled();
});
it("shows a preview during authentication without loading a room for the wrong actor", () => {
  useAuth.mockReturnValue({ status: "loading" });
  const { container } = render(<SparringDetailPage />);
  expect(screen.getByText("토론을 불러오고 있어요")).toBeInTheDocument();
  expect(container.querySelector(".sparring-entry")).toBeInTheDocument();
  expect(container.querySelector("iframe")).toBeNull();
  expect(getSparring).not.toHaveBeenCalled();
});
it.each(["day", "sunset", "night"])("shows the matching desktop and mobile previews when the playground period is %s", period => {
  playgroundPeriod.mockReturnValue(period);

  const { container } = render(<ArenaPreview />);

  const mobile = container.querySelector("picture source");
  const desktop = container.querySelector("picture img");
  expect(mobile).toHaveAttribute("media", "(max-width: 700px)");
  expect(mobile).toHaveAttribute("srcset", `/sparring-arena/assets/arena-preview-planet-${period}-mobile.webp`);
  expect(desktop).toHaveAttribute("src", `/sparring-arena/assets/arena-preview-planet-${period}-desktop.webp`);
});
it("recreates the disposed arena after session restoration even for the same member", async () => {
  const member = { id: 12 };
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "authenticated", member, login, sessionVersion: 1 });
  const { container, rerender } = render(<SparringDetailPage />);
  const first = container.querySelector("iframe");
  receive(first, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(first).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(first, { kind: "scene", status: "ready" });
  await enter(first);
  expect(first).not.toHaveAttribute("inert");
  const oldSource = first.contentWindow;
  const oldStream = stream;
  const close = jest.spyOn(oldStream, "close");

  useAuth.mockReturnValue({ status: "authenticated", member, login, sessionVersion: 2 });
  rerender(<SparringDetailPage />);
  const replacement = container.querySelector("iframe");
  expect(replacement).not.toBe(first);
  expect(close).toHaveBeenCalledTimes(1);
  expect(replacement).toHaveAttribute("inert");
  act(() => window.dispatchEvent(new MessageEvent("message", {
    source: oldSource, origin: window.location.origin,
    data: { channel: "jarihana-sparring", kind: "scene", status: "ready" }
  })));
  expect(replacement).toHaveAttribute("inert");
  receive(replacement, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(replacement).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(replacement, { kind: "scene", status: "ready" });
  await enter(replacement);
  expect(replacement).not.toHaveAttribute("inert");
  expect(getSparring).toHaveBeenCalledTimes(2);
});
it("keeps text and inputs covered after data and iframe load until the first 3D frame is ready", async () => {
  const { container } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  expect(frame).toHaveAttribute("inert");
  expect(frame).toHaveAttribute("aria-hidden", "true");
  fireEvent.load(frame);
  receive(frame, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  expect(container.querySelector(".sparring-entry")).toBeInTheDocument();
  expect(container.querySelector(".sparring-detail__viewport")).toHaveAttribute("data-ready", "false");
  receive(frame, { kind: "scene", status: "ready" });
  await enter(frame);
  expect(frame).not.toHaveAttribute("inert");
  expect(frame).toHaveAttribute("aria-hidden", "false");
  expect(container.querySelector(".sparring-entry")).toBeNull();
  expect(container.querySelector(".sparring-detail__viewport")).toHaveAttribute("data-ready", "true");
});
it("offers a retry after a texture or renderer failure and keeps the replacement iframe covered", async () => {
  const { container } = render(<SparringDetailPage />);
  const first = container.querySelector("iframe");
  receive(first, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(first).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(first, { kind: "scene", status: "error" });
  expect(screen.getByRole("alert")).toHaveTextContent("3D 화면을 불러오지 못했어요");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(container.querySelector("iframe")).not.toBe(first);
  expect(container.querySelector("iframe")).toHaveAttribute("inert");
  expect(container.querySelector(".sparring-entry")).toBeInTheDocument();
  const replacement = container.querySelector("iframe");
  receive(replacement, { kind: "ready" });
  receiveSnapshot();
  await waitFor(() => expect(replacement).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  expect(replacement).toHaveAttribute("inert");
  receive(replacement, { kind: "scene", status: "ready" });
  await enter(replacement);
  expect(replacement).not.toHaveAttribute("inert");
  expect(getSparringPosts).not.toHaveBeenCalled();
});
it("shows a recoverable data error instead of exposing the incomplete arena", async () => {
  getSparring.mockRejectedValue(new Error("토론을 불러오지 못했어요"));
  const { container } = render(<SparringDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("토론을 불러오지 못했어요");
  expect(container.querySelector("iframe")).toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeEnabled();
});

it("waits for the SSE snapshot after topic metadata arrives without fetching posts", async () => {
  const { container } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  receive(frame, { kind: "ready" });
  await act(async () => {});
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).not.toHaveBeenCalled();
  expect(frame).toHaveAttribute("inert");
  expect(send.mock.calls.some(([message]) => message.kind === "snapshot")).toBe(false);
  receiveSnapshot();
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  expect(send.mock.calls.some(([message]) => message.kind === "snapshot")).toBe(true);
  expect(frame).toHaveAttribute("inert");
  receive(frame, { kind: "scene", status: "ready" });
  await enter(frame);
  expect(frame).not.toHaveAttribute("inert");
});
