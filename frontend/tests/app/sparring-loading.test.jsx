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
jest.mock("../../src/features/avatar/hooks", () => ({ useMyAvatar: () => ({ data: null }) }));
jest.mock("../../public/sparring-arena/src/playground-sky.js", () => ({ playgroundPeriod: jest.fn() }));
jest.mock("../../src/features/sparring/api", () => ({
  ...jest.requireActual("../../src/features/sparring/api"),
  getSparring: jest.fn(), getSparringPosts: jest.fn(), getSparringAvatarPools: jest.fn()
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
async function readyRoom() {
  const result = render(<SparringDetailPage />);
  const frame = result.container.querySelector("iframe");
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  receive(frame, { kind: "ready" }); receiveSnapshot();
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(frame, { kind: "scene", status: "ready" });
  await enter(frame);
  return { ...result, frame, send };
}
function openSettings() {
  const trigger = screen.getByRole("button", { name: "마당 설정 열기" });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.getByRole("dialog", { name: "마당 설정" });
}
it("톱니바퀴로 여는 모달의 기본값은 아담한 구도·팀당 5명·모든 연출과 겹침 허용이다", async () => {
  const { container, frame, send } = await readyRoom();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const dialog = openSettings();
  expect(dialog).toHaveClass("sparring-create-dialog", "sparring-settings-dialog");
  expect(screen.getByRole("button", { name: "마당 설정 열기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "아담한 구도" })).toHaveAttribute("aria-pressed", "true");
  for (const name of ["패싸움 연출", "받아치기 연출", "말풍선 겹침 허용"]) {
    expect(screen.getByRole("switch", { name })).toHaveAttribute("aria-checked", "true");
  }
  for (const name of ["민트", "코랄"]) expect(screen.getByRole("combobox", { name })).toHaveValue("5");
  for (const [kind, value] of [["view", "compact"], ["brawl", true], ["clash-camera", true], ["speech-overlap", true], ["character-limits", { a: 5, b: 5 }]]) {
    expect(send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind, value }, window.location.origin);
  }
  expect(container.querySelector("iframe")).toBe(frame);
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).not.toHaveBeenCalled();
});
it("설정 모달은 키보드 초점을 가두고 Escape·배경·닫기 버튼으로 닫으며 톱니바퀴로 돌아온다", async () => {
  const { container, frame } = await readyRoom();
  const dialog = openSettings();
  const trigger = screen.getByRole("button", { name: "마당 설정 열기" });
  const close = screen.getByRole("button", { name: "닫기" });
  expect(close).toHaveFocus();
  expect(close).toHaveAttribute("data-ph-capture-attribute-action", "sparring_settings_dismiss");
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("switch", { name: "말풍선 겹침 허용" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  openSettings();
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  openSettings(); fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(dialog).not.toBeInTheDocument();
  expect(container.querySelector("iframe")).toBe(frame);
});
it("구도만 바꿀 때 재생과 연출 선택을 유지하고 새로고침 후에도 복원한다", async () => {
  const { container, frame, send, unmount } = await readyRoom();
  openSettings();
  send.mockClear();
  const original = screen.getByRole("button", { name: "기존 구도" });
  fireEvent.click(original);
  expect(original).toHaveAttribute("aria-pressed", "true");
  expect(original).toHaveAttribute("data-ph-capture-attribute-action", "sparring_view_change");
  expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "view", value: "original" }, window.location.origin);
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "brawl" }), window.location.origin);
  expect(screen.getByRole("switch", { name: "패싸움 연출" })).toHaveAttribute("aria-checked", "true");
  expect(container.querySelector("iframe")).toBe(frame);
  expect(getSparring).toHaveBeenCalledTimes(1);
  unmount();
  await readyRoom(); openSettings();
  expect(screen.getByRole("button", { name: "기존 구도" })).toHaveAttribute("aria-pressed", "true");
});
it.each([
  ["패싸움 연출", "brawl", "sparring_brawl_toggle", "jarihana.sparring.brawl"],
  ["받아치기 연출", "clash-camera", "sparring_clash_camera_toggle", "jarihana.sparring.clash-camera"],
  ["말풍선 겹침 허용", "speech-overlap", "sparring_speech_overlap_toggle", "jarihana.sparring.speech-overlap"]
])("%s을 바꾸고 꺼진 선택을 새로고침 후 복원한다", async (label, kind, action, preference) => {
  const { container, frame, send, unmount } = await readyRoom();
  openSettings();
  const toggle = screen.getByRole("switch", { name: label });
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(toggle).toHaveAttribute("data-ph-capture-attribute-action", action);
  for (const value of [false, true, false]) {
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", String(value));
    expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind, value }, window.location.origin);
    expect(container.querySelector("iframe")).toBe(frame);
  }
  expect(localStorage.getItem(preference)).toBe("off");
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).not.toHaveBeenCalled();
  unmount();
  const restored = await readyRoom(); openSettings();
  expect(screen.getByRole("switch", { name: label })).toHaveAttribute("aria-checked", "false");
  expect(restored.send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind, value: false }, window.location.origin);
});
it("팀별 상한은 5명에서 독립적으로 바꾸고 모드 전환·새로고침 후에도 유지한다", async () => {
  const { container, frame, send, unmount } = await readyRoom(); openSettings();
  const mint = screen.getByRole("combobox", { name: "민트" });
  const coral = screen.getByRole("combobox", { name: "코랄" });
  expect(mint).toHaveValue("5"); expect(coral).toHaveValue("5");
  fireEvent.change(mint, { target: { value: "3" } });
  fireEvent.change(coral, { target: { value: "7" } });
  expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "character-limits", value: { a: 3, b: 7 } }, window.location.origin);
  expect(mint).toHaveAttribute("data-ph-capture-attribute-action", "sparring_character_limit_change");
  fireEvent.click(screen.getByRole("switch", { name: "패싸움 연출" }));
  expect(mint).toHaveValue("3"); expect(coral).toHaveValue("7");
  expect(JSON.parse(localStorage.getItem("jarihana.sparring.character-limits"))).toEqual({ a: 3, b: 7 });
  expect(container.querySelector("iframe")).toBe(frame);
  expect(getSparring).toHaveBeenCalledTimes(1);
  unmount();
  const restored = await readyRoom(); openSettings();
  expect(screen.getByRole("combobox", { name: "민트" })).toHaveValue("3");
  expect(screen.getByRole("combobox", { name: "코랄" })).toHaveValue("7");
  expect(restored.send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind: "character-limits", value: { a: 3, b: 7 } }, window.location.origin);
});
it.each(["broken", "null", '{"a":null,"b":null}', '{"a":0,"b":9}', '{"a":"3","b":2.5}'])("잘못 저장된 인원 %s는 팀당 5명을 사용한다", async saved => {
  localStorage.setItem("jarihana.sparring.character-limits", saved);
  await readyRoom(); openSettings();
  for (const name of ["민트", "코랄"]) expect(screen.getByRole("combobox", { name })).toHaveValue("5");
});
it("저장소가 차단되어도 새 기본값으로 열리고 설정을 바꿀 수 있다", async () => {
  const read = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  const write = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  try {
    const { send } = await readyRoom(); openSettings();
    expect(screen.getByRole("button", { name: "아담한 구도" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["패싸움 연출", "받아치기 연출", "말풍선 겹침 허용"]) {
      const toggle = screen.getByRole("switch", { name });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "false");
    }
    const limit = screen.getByRole("combobox", { name: "민트" });
    expect(limit).toHaveValue("5");
    fireEvent.change(limit, { target: { value: "2" } });
    expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "character-limits", value: { a: 2, b: 5 } }, window.location.origin);
    fireEvent.click(screen.getByRole("button", { name: "기존 구도" }));
    expect(screen.getByRole("button", { name: "기존 구도" })).toHaveAttribute("aria-pressed", "true");
  } finally { read.mockRestore(); write.mockRestore(); }
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
