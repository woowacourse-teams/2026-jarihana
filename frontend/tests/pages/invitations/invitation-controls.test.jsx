import { cloneElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth } from "../../../src/features/auth";
import { createInvitation, fetchInvitationCandidates } from "../../../src/features/invitation/api";
import { InviteMembersDialog } from "../../../src/features/invitation/InviteMembersDialog.jsx";
import { ShareInvitationButton } from "../../../src/features/invitation/ShareInvitationButton.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";
const mockCaptureEvent = jest.fn();
jest.mock("../../../src/shared/analytics", () => ({ startEventTracking: () => ({ captureEvent: mockCaptureEvent }) }));

jest.mock("../../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../../src/features/invitation/api", () => ({ createInvitation: jest.fn(), fetchInvitationCandidates: jest.fn(),
  fetchIssuedInvitations: jest.fn(), fetchInvitation: jest.fn(), revokeInvitation: jest.fn(),
  sharedInvitationUrl: (path) => `http://localhost${path}` }));
const people = [21, 22].map((memberId, index) => ({ memberId, crewName: index ? "하늘" : "노을", generation: 8, memberType: "CREW", course: "BACKEND" }));
function setup(element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><ToastProvider>{cloneElement(element)}</ToastProvider></QueryClientProvider>;
  return { client, view: render(tree()), tree };
}
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ member: { id: 1 }, sessionVersion: 1, status: "authenticated" });
  fetchInvitationCandidates.mockResolvedValue({ items: people, nextCursor: null, hasNext: false });
});
async function selectBoth() {
  await userEvent.type(screen.getByRole("textbox", { name: "회원 이름 검색" }), "회원");
  await userEvent.click(await screen.findByRole("checkbox", { name: /노을/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /하늘/ }));
}
test("계정 변경 중 첫 발급이 끝나도 이전 계정의 다음 회원 초대나 결과 표시를 진행하지 않는다", async () => {
  let resolveFirst;
  createInvitation.mockImplementation(() => new Promise(resolve => { resolveFirst = resolve; }));
  const { view, tree } = setup(<InviteMembersDialog groupId="10" open onClose={jest.fn()} />);
  await selectBoth(); await userEvent.click(screen.getByRole("button", { name: /2명 초대/ }));
  await waitFor(() => expect(createInvitation).toHaveBeenCalledTimes(1));
  useAuth.mockReturnValue({ member: { id: 2 }, sessionVersion: 2, status: "authenticated" }); view.rerender(tree());
  await act(async () => { resolveFirst({ id: 501 }); });
  expect(createInvitation).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /2명 초대/ })).not.toBeInTheDocument();
});
test("링크 준비가 실패하면 재시도 요청 식별자를 유지하고 복사 실패 시 원본 주소를 직접 선택한다", async () => {
  createInvitation.mockRejectedValueOnce(new Error("network")).mockResolvedValue({ sharePath: `/invitations/link/${"A".repeat(43)}`, reused: true });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn(async () => { throw new Error("denied"); }) } });
  setup(<ShareInvitationButton groupId="10" />);
  await userEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "초대 링크 복사" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
  await screen.findByRole("dialog");
  expect(createInvitation.mock.calls[0][1].requestId).toBe(createInvitation.mock.calls[1][1].requestId);
  expect(screen.getByRole("textbox", { name: "초대 링크" })).toHaveValue(`http://localhost/invitations/link/${"A".repeat(43)}`);
  expect(mockCaptureEvent.mock.calls.map(([event]) => event)).not.toContain("invitation_link_copied");
});
test("링크 준비 도중 컴포넌트가 사라지면 늦은 응답으로 클립보드나 안내를 열지 않는다", async () => {
  let resolve;
  createInvitation.mockImplementation(() => new Promise(done => { resolve = done; }));
  const writeText = jest.fn();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { view } = setup(<ShareInvitationButton groupId="10" />);
  await userEvent.click(screen.getByRole("button", { name: "초대 링크 복사" })); view.unmount();
  await act(async () => { resolve({ sharePath: `/invitations/link/${"A".repeat(43)}` }); });
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockCaptureEvent.mock.calls.map(([event]) => event)).not.toContain("invitation_link_copied");
});

test("클립보드 쓰기가 성공한 뒤에만 복사 완료를 기록하고 링크 원문은 전달하지 않는다", async () => {
  createInvitation.mockResolvedValue({ id: 501, groupId: 10, sharePath: `/invitations/link/${"A".repeat(43)}`, reused: true });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn(async () => undefined) } });
  setup(<ShareInvitationButton groupId="10" />);
  await userEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
  await waitFor(() => expect(mockCaptureEvent).toHaveBeenCalledWith("invitation_link_copied", { group_id: 10, invitation_id: 501, invitation_type: "LINK" }));
  expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("A".repeat(43));
});
