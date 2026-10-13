import { createInvitation, acceptInvitation } from "../../src/features/invitation/api";
import { sanitizeProperties } from "../../src/shared/analytics/privacy";
import { startEventTracking } from "../../src/shared/analytics";

jest.mock("../../src/shared/analytics", () => ({ startEventTracking: jest.fn(), startRequestTracking: () => ({ finish() {} }) }));
const captureEvent = jest.fn();
const token = "A".repeat(43);
const issued = { id: 501, groupId: 10, type: "DIRECT", targetMemberId: 21, sharePath: "/invitations/501", reused: false };
const client = (result) => ({ request: jest.fn(async () => result) });
beforeEach(() => {
  jest.clearAllMocks();
  startEventTracking.mockReturnValue({ captureEvent });
});
test("새 지정 초대만 생성 성공으로 기록하고 대상 회원·요청 식별자·메시지는 보내지 않는다", async () => {
  await createInvitation(10, { type: "DIRECT", targetMemberId: 21, requestId: "private-request" }, client(issued));
  expect(captureEvent.mock.calls).toEqual([
    ["invitation_issue_attempted", { group_id: 10, invitation_type: "DIRECT" }],
    ["invitation_created", { group_id: 10, invitation_type: "DIRECT", invitation_id: 501 }]
  ]);
});
test.each(["DIRECT", "LINK"])("%s 재사용은 새 발급으로 집계하지 않는다", async type => {
  const result = { ...issued, type, reused: true, targetMemberId: type === "LINK" ? null : 21,
    sharePath: type === "LINK" ? `/invitations/link/${token}` : issued.sharePath };
  await createInvitation(10, { type, ...(type === "DIRECT" ? { targetMemberId: 21 } : {}) }, client(result));
  expect(captureEvent.mock.calls.map(([event]) => event)).not.toContain("invitation_created");
  expect(captureEvent).toHaveBeenCalledTimes(type === "LINK" ? 2 : 1);
});
test("잘못된 발급 응답이나 요청 실패는 생성 성공을 기록하지 않는다", async () => {
  await expect(createInvitation(10, { type: "DIRECT", targetMemberId: 21 }, client({ ...issued, groupId: 12 }))).rejects.toThrow();
  const failed = { request: jest.fn(async () => { throw new Error("failed"); }) };
  await expect(createInvitation(10, { type: "DIRECT", targetMemberId: 21 }, failed)).rejects.toThrow();
  expect(captureEvent.mock.calls.map(([event]) => event)).toEqual(["invitation_issue_attempted", "invitation_issue_attempted"]);
});
test.each(["JOINED", "ALREADY_JOINED"])("%s 결과를 구분하고 공유 토큰을 이벤트에 포함하지 않는다", async result => {
  await acceptInvitation(501, token, client({ result, invitationId: 501, groupId: 10 }));
  expect(captureEvent.mock.calls).toEqual([
    ["invitation_accept_attempted", { invitation_id: 501, invitation_type: "LINK" }],
    [result === "JOINED" ? "invitation_joined" : "invitation_already_joined", { invitation_id: 501, group_id: 10, invitation_type: "LINK" }]
  ]);
});
test("허용된 초대 속성 외에 토큰·URL·이름·검색어·선택 대상과 잘못된 식별자는 제거한다", () => {
  expect(sanitizeProperties({ invitation_id: 501, invitation_type: "LINK", group_id: 10, token, url: `/invitations/link/${token}`,
    keyword: "private", crewName: "private", target_member_id: 21, requestId: "private" })).toEqual({ invitation_id: 501, invitation_type: "LINK", group_id: 10 });
  expect(sanitizeProperties({ invitation_id: "1".repeat(43), invitation_type: token })).toEqual({});
});
