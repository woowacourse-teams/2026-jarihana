import { render, screen } from "@testing-library/react";
import { ChatContent } from "./ChatPage";
import { useChatSession } from "../../features/chat/ChatSessionProvider";

jest.mock("react-router", () => ({ Navigate: () => null, useParams: () => ({}) }));
jest.mock("../../features/auth", () => ({ useAuth: () => ({ member: { id: 1 }, sessionVersion: 1 }) }));
jest.mock("../../features/chat/ChatSessionProvider", () => ({ useChatSession: jest.fn(() => ({ chat: {
  rooms: { data: [], isPending: false, isError: false },
  history: { data: null, isPending: false, isError: false }
}, viewing: null, onViewingLatestChange: jest.fn() })) }));
jest.mock("../../features/chat/ChatLink", () => ({ ChatLink: () => null, chatLocation: () => ({}) }));
jest.mock("./ChatRoomList", () => ({ ChatRoomList: () => <div>채팅 목록</div> }));
jest.mock("./ChatSidebarResizer", () => ({ ChatSidebarResizer: () => null }));
jest.mock("./ChatConversation", () => ({ ChatConversation: () => <div>대화 메시지</div> }));
jest.mock("../../shared/ui", () => ({ GroupImage: () => null }));

test("방이 선택되지 않은 채팅 목록을 오류 없이 표시한다", () => {
  render(<ChatContent />);
  expect(screen.getByText("참여 중인 모임이 없어요")).toBeInTheDocument();
});

test("방을 전환하는 동안 이전 방의 메시지를 새 방에 표시하지 않는다", () => {
  const session = {
    roomId: "1", viewing: null, onViewingLatestChange: jest.fn(),
    chat: {
      rooms: { data: [{ groupId: "2" }], isPending: false },
      history: { data: { items: [], status: "ACTIVE" }, isPending: false }
    }
  };
  useChatSession.mockReturnValue(session);
  const view = render(<ChatContent roomId="2" />);
  expect(screen.queryByText("대화 메시지")).not.toBeInTheDocument();
  useChatSession.mockReturnValue({ ...session, roomId: "2" });
  view.rerender(<ChatContent roomId="2" />);
  expect(screen.getByText("대화 메시지")).toBeInTheDocument();
});
