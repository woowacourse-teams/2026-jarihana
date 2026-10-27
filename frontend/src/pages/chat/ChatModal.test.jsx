import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../features/auth";
import { ChatLink } from "../../features/chat/ChatLink";
import { ChatModal } from "./ChatModal";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const root = dirname(require.resolve("react-router/package.json"));
  const hooks = jest.requireActual(join(root, "dist/production/lib/hooks.js"));
  return {
    ...jest.requireActual(join(root, "dist/production/lib/components.js")),
    ...hooks,
    Link: ({ to, replace, state, preventScrollReset, viewTransition: _viewTransition, children, ...props }) => {
      const navigate = hooks.useNavigate();
      return <a {...props} href={`${to.pathname}${to.search}${to.hash}`} onClick={(event) => {
        event.preventDefault();
        navigate(to, { replace, state, preventScrollReset });
      }}>{children}</a>;
    }
  };
});
jest.mock("../../features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("./ChatPage.jsx", () => {
  const { ChatLink } = require("../../features/chat/ChatLink");
  return { ChatContent: ({ roomId }) => <div>선택한 방: {roomId ?? "목록"}<textarea aria-label="채팅 입력" /><ChatLink roomId="42">방 열기</ChatLink></div> };
});

function Surface() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="현재 주소">{location.pathname}{location.search}{location.hash}</output>
    <input aria-label="작성 중인 내용" />
    <ChatLink>채팅 열기</ChatLink>
    <button onClick={() => navigate(-1)}>뒤로</button>
    <ChatModal />
  </>;
}

beforeEach(() => {
  useAuth.mockReturnValue({ status: "authenticated" });
});

test("opens over the current page, keeps its input and filters, and restores opener focus on close", async () => {
  render(<MemoryRouter initialEntries={["/groups?type=STUDY#results"]}><Surface /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("작성 중인 내용"), { target: { value: "남겨 둔 글" } });
  const opener = screen.getByRole("link", { name: "채팅 열기" });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByText("선택한 방: 목록");
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/groups?type=STUDY&chat=inbox#results");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("link", { name: "방 열기" }));
  expect(screen.getByText("선택한 방: 42")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "채팅 닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/groups?type=STUDY#results");
  expect(screen.getByLabelText("작성 중인 내용")).toHaveValue("남겨 둔 글");
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});

test("back closes the modal in one step even after selecting a room", async () => {
  render(<MemoryRouter initialEntries={["/home"]}><Surface /></MemoryRouter>);
  fireEvent.click(screen.getByRole("link", { name: "채팅 열기" }));
  await screen.findByText("선택한 방: 목록");
  fireEvent.click(screen.getByRole("link", { name: "방 열기" }));
  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/home");
});

test("a chat query cannot open content for a signed-out visitor", () => {
  useAuth.mockReturnValue({ status: "anonymous" });
  render(<MemoryRouter initialEntries={["/groups?chat=42"]}><Surface /></MemoryRouter>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("채팅 모달은 키보드로 바뀐 화면 높이와 위치를 따라가고 닫을 때 이벤트를 해제한다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  const removeListener = jest.spyOn(viewport, "removeEventListener");
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    await screen.findByText("선택한 방: 42");
    const overlay = screen.getByRole("dialog").parentElement;
    fireEvent.focusIn(screen.getByLabelText("채팅 입력"));
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px"));
    viewport.height = 450;
    viewport.offsetTop = 24;
    fireEvent(viewport, new Event("resize"));
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px"));
    expect(overlay.style.getPropertyValue("--chat-viewport-top")).toBe("24px");
    fireEvent.click(screen.getByRole("button", { name: "채팅 닫기" }));
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  } finally {
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
  }
});

test("키보드가 나타날 때 여러 화면 변경을 한 프레임으로 합친다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  const requestFrame = jest.spyOn(window, "requestAnimationFrame");
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    await screen.findByText("선택한 방: 42");
    fireEvent.focusIn(screen.getByLabelText("채팅 입력"));
    const overlay = screen.getByRole("dialog").parentElement;
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    requestFrame.mockClear();
    viewport.height = 460;
    fireEvent(viewport, new Event("resize"));
    viewport.height = 450;
    fireEvent(viewport, new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px"));
  } finally {
    requestFrame.mockRestore();
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
  }
});

test("키보드를 닫으면 늦은 Safari resize 전에 높이를 복원하고 오래된 높이로 다시 줄이지 않는다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, "clientHeight");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 450, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 800 });
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    const input = await screen.findByLabelText("채팅 입력");
    const overlay = screen.getByRole("dialog").parentElement;
    input.focus();
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px"));
    input.blur();
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px"));
    expect(viewport.height).toBe(450);
    fireEvent(viewport, new Event("scroll"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px");
    viewport.height = 650;
    fireEvent(viewport, new Event("resize"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px");
    viewport.height = 800;
    fireEvent(viewport, new Event("resize"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(overlay.style.getPropertyValue("--chat-viewport-top")).toBe("0px");
    viewport.height = 760;
    fireEvent(viewport, new Event("resize"));
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("760px"));
    input.focus();
    viewport.height = 450;
    fireEvent(viewport, new Event("resize"));
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px"));
  } finally {
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
    if (previousHeight) Object.defineProperty(document.documentElement, "clientHeight", previousHeight);
    else delete document.documentElement.clientHeight;
  }
});

test("전송 후 입력창에 바로 다시 포커스하면 키보드가 닫힌 것으로 처리하지 않는다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, "clientHeight");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 450, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 800 });
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    const input = await screen.findByLabelText("채팅 입력");
    const overlay = screen.getByRole("dialog").parentElement;
    input.focus();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    input.blur();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    input.focus({ preventScroll: true });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(input).toHaveFocus();
    expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px");
    expect(overlay).not.toHaveAttribute("data-chat-keyboard-closing");

    input.blur();
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px"));
    input.focus({ preventScroll: true });
    await waitFor(() => expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("450px"));
    expect(overlay).not.toHaveAttribute("data-chat-keyboard-closing");
  } finally {
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
    if (previousHeight) Object.defineProperty(document.documentElement, "clientHeight", previousHeight);
    else delete document.documentElement.clientHeight;
  }
});

test("입력창을 처음 터치할 때 페이지를 스크롤하지 않고 포커스하며 커서 조작과 드래그는 유지한다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 800, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    const input = await screen.findByLabelText("채팅 입력");
    const focus = jest.spyOn(input, "focus");
    fireEvent.touchStart(input, { touches: [{}] });
    expect(fireEvent.touchEnd(input, { touches: [] })).toBe(false);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(input).toHaveFocus();
    focus.mockClear();
    fireEvent.touchStart(input, { touches: [{}] });
    expect(fireEvent.touchEnd(input, { touches: [] })).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    input.blur();
    fireEvent.touchStart(input, { touches: [{}] });
    fireEvent.touchMove(input, { touches: [{}] });
    expect(fireEvent.touchEnd(input, { touches: [] })).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    fireEvent.touchStart(input, { touches: [{}, {}] });
    expect(fireEvent.touchEnd(input, { touches: [] })).toBe(true);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
  }
});

test("화면 확대를 키보드 크기 변경으로 처리하지 않는다", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 800, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    render(<MemoryRouter initialEntries={["/home?chat=42"]}><Surface /></MemoryRouter>);
    await screen.findByText("선택한 방: 42");
    const overlay = screen.getByRole("dialog").parentElement;
    expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px");
    Object.assign(viewport, { height: 400, offsetTop: 100, scale: 2 });
    fireEvent(viewport, new Event("resize"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(overlay.style.getPropertyValue("--chat-viewport-height")).toBe("800px");
    expect(overlay.style.getPropertyValue("--chat-viewport-top")).toBe("0px");
  } finally {
    if (previous) Object.defineProperty(window, "visualViewport", previous);
    else delete window.visualViewport;
  }
});
