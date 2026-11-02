import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SparringDetailPage } from "../../src/pages/sparring/SparringDetailPage";
import { useAuth } from "../../src/features/auth";
import { getSparring, getSparringPosts } from "../../src/features/sparring/api";

jest.mock("react-router", () => ({
  useParams: () => ({ topicId: "1" }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));
jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn(), storeReturnTarget: jest.fn() }));
jest.mock("../../src/features/sparring/api", () => ({
  ...jest.requireActual("../../src/features/sparring/api"),
  getSparring: jest.fn(), getSparringPosts: jest.fn()
}));
const topic = { id: 1, title: "점심 토론", a: "기다려", b: "다른 곳", votesA: 1, votesB: 0, postCount: 0, revision: 1 };
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.EventSource = class { addEventListener() {} close() {} };
  useAuth.mockReturnValue({ status: "anonymous", member: null, login: jest.fn() });
  getSparring.mockResolvedValue(topic);
  getSparringPosts.mockResolvedValue({ items: [], nextCursor: null, hasNext: false });
});
it("persists the camera switch and sends it without replacing the room or refetching messages", async () => {
  const { container, unmount } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  const send = jest.spyOn(frame.contentWindow, "postMessage");
  const toggle = screen.getByRole("switch", { name: "충돌 카메라" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(toggle).toBeDisabled();
  receive(frame, { kind: "ready" });
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(frame, { kind: "scene", status: "ready" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(toggle).toHaveAttribute("data-ph-capture-attribute-action", "sparring_clash_camera_toggle");
  expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "clash-camera", value: true }, window.location.origin);
  expect(container.querySelector("iframe")).toBe(frame);
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).toHaveBeenCalledTimes(1);
  unmount(); render(<SparringDetailPage />);
  expect(screen.getByRole("switch", { name: "충돌 카메라" })).toHaveAttribute("aria-checked", "true");
  await act(async () => {});
});
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
  expect(screen.getByRole("button", { name: "기존 구도" })).toBeDisabled();
  receive(frame, { kind: "ready" });
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(frame, { kind: "scene", status: "ready" });
  expect(screen.getByRole("button", { name: "아담한 구도" })).toHaveAttribute("aria-pressed", "true");
  expect(send).toHaveBeenCalledWith({ channel: "jarihana-sparring", kind: "view", value: "compact" }, window.location.origin);
  for (const [value, label] of [["original", "기존 구도"], ["reference", "참고 구도"], ["compact", "아담한 구도"]]) {
    const button = screen.getByRole("button", { name: label });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-ph-capture-attribute-action", "sparring_view_change");
    expect(send).toHaveBeenLastCalledWith({ channel: "jarihana-sparring", kind: "view", value }, window.location.origin);
    expect(container.querySelector("iframe")).toBe(frame);
  }
  expect(getSparring).toHaveBeenCalledTimes(1);
  expect(getSparringPosts).toHaveBeenCalledTimes(1);
});
it("shows a preview during authentication without loading a room for the wrong actor", () => {
  useAuth.mockReturnValue({ status: "loading" });
  const { container } = render(<SparringDetailPage />);
  expect(screen.getByRole("status")).toHaveTextContent("토론을 준비하고 있어요");
  expect(container.querySelector("picture img")).toHaveAttribute("src", "/sparring-arena/assets/arena-preview-desktop.webp");
  expect(container.querySelector("iframe")).toBeNull();
  expect(getSparring).not.toHaveBeenCalled();
});
it("keeps text and inputs covered after data and iframe load until the first 3D frame is ready", async () => {
  const { container } = render(<SparringDetailPage />);
  const frame = container.querySelector("iframe");
  expect(frame).toHaveAttribute("inert");
  expect(frame).toHaveAttribute("aria-hidden", "true");
  fireEvent.load(frame);
  receive(frame, { kind: "ready" });
  await waitFor(() => expect(frame).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  expect(screen.getByText("토론을 준비하고 있어요")).toBeInTheDocument();
  expect(container.querySelector(".sparring-detail__viewport")).toHaveAttribute("data-ready", "false");
  receive(frame, { kind: "scene", status: "ready" });
  expect(frame).not.toHaveAttribute("inert");
  expect(frame).toHaveAttribute("aria-hidden", "false");
  expect(screen.queryByText("토론을 준비하고 있어요")).not.toBeInTheDocument();
  expect(container.querySelector(".sparring-detail__viewport")).toHaveAttribute("data-ready", "true");
});
it("offers a retry after a texture or renderer failure and keeps the replacement iframe covered", async () => {
  const { container } = render(<SparringDetailPage />);
  const first = container.querySelector("iframe");
  receive(first, { kind: "ready" });
  await waitFor(() => expect(first).toHaveAttribute("title", "점심 토론 캡슐 경기장"));
  receive(first, { kind: "scene", status: "error" });
  expect(screen.getByRole("alert")).toHaveTextContent("3D 화면을 불러오지 못했어요");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(container.querySelector("iframe")).not.toBe(first);
  expect(container.querySelector("iframe")).toHaveAttribute("inert");
  expect(screen.getByText("토론을 준비하고 있어요")).toBeInTheDocument();
  await act(async () => {});
});
it("shows a recoverable data error instead of exposing the incomplete arena", async () => {
  getSparring.mockRejectedValue(new Error("토론을 불러오지 못했어요"));
  const { container } = render(<SparringDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("토론을 불러오지 못했어요");
  expect(container.querySelector("iframe")).toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeEnabled();
});
