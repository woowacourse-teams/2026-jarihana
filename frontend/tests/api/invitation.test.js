/** @jest-environment node */
import { createApiClient } from "../../src/shared/api";
import { createInvitation, fetchInvitationCandidates, fetchIssuedInvitations, revokeInvitation, sharedInvitationUrl, acceptInvitation, declineInvitation, fetchInvitation, fetchInvitationPreview } from "../../src/features/invitation/api";
import { invitationAcceptanceSchema } from "../../src/entities/invitation";
import { notificationSchema, notificationTargetPath } from "../../src/features/notifications/api";
import { isPrivateRoute, normalizePath, safeUrl, sanitizeEvent } from "../../src/shared/analytics/privacy";

const token = "A".repeat(43);
const time = "2026-10-12T10:00:00";
const invitation = { id: 501, type: "DIRECT", group: { id: 10, name: "스터디", introduction: "함께해요" }, inviter: { id: 2, crewName: "하나" }, createdAt: time, expiresAt: null, status: "VALID", canAccept: true, canRevoke: false, sharePath: "/invitations/501" };
const joined = { result: "JOINED", invitationId: 501, groupId: 10, groupMemberId: 30, joinedAt: time, registrationOrigin: "INVITATION" };
const created = { id: 501, groupId: 10, type: "LINK", targetMemberId: null, createdAt: time, expiresAt: time, status: "VALID", sharePath: `/invitations/link/${token}`, reused: true };
test("공유 링크 재사용 응답은 CSRF·요청 식별자를 보존하고 서버의 내부 경로만 복사한다", async () => {
  const { client, requests } = wire(created);
  const command = { type: "LINK", requestId: "fixed-request" };
  expect(await createInvitation(10, command, client)).toEqual(created);
  expect(await requests[0].json()).toEqual(command);
  expect(requests[0].headers.get("X-XSRF-TOKEN")).toBe("csrf");
  expect(sharedInvitationUrl(created.sharePath, "https://app.test")).toBe(`https://app.test/invitations/link/${token}`);
});
test.each(["https://evil.test/link", "//evil.test/link", "/invitations/link/invalid", "/invitations/501"])('외부·잘못된 공유 경로는 복사하지 않는다: %s', async (sharePath) => {
  expect(() => sharedInvitationUrl(sharePath, "https://app.test")).toThrow();
  await expect(createInvitation(10, { type: "LINK" }, wire({ ...created, sharePath }).client)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
test("다른 모임의 발급 응답은 거부하고 후보·발급 목록의 커서와 조회 취소 신호를 전달한다", async () => {
  await expect(createInvitation(11, { type: "LINK" }, wire(created).client)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  const page = { items: [], nextCursor: null, hasNext: false };
  const { client, requests } = wire(page);
  await fetchInvitationCandidates(10, { keyword: "마루", cursor: "next", size: 20 }, client, new AbortController().signal);
  expect(new URL(requests[0].url).searchParams.get("keyword")).toBe("마루");
  expect(new URL(requests[0].url).searchParams.get("cursor")).toBe("next");
  await fetchIssuedInvitations(10, { scope: "MANAGED_LINKS" }, client);
  expect(new URL(requests[1].url).searchParams.get("scope")).toBe("MANAGED_LINKS");
});
test("취소 응답은 대상 초대와 상태를 검증한다", async () => {
  await expect(revokeInvitation(501, wire({ id: 502, revokedAt: time, status: "CANCELED" }).client)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(await revokeInvitation(501, wire({ id: 501, revokedAt: time, status: "CANCELED" }).client)).toMatchObject({ id: 501 });
});
test("회원 후보와 보낸 초대의 첫 페이지 요청에는 null 커서를 보내지 않는다", async () => {
  const { client, requests } = wire({ items: [], nextCursor: null, hasNext: false });
  await fetchInvitationCandidates(10, { keyword: "", cursor: null, size: 20 }, client);
  await fetchIssuedInvitations(10, { scope: "MINE", cursor: null, size: 20 }, client);
  for (const request of requests) expect(new URL(request.url).searchParams.has("cursor")).toBe(false);
});
test("거절은 CSRF를 포함한 서버 요청을 보내고 204를 처리하며 알림을 삭제하지 않는다", async () => {
  const requests = [];
  const client = createApiClient({ baseUrl: "https://app.test/api/", cookieSource: () => "XSRF-TOKEN=csrf",
    fetch: async (request) => { requests.push(request); return new Response(null, { status: 204 }); } });
  await declineInvitation(501, client);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe("https://app.test/api/invitations/501/decline");
  expect(requests[0].method).toBe("PATCH");
  expect(requests[0].headers.get("X-XSRF-TOKEN")).toBe("csrf");
});
test("거절된 초대 상세 응답을 검증하고 그대로 전달한다", async () => {
  const declined = { ...invitation, status: "REJECTED", canAccept: false };
  expect(await fetchInvitation(501, wire(declined).client)).toEqual(declined);
});
function wire(data, status = 200) {
  const requests = [];
  const fetch = jest.fn(async (request) => {
    requests.push(request.clone());
    return new Response(JSON.stringify({ success: status < 400, data: status < 400 ? data : null, error: status < 400 ? null : { code: data } }), { status, headers: { "content-type": "application/json" } });
  });
  return { fetch, requests, client: createApiClient({ baseUrl: "https://app.test/api/", fetch, cookieSource: () => "XSRF-TOKEN=csrf" }) };
}
test("지정 초대는 공통 응답 검증과 no-store를 사용한다", async () => {
  const { client, fetch } = wire(invitation);
  expect(await fetchInvitation(501, client)).toEqual(invitation);
  expect(fetch.mock.calls[0][0].cache).toBe("no-store");
});
test("공개 미리보기는 회원 세션을 갱신하지 않는다", async () => {
  const { client, fetch } = wire("UNAUTHENTICATED", 401);
  await expect(fetchInvitationPreview(token, client)).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([undefined, token])("수락 요청은 필요한 토큰만 보내고 CSRF를 적용한다: %s", async (value) => {
  const { client, requests } = wire(joined, 201);
  expect(await acceptInvitation(501, value, client)).toEqual(joined);
  const request = requests[0];
  expect(request.url).toBe("https://app.test/api/invitations/501/acceptances");
  expect(await request.json()).toEqual(value ? { token: value } : {});
  expect(request.headers.get("X-XSRF-TOKEN")).toBe("csrf");
});
test("다른 초대의 성공 응답과 출처 없는 신규 합류 응답은 거부한다", async () => {
  await expect(acceptInvitation(501, undefined, wire({ ...joined, invitationId: 502 }).client)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(invitationAcceptanceSchema.safeParse({ ...joined, registrationOrigin: undefined }).success).toBe(false);
  expect(invitationAcceptanceSchema.safeParse({ ...joined, result: "ALREADY_JOINED", registrationOrigin: undefined }).success).toBe(true);
});
test("초대 알림은 모집·신청 ID 없이 버전 1로 검증하고 지정 초대장으로 연결한다", () => {
  const row = { id: 1, eventType: "INVITATION_RECEIVED", payloadVersion: 1, title: "초대", body: "새 초대", createdAt: time, readAt: null, target: { kind: "INVITATION", groupId: 10, invitationId: 501 } };
  expect(notificationSchema.parse(row)).toEqual(row);
  expect(notificationTargetPath(row.target, 1)).toBe("/invitations/501");
  expect(notificationSchema.safeParse({ ...row, target: { kind: "INVITATION", groupId: 10 } }).success).toBe(false);
  expect(notificationSchema.safeParse({ ...row, eventType: "REGISTRATION_APPROVED" }).success).toBe(false);
});
test.each(["A".repeat(43), "1".repeat(43), "groups"])("토큰은 URL·API 경로·예외에서 분석용 ID로도 남지 않는다: %s", (secret) => {
  const route = `/invitations/link/${secret}`;
  expect(isPrivateRoute(route)).toBe(true);
  expect(isPrivateRoute(`/api/invitations/links/${secret}`)).toBe(true);
  expect(normalizePath(route)).toBe("/invitations/link/:redacted");
  expect(safeUrl(`https://app.test${route}?return=${secret}`)).toBe("https://app.test/invitations/link/:redacted");
  const clean = sanitizeEvent({ properties: { $current_url: `https://app.test${route}`, invitation_token: secret, endpoint: `/api/invitations/links/${secret}` } });
  expect(clean.properties).toEqual({ $current_url: "https://app.test/invitations/link/:redacted", endpoint: "/api/invitations/links/:redacted" });
});
