import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth } from "../../../src/features/auth";
import { acceptInvitation, declineInvitation, fetchInvitation, fetchInvitationPreview } from "../../../src/features/invitation/api";
import { NotificationSessionBoundary } from "../../../src/features/notifications/NotificationSessionBoundary";
import { InvitationPage } from "../../../src/pages/invitations/index.jsx";
import { useParams } from "react-router";
import { captureEventWhenReady } from "../../../src/shared/analytics";
jest.mock("../../../src/shared/analytics", () => ({ captureEventWhenReady: jest.fn(async () => true), startEventTracking: () => ({ captureEvent: jest.fn() }), startRequestTracking: () => ({ finish() {} }) }));

const mockNavigate = jest.fn();
jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: jest.fn(), useLocation: () => ({ pathname: "/invitations/501" }), useNavigate: () => mockNavigate
}));
jest.mock("../../../src/features/auth", () => ({ ...jest.requireActual("../../../src/features/auth/returnTarget"), useAuth: jest.fn() }));
jest.mock("../../../src/features/invitation/api", () => ({ acceptInvitation: jest.fn(), declineInvitation: jest.fn(), fetchInvitation: jest.fn(), fetchInvitationPreview: jest.fn() }));
jest.mock("../../../src/features/push/browser", () => ({ pushEnvironment: () => ({ supported: false }), disarmPush: jest.fn(async () => null) }));
const detail = { id: 501, type: "DIRECT", group: { id: 10, name: "함께 자바", introduction: "함께 공부해요" }, inviter: { id: 2, crewName: "하나" }, createdAt: "2026-10-12T12:00:00", expiresAt: null, status: "VALID", canAccept: true, canRevoke: false };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><NotificationSessionBoundary /><InvitationPage /></QueryClientProvider>;
  return { client, tree, view: render(tree()) };
}
beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear();
  useParams.mockReturnValue({ invitationId: "501" });
  useAuth.mockReturnValue({ member: { id: 1 }, sessionVersion: 1, status: "authenticated", login: jest.fn() });
  fetchInvitation.mockResolvedValue(detail);
  declineInvitation.mockResolvedValue(undefined);
});
test("초대 상세를 다시 조회해도 같은 초대의 조회 이벤트를 중복 기록하지 않는다", async () => {
  const { client } = setup();
  await screen.findByRole("button", { name: "수락" });
  expect(captureEventWhenReady).toHaveBeenCalledWith("invitation_viewed", { invitation_id: 501, group_id: 10, invitation_type: "DIRECT", status: "VALID" });
  fetchInvitation.mockResolvedValue({ ...detail });
  await act(async () => { await client.invalidateQueries({ queryKey: ["invitations"] }); });
  expect(fetchInvitation).toHaveBeenCalledTimes(2);
  expect(captureEventWhenReady).toHaveBeenCalledTimes(1);
});
test("초대장의 보조 문구와 ACTIVE 배지를 제거하고 거절 확인·취소는 합류하지 않는다", async () => {
  setup();
  const decline = await screen.findByRole("button", { name: "거절" });
  expect(screen.queryByText("함께할 자리")).not.toBeInTheDocument();
  expect(screen.queryByText("수락할 수 있는 초대")).not.toBeInTheDocument();
  await userEvent.click(decline);
  const dialog = screen.getByRole("dialog", { name: "초대를 거절하시겠어요?" });
  expect(dialog).toHaveTextContent("모임장에게 알림이 가지 않아요");
  await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(decline).toHaveFocus();
  expect(declineInvitation).not.toHaveBeenCalled();
  expect(acceptInvitation).not.toHaveBeenCalled();
});
test("거절 확인은 서버 상태를 저장하고 초대장을 다시 조회해 재수락을 막는다", async () => {
  const { client } = setup();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await userEvent.click(await screen.findByRole("button", { name: "거절" }));
  fetchInvitation.mockResolvedValue({ ...detail, status: "REJECTED", canAccept: false });
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "거절" }));
  expect(await screen.findByRole("status")).toHaveTextContent("거절한 초대장입니다.");
  expect(declineInvitation).toHaveBeenCalledWith(501);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["invitations"] });
  expect(screen.queryByRole("button", { name: "수락" })).not.toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(acceptInvitation).not.toHaveBeenCalled();
});
test("거절 저장 실패는 확인 창에 남아 재시도할 수 있다", async () => {
  declineInvitation.mockRejectedValue(new Error("network"));
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "거절" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "거절" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("요청을 완료하지 못했어요");
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(acceptInvitation).not.toHaveBeenCalled();
});
test("여러 사람이 사용하는 공유 링크에는 지정 초대 거절 버튼을 두지 않는다", async () => {
  useParams.mockReturnValue({ token: "A".repeat(43) });
  fetchInvitationPreview.mockResolvedValue({ ...detail, type: "LINK" });
  setup();
  await screen.findByRole("button", { name: "수락" });
  expect(screen.queryByRole("button", { name: "거절" })).not.toBeInTheDocument();
  expect(declineInvitation).not.toHaveBeenCalled();
  expect(acceptInvitation).not.toHaveBeenCalled();
});
test("화면을 조회해도 수락하지 않고 사용자가 누른 뒤 합류 안내와 링크를 제공한다", async () => {
  acceptInvitation.mockResolvedValue({ result: "JOINED", groupId: 10 });
  const { client } = setup();
  await screen.findByText("함께 자바");
  expect(acceptInvitation).not.toHaveBeenCalled();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await userEvent.click(screen.getByRole("button", { name: "수락" }));
  expect(await screen.findByRole("status")).toHaveTextContent("모임에 합류했어요");
  expect(screen.getByRole("link", { name: "모임으로 이동" })).toHaveAttribute("href", "/groups/10");
  expect(acceptInvitation).toHaveBeenCalledWith(501, undefined);
  for (const key of ["groups", "registrations", "invitations"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
});
test("수락 중에는 버튼이 잠기고 이미 참여 중인 응답은 별도로 안내한다", async () => {
  let finish;
  acceptInvitation.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup();
  await userEvent.click(await screen.findByRole("button", { name: "수락" }));
  expect(screen.getByRole("button", { name: /수락 중/ })).toBeDisabled();
  await act(async () => finish({ result: "ALREADY_JOINED", groupId: 10 }));
  expect(await screen.findByRole("status")).toHaveTextContent("이미 참여 중");
  expect(acceptInvitation).toHaveBeenCalledTimes(1);
});
test.each(["EXPIRED", "CANCELED", "REJECTED", "GROUP_ENDED", "ACCEPTED"])("%s 초대에는 수락 버튼을 표시하지 않는다", async (status) => {
  fetchInvitation.mockResolvedValue({ ...detail, status, canAccept: false }); setup();
  await screen.findByText("함께 자바");
  expect(screen.queryByRole("button", { name: "수락" })).not.toBeInTheDocument();
  expect(acceptInvitation).not.toHaveBeenCalled();
});
test("비회원 지정 초대는 내용을 조회하지 않고 로그인 때 복귀 경로를 저장한다", async () => {
  const login = jest.fn(); useAuth.mockReturnValue({ status: "anonymous", login }); setup();
  await userEvent.click(screen.getByRole("button", { name: "GitHub로 로그인" }));
  expect(fetchInvitation).not.toHaveBeenCalled();
  expect(login).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/invitations/501");
});
test("비회원 공유 초대는 공개 정보를 보되 수락할 수 없다", async () => {
  useParams.mockReturnValue({ token: "A".repeat(43) });
  useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  fetchInvitationPreview.mockResolvedValue({ ...detail, type: "LINK" }); setup();
  await screen.findByText("함께 자바");
  expect(screen.getByRole("button", { name: "GitHub로 로그인" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "수락" })).not.toBeInTheDocument();
  expect(fetchInvitation).not.toHaveBeenCalled(); expect(acceptInvitation).not.toHaveBeenCalled();
});
test("다른 계정의 지정 초대와 잘못된 ID는 내용을 노출하지 않는다", async () => {
  fetchInvitation.mockRejectedValue({ status: 403 }); const { view, tree } = setup();
  await screen.findByText("이 계정으로는 초대를 수락할 수 없어요");
  expect(screen.queryByText("함께 자바")).not.toBeInTheDocument();
  useParams.mockReturnValue({ invitationId: "0" }); view.rerender(tree());
  await screen.findByText("유효하지 않은 초대예요");
  expect(fetchInvitation).toHaveBeenCalledTimes(1);
});
test("계정이 바뀐 뒤 A의 늦은 초대·수락 응답은 B의 화면에 남지 않는다", async () => {
  let finish;
  acceptInvitation.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { client, tree, view } = setup();
  await userEvent.click(await screen.findByRole("button", { name: "수락" }));
  fetchInvitation.mockRejectedValue({ status: 403 });
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 2 }, sessionVersion: 2 });
  view.rerender(tree());
  await screen.findByText("이 계정으로는 초대를 수락할 수 없어요");
  await act(async () => finish({ result: "JOINED", groupId: 10 }));
  await waitFor(() => expect(screen.queryByText("초대를 수락해 모임에 합류했어요.")).not.toBeInTheDocument());
  expect(client.getQueryData(["invitations", 1, 1, "direct", "501"])).toBeUndefined();
});
test("조회 중 계정이 바뀌면 A의 늦은 상세 응답을 취소하고 캐시에서 지운다", async () => {
  let finish;
  fetchInvitation.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockRejectedValue({ status: 403 });
  const { client, tree, view } = setup();
  await waitFor(() => expect(fetchInvitation).toHaveBeenCalledTimes(1));
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 2 }, sessionVersion: 2 }); view.rerender(tree());
  await screen.findByText("이 계정으로는 초대를 수락할 수 없어요");
  await act(async () => finish(detail));
  expect(screen.queryByText("함께 자바")).not.toBeInTheDocument();
  expect(client.getQueryData(["invitations", 1, 1, "direct", "501"])).toBeUndefined();
});
