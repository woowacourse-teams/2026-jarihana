import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SparringDetailPage } from "../../src/pages/sparring/SparringDetailPage";
import { ENTRY_GUIDE_DURATION } from "../../src/pages/sparring/SparringEntryGuide";
import { SparringEntry, ENTRY_REVEAL_DURATION } from "../../src/pages/sparring/SparringEntry";
import { useAuth, storeReturnTarget } from "../../src/features/auth";
import { getSparring, voteSparring } from "../../src/features/sparring/api";

jest.mock("react-router", () => ({
  useParams: () => ({ topicId: "1" }),
  useLocation: () => ({ pathname: "/sparring/1", search: "", hash: "" }),
  useNavigate: () => jest.fn(),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn(), storeReturnTarget: jest.fn() }));
jest.mock("../../src/features/sparring/api", () => ({
  ...jest.requireActual("../../src/features/sparring/api"),
  getSparring: jest.fn(), voteSparring: jest.fn()
}));
const topic = { id: 1, title: "점심 토론", a: "기다려", b: "다른 곳", description: "", mySide: null, votesA: 1, votesB: 0, postCount: 0, revision: 1 };
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
let stream;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.removeItem("jarihana.sparring.entry-guide-seen");
  global.EventSource = class {
    constructor() { this.listeners = {}; stream = this; }
    addEventListener(kind, listener) { this.listeners[kind] = listener; }
    close() {}
  };
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 1 }, login: jest.fn() });
  getSparring.mockResolvedValue(topic);
  voteSparring.mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
});
async function mount() {
  const view = render(<SparringDetailPage />);
  await screen.findByRole("heading", { name: topic.title });
  const frame = view.container.querySelector("iframe");
  frame.scrollIntoView = jest.fn();
  return frame;
}
function ready(frame) {
  const receive = message => act(() => window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin: window.location.origin,
    data: { channel: "jarihana-sparring", ...message }
  })));
  receive({ kind: "ready" });
  act(() => stream.listeners.snapshot({ data: JSON.stringify({ revision: 1, votesA: 1, votesB: 0, postCount: 0, posts: [] }) }));
  receive({ kind: "scene", status: "ready" });
}

it("allows draft selection before SSE/3D loads without writing a vote", async () => {
  const frame = await mount();
  const choice = screen.getByRole("button", { name: "다른 곳 편 선택" });
  fireEvent.click(choice);
  expect(choice).toHaveAttribute("aria-pressed", "true");
  expect(choice).toHaveAttribute("data-ph-capture-attribute-action", "sparring_entry_side_select");
  expect(voteSparring).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "이 편으로 시작" })).toBeEnabled();
  expect(frame).toHaveAttribute("inert");
});

it("preselects the existing side and waits for the scene without writing it again", async () => {
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT" });
  const frame = await mount();
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  jest.useFakeTimers();
  expect(screen.getByRole("button", { name: "기다려 편 선택" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" }));
  await waitFor(() => expect(screen.getByText("경기장이 준비되면 바로 입장해요.")).toBeInTheDocument());
  const pending = screen.getByRole("button", { name: "입장 중…" });
  expect(pending).toBeDisabled();
  expect(pending).toHaveAttribute("aria-busy", "true");
  expect(pending.querySelector(".ui-spinner")).toBeInTheDocument();
  expect(frame).toHaveAttribute("inert");
  expect(voteSparring).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "composer-open" }), expect.anything());
  act(() => jest.advanceTimersByTime(ENTRY_GUIDE_DURATION + 1000));
  expect(screen.getByRole("dialog", { name: "입장 중…" })).toBeInTheDocument();
  expect(frame).toHaveAttribute("inert");
  ready(frame);
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
  expect(frame.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(send.mock.calls.filter(([message]) => message.kind === "composer-open")).toEqual([
    [{ channel: "jarihana-sparring", kind: "composer-open", side: "a" }, window.location.origin]
  ]);
});

it("submits once, waits for confirmation and leaves only after the saved side is received", async () => {
  let finish;
  voteSparring.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const frame = await mount(); ready(frame);
  jest.useFakeTimers();
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  fireEvent.click(screen.getByRole("button", { name: "다른 곳 편 선택" }));
  const start = screen.getByRole("button", { name: "이 편으로 시작" });
  fireEvent.click(start); fireEvent.click(start);
  expect(screen.getByRole("dialog", { name: "입장 중…" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "받아치기" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "끌어치기" })).toBeInTheDocument();
  expect(start).toHaveTextContent("입장 중…");
  expect(start).toHaveAttribute("aria-busy", "true");
  expect(start.querySelector(".ui-spinner")).toBeInTheDocument();
  await waitFor(() => expect(voteSparring).toHaveBeenCalledWith("1", "CORAL"));
  expect(voteSparring).toHaveBeenCalledTimes(1);
  expect(frame).toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "먼저 구경하기" })).toBeDisabled();
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "composer-open" }), expect.anything());
  getSparring.mockResolvedValue({ ...topic, mySide: "CORAL", revision: 2 });
  await act(async () => finish());
  act(() => jest.advanceTimersByTime(ENTRY_GUIDE_DURATION));
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
  expect(getSparring).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.filter(([message]) => message.kind === "composer-open")).toEqual([
    [{ channel: "jarihana-sparring", kind: "composer-open", side: "b" }, window.location.origin]
  ]);
});

it("does not open the saved side's input when entering through watch", async () => {
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT" });
  const frame = await mount();
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  ready(frame);
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "composer-open" }), expect.anything());
});

it("preserves a failed draft choice and can retry saving it", async () => {
  voteSparring.mockRejectedValueOnce(new Error("투표 저장 실패"));
  const frame = await mount(); ready(frame);
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "기다려 편 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("투표 저장 실패");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const retryStart = screen.getByRole("button", { name: "이 편으로 시작" });
  expect(localStorage.getItem("jarihana.sparring.entry-guide-seen")).toBeNull();
  expect(retryStart).toBeEnabled();
  expect(retryStart).not.toHaveAttribute("aria-busy");
  expect(retryStart.querySelector(".ui-spinner")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "기다려 편 선택" })).toHaveAttribute("aria-pressed", "true");
  expect(frame).toHaveAttribute("inert");
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT", revision: 2 });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" })));
  act(() => jest.advanceTimersByTime(ENTRY_GUIDE_DURATION));
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
});

it("uses the guest login flow without voting and keeps a public watch path", async () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", member: null, login });
  const frame = await mount(); ready(frame);
  fireEvent.click(screen.getByRole("button", { name: "기다려 편 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" }));
  await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(storeReturnTarget).toHaveBeenCalledWith("/sparring/1");
  expect(voteSparring).not.toHaveBeenCalled();
  expect(frame).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  await waitFor(() => expect(frame).not.toHaveAttribute("inert"), { timeout: 2000 });
});

it("permits result viewing but no voting in a closed topic", async () => {
  getSparring.mockResolvedValue({ ...topic, closesAt: "2020-01-01T00:00:00Z" });
  const frame = await mount(); ready(frame);
  expect(screen.getByRole("button", { name: "기다려 편 선택" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "이 편으로 시작" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "토론 결과 보기" }));
  await waitFor(() => expect(frame).not.toHaveAttribute("inert"), { timeout: 2000 });
  expect(voteSparring).not.toHaveBeenCalled();
});

it("keeps the entry mounted and arena locked until the impact and split have finished", async () => {
  const frame = await mount();
  ready(frame);
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  const entry = document.querySelector(".sparring-entry");
  expect(entry).toHaveAttribute("data-leaving", "true");
  expect(entry).toHaveAttribute("inert");
  expect(frame.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION - 1));
  expect(entry).toBeInTheDocument();
  expect(frame).toHaveAttribute("inert");
  act(() => jest.advanceTimersByTime(1));
  expect(entry).not.toBeInTheDocument();
  expect(frame).not.toHaveAttribute("inert");
  expect(voteSparring).not.toHaveBeenCalled();
});

it("skips the impact sequence when reduced motion is requested", async () => {
  const frame = await mount();
  ready(frame);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  act(() => jest.advanceTimersByTime(0));
  expect(document.querySelector(".sparring-entry")).toBeNull();
  expect(frame).not.toHaveAttribute("inert");
});

it("cancels the exit timer when navigating away during the impact", async () => {
  const view = render(<SparringDetailPage />);
  await screen.findByRole("heading", { name: topic.title });
  const frame = view.container.querySelector("iframe");
  frame.scrollIntoView = jest.fn();
  ready(frame);
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "먼저 구경하기" }));
  expect(jest.getTimerCount()).toBe(1);
  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
});


it("fits the whole composition after viewport and content changes, and cleans up observation", () => {
  const originalObserver = global.ResizeObserver;
  let resize;
  const observe = jest.fn();
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  };
  try {
    const view = render(<SparringEntry topic={topic} />);
    const fit = view.container.querySelector(".sparring-entry__fit");
    const composition = view.container.querySelector(".sparring-entry__composition");
    let availableHeight = 400;
    let contentHeight = 800;
    Object.defineProperty(fit, "clientHeight", { get: () => availableHeight });
    Object.defineProperty(composition, "offsetHeight", { get: () => contentHeight });
    expect(observe.mock.calls).toEqual([[fit], [composition]]);
    act(() => resize());
    expect(composition.style.getPropertyValue("--entry-scale")).toBe("0.5");
    availableHeight = 600;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(composition.style.getPropertyValue("--entry-scale")).toBe("0.75");
    contentHeight = 1000;
    act(() => resize());
    expect(composition.style.getPropertyValue("--entry-scale")).toBe("0.6");
    availableHeight = 1200;
    act(() => resize());
    expect(composition.style.getPropertyValue("--entry-scale")).toBe("1");
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    availableHeight = 100;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(composition.style.getPropertyValue("--entry-scale")).toBe("1");
  } finally {
    global.ResizeObserver = originalObserver;
  }
});


it("shows the guide immediately for three seconds even when the arena and vote are ready", async () => {
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT" });
  const frame = await mount(); ready(frame);
  jest.useFakeTimers();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" })));
  const guide = screen.getByRole("dialog", { name: "입장 중…" });
  expect(guide).toHaveAttribute("aria-modal", "true");
  expect(guide.querySelector(".sparring-entry-guide__tips")).toHaveFocus();
  expect(voteSparring).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(ENTRY_GUIDE_DURATION - 1));
  expect(localStorage.getItem("jarihana.sparring.entry-guide-seen")).toBeNull();
  expect(guide).toBeInTheDocument();
  expect(document.querySelector(".sparring-entry")).toHaveAttribute("data-leaving", "false");
  expect(frame).toHaveAttribute("inert");
  act(() => jest.advanceTimersByTime(1));
  expect(guide).not.toBeInTheDocument();
  expect(document.querySelector(".sparring-entry")).toHaveAttribute("data-leaving", "true");
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
  expect(localStorage.getItem("jarihana.sparring.entry-guide-seen")).toBe("true");
});

it("cleans up the guide timer and body scroll lock when leaving the page", async () => {
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT" });
  const view = render(<SparringDetailPage />);
  await screen.findByRole("heading", { name: topic.title });
  jest.useFakeTimers();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" })));
  expect(screen.getByRole("dialog", { name: "입장 중…" })).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(0));
  expect(jest.getTimerCount()).toBe(1);
  expect(document.body.style.overflow).toBe("hidden");
  view.unmount();
  expect(jest.getTimerCount()).toBe(0);
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(localStorage.getItem("jarihana.sparring.entry-guide-seen")).toBeNull();
});

it.each([true, false])("skips a completed guide but still waits for the scene (already ready: %s)", async sceneReady => {
  localStorage.setItem("jarihana.sparring.entry-guide-seen", "true");
  getSparring.mockResolvedValue({ ...topic, mySide: "MINT" });
  const frame = await mount();
  if (sceneReady) ready(frame);
  jest.useFakeTimers();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  if (!sceneReady) {
    act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
    expect(frame).toHaveAttribute("inert");
    ready(frame);
  }
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
  expect(voteSparring).not.toHaveBeenCalled();
});

it("still waits for vote confirmation when the guide was already completed", async () => {
  localStorage.setItem("jarihana.sparring.entry-guide-seen", "true");
  let finish;
  voteSparring.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const frame = await mount(); ready(frame);
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "다른 곳 편 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "이 편으로 시작" }));
  await waitFor(() => expect(voteSparring).toHaveBeenCalledTimes(1));
  act(() => jest.advanceTimersByTime(ENTRY_GUIDE_DURATION));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(frame).toHaveAttribute("inert");
  getSparring.mockResolvedValue({ ...topic, mySide: "CORAL", revision: 2 });
  await act(async () => finish());
  act(() => jest.advanceTimersByTime(ENTRY_REVEAL_DURATION));
  expect(frame).not.toHaveAttribute("inert");
});
