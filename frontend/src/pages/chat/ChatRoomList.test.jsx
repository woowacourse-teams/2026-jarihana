import { fireEvent, render, screen } from "@testing-library/react";
import { ChatRoomList } from "./ChatRoomList";

jest.mock("../../features/chat/ChatLink", () => ({
  ChatLink: ({ roomId, children, ...props }) => <a href={`?chat=${roomId}`} {...props}>{children}</a>
}));

const rooms = [
  { id: "1", name: "공부 모임", type: "STUDY", status: "ACTIVE", memberCount: 3, unreadCount: 2, representativeImageUrl: "https://images.example.com/study.jpg" },
  { id: "2", name: "지난 산책", type: "CLUB", status: "ENDED", memberCount: 3, unreadCount: 0 }
];

test("uses the group photo and distinguishes ended rooms without disabling history", () => {
  const { container } = render(<ChatRoomList rooms={rooms} selectedId="1" />);
  expect(container.querySelector('img[src="https://images.example.com/study.jpg"]')).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /공부 모임/ })).toHaveAttribute("aria-current", "page");
  const ended = screen.getByRole("link", { name: /지난 산책/ });
  expect(ended).toHaveClass("chat-room-row--ended");
  expect(ended).toHaveAttribute("href", "?chat=2");
  expect(screen.getByText("종료")).toBeInTheDocument();
  expect(screen.getByLabelText("안 읽은 메시지 2개")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는 모임" } });
  expect(screen.getByText("찾는 모임이 없어요")).toBeInTheDocument();
});

test("only offers retry when the list failed", () => {
  const retry = jest.fn();
  const { rerender } = render(<ChatRoomList rooms={rooms} onRetry={retry} />);
  expect(screen.queryByRole("button", { name: "목록 다시 불러오기" })).not.toBeInTheDocument();
  rerender(<ChatRoomList rooms={[]} error onRetry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "목록 다시 불러오기" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
