import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAnnouncement = {
  authorNickname: "자리",
  canManage: true,
  content: "기존 공지 내용",
  createdAt: "2026-10-29T12:00:00",
  id: 101,
  scope: "PUBLIC",
  title: "기존 공지 제목"
};
const mockModify = jest.fn();
const mockDelete = jest.fn();
const mockCreate = jest.fn();
const mockNavigate = jest.fn();

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
  useParams: () => ({ announcementId: "101", groupId: "10" })
}));
jest.mock("../../features/announcement/hooks.js", () => ({
  useAnnouncementDetail: () => ({ data: mockAnnouncement, isLoading: false, isError: false }),
  useCreateAnnouncement: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteAnnouncement: () => ({ mutateAsync: mockDelete, isPending: false }),
  useModifyAnnouncement: () => ({ mutateAsync: mockModify, isPending: false })
}));
jest.mock("../../features/auth/index.js", () => ({
  useAuth: () => ({ member: { id: 1 }, sessionVersion: 1, status: "authenticated" })
}));
jest.mock("../../features/group/index.js", () => ({
  useGroup: () => ({ data: { name: "프론트엔드 한 자리", status: "ACTIVE" } })
}));

import { AnnouncementFormDialog } from "../../features/announcement/AnnouncementFormDialog.jsx";
import { ToastProvider } from "../../shared/ui/index.js";
import { AnnouncementDetailPage } from "./AnnouncementDetailPage.jsx";

function renderDetailPage() {
  return render(
    <ToastProvider>
      <AnnouncementDetailPage />
    </ToastProvider>
  );
}

test("방장은 제목·본문·공개 범위를 입력해 공지를 등록할 수 있다", async () => {
  mockCreate.mockReset().mockResolvedValue({ id: 102 });
  const onOpenChange = jest.fn();
  render(
    <ToastProvider>
      <AnnouncementFormDialog groupId="10" onOpenChange={onOpenChange} open />
    </ToastProvider>
  );

  await userEvent.type(screen.getByRole("textbox", { name: "공지 제목" }), "새 공지 제목");
  await userEvent.type(screen.getByRole("textbox", { name: "공지 내용" }), "새 공지 내용");
  await userEvent.click(screen.getByRole("radio", { name: /전체 공개/ }));
  await userEvent.click(screen.getByRole("button", { name: "공지 등록" }));

  expect(mockCreate).toHaveBeenCalledWith({
    content: "새 공지 내용",
    scope: "PUBLIC",
    title: "새 공지 제목"
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("작성자는 공지 내용을 수정할 수 있다", async () => {
  mockModify.mockReset().mockResolvedValue(undefined);
  renderDetailPage();

  await userEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(screen.getByRole("dialog", { name: "공지 수정" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "공지 제목" })).toHaveValue("기존 공지 제목");
  expect(screen.getByRole("textbox", { name: "공지 내용" })).toHaveValue("기존 공지 내용");

  await userEvent.clear(screen.getByRole("textbox", { name: "공지 제목" }));
  await userEvent.type(screen.getByRole("textbox", { name: "공지 제목" }), "바뀐 공지 제목");
  await userEvent.click(screen.getByRole("button", { name: "수정 완료" }));

  expect(mockModify).toHaveBeenCalledWith({
    content: "기존 공지 내용",
    scope: "PUBLIC",
    title: "바뀐 공지 제목"
  });
});

test("삭제를 확인하면 공지 목록으로 돌아간다", async () => {
  mockNavigate.mockReset();
  mockDelete.mockReset().mockResolvedValue(undefined);
  renderDetailPage();

  await userEvent.click(screen.getByRole("button", { name: "삭제" }));
  expect(screen.getByRole("dialog", { name: "이 공지를 삭제할까요?" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "공지 삭제" }));

  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith("/groups/10?tab=announcements", { replace: true });
});
