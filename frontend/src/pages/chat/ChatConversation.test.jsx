import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ChatConversation } from "./ChatConversation";
jest.mock("react-router", () => ({
  MemoryRouter: ({ children }) => children,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));
jest.mock("../../features/chat/ChatLink", () => ({
  ChatLink: ({ children, ...props }) => <a href="?chat=inbox" {...props}>{children}</a>
}));

const message = { id: "10", sequence: "10", senderId: "2", clientMessageId: "same-key", author: "크루", mine: true, text: " 원문 ", content: " 원문 ", at: "2026-10-25T12:00:00" };
const room = { id: "1", name: "모임", type: "STUDY", memberCount: 2, status: "ACTIVE", messages: [message] };
function mount(overrides = {}) {
  const props = { room, draft: "안녕", onDraftChange: jest.fn(), onSend: jest.fn(), onRead: jest.fn(), onRetry: jest.fn(), connection: "connected", syncCursor: "10", ...overrides };
  const result = render(<MemoryRouter><ChatConversation {...props} /></MemoryRouter>);
  return { ...result, props };
}
test("IME composition and Shift Enter do not send; plain Enter sends", () => {
  const { props } = mount();
  const input = screen.getByLabelText("메시지");
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(props.onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onSend).toHaveBeenCalledTimes(1);
  expect(input).toHaveAttribute("maxLength", "2000");
});
test("group header links directly to detail without a separate info dialog", () => {
  mount();
  expect(screen.getByRole("link", { name: "모임 모임 상세 보기" })).toHaveAttribute("href", "/groups/1");
  expect(screen.queryByRole("button", { name: "모임 정보" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("메시지")).toHaveAttribute("rows", "1");
});
test("ended room keeps history and same-key retry but removes new-message composer", () => {
  const failed = { ...message, failed: true };
  const { props } = mount({ room: { ...room, status: "ENDED", messages: [failed] } });
  expect(screen.queryByLabelText("메시지")).not.toBeInTheDocument();
  expect(screen.getByText("원문")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "전송 실패 · 다시 보내기" }));
  expect(props.onRetry).toHaveBeenCalledWith(failed);
});
test("loading older messages preserves distance from existing content", () => {
  const load = jest.fn();
  const props = { room, draft: "", onDraftChange: jest.fn(), onSend: jest.fn(), onRead: jest.fn(), hasOlder: true, onLoadOlder: load, syncCursor: "10" };
  const { rerender } = render(<MemoryRouter><ChatConversation {...props} /></MemoryRouter>);
  const history = screen.getByRole("region", { name: "대화 스크롤 영역" });
  Object.defineProperty(history, "scrollHeight", { configurable: true, value: 600 });
  history.scrollTop = 20;
  fireEvent.click(screen.getByRole("button", { name: "이전 대화 보기" }));
  expect(load).toHaveBeenCalledTimes(1);
  Object.defineProperty(history, "scrollHeight", { configurable: true, value: 900 });
  rerender(<MemoryRouter><ChatConversation {...props} room={{ ...room, messages: [{ ...message, id: "9", sequence: "9" }, message] }} /></MemoryRouter>);
  expect(history.scrollTop).toBe(320);
});

test("server confirmation removes retry only for the confirmed message", () => {
  const first = { ...message, id: "pending-1", failed: true };
  const second = { ...message, id: "pending-2", clientMessageId: "other-key", text: "두 번째", failed: true };
  const { props, rerender } = mount({ room: { ...room, messages: [first, second] } });
  expect(screen.getAllByRole("button", { name: "전송 실패 · 다시 보내기" })).toHaveLength(2);
  rerender(<MemoryRouter><ChatConversation {...props} room={{ ...room, messages: [message, second] }} /></MemoryRouter>);
  const retry = screen.getByRole("button", { name: "전송 실패 · 다시 보내기" });
  expect(retry).toHaveAttribute("data-ph-capture-attribute-action", "chat_message_retry");
  fireEvent.click(retry);
  expect(props.onRetry).toHaveBeenCalledWith(second);
});
