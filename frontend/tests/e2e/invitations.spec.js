import { expect, test } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture } from "./api-fixture.js";

const token = "A".repeat(43);
const now = "2026-10-12T12:00:00";
const detail = { id: 501, type: "DIRECT", group: { id: 10, name: "함께하는 자바 스터디", introduction: "함께 배우고 모임 일정을 이어가요." }, inviter: { id: 2, crewName: "하나" }, createdAt: now, expiresAt: null, status: "VALID", canAccept: true, canRevoke: false, sharePath: "/invitations/501" };
const notification = { id: 7, eventType: "INVITATION_RECEIVED", payloadVersion: 1, title: "모임 초대가 도착했어요", body: "하나님이 초대했어요.", createdAt: now, readAt: null, target: { kind: "INVITATION", groupId: 10, invitationId: 501 } };
async function fixture(page, options = {}) {
  const shared = await installApiFixture(page, options);
  const state = { accepts: [], declines: 0, deletes: 0, reads: 0, detailReads: 0, groupReads: 0, detailStatus: 200, acceptanceCode: null, result: "JOINED", invitation: structuredClone(detail), order: [] };
  const reply = (route, data, status = 200) => route.fulfill({ status, json: { success: true, data, error: null } });
  const fail = (route, code, status) => route.fulfill({ status, json: { success: false, data: null, error: { code } } });
  await page.route("**/api/groups/10", (route) => { state.groupReads += 1; return route.fallback(); });
  await page.route("**/api/invitations/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith("/decline")) {
      state.declines += 1;
      state.invitation.status = "REJECTED";
      state.invitation.canAccept = false;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/acceptances")) {
      state.accepts.push(request.postDataJSON());
      if (state.acceptanceCode) return fail(route, state.acceptanceCode, 409);
      return reply(route, { result: state.result, invitationId: 501, groupId: 10, groupMemberId: 30, joinedAt: now, ...(state.result === "JOINED" ? { registrationOrigin: "INVITATION" } : {}) }, state.result === "JOINED" ? 201 : 200);
    }
    state.detailReads += 1; state.order.push("detail");
    if (state.detailStatus !== 200) return fail(route, state.detailStatus === 403 ? "INVITATION_ACCESS_DENIED" : "INVITATION_NOT_FOUND", state.detailStatus);
    return reply(route, path.includes("/links/") ? { ...state.invitation, type: "LINK", expiresAt: "2026-10-15T12:00:00" } : state.invitation);
  });
  await page.route("**/api/notifications**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/7") && route.request().method() === "DELETE") { state.deletes += 1; return route.fulfill({ status: 204 }); }
    if (path.endsWith("/unread-count")) return reply(route, { unreadCount: 1 });
    if (path.endsWith("/read")) { state.reads += 1; state.order.push("read"); return reply(route, { id: 7, readAt: now }); }
    if (path.endsWith("/7")) { state.order.push("notification"); return reply(route, notification); }
    return reply(route, { items: [notification], nextCursor: null, hasNext: false });
  });
  return { state, shared };
}
for (const width of [360, 768, 1440]) {
  test(`거절 확인·취소·알림 재진입과 버튼 정렬 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state } = await fixture(page);
    await page.goto("/invitations/501");
    const decline = page.getByRole("button", { name: "거절", exact: true });
    const accept = page.getByRole("button", { name: "수락", exact: true });
    await expect(accept).toBeVisible();
    await expect(page.getByText("함께할 자리", { exact: true })).toHaveCount(0);
    await expect(page.getByText("수락할 수 있는 초대", { exact: true })).toHaveCount(0);
    const cardBox = await page.locator(".invitation-card").boundingBox();
    const acceptBox = await accept.boundingBox();
    const declineBox = await decline.boundingBox();
    expect(cardBox.width).toBeLessThanOrEqual(512);
    expect(acceptBox.x).toBeGreaterThan(declineBox.x);
    expect(cardBox.x + cardBox.width - acceptBox.x - acceptBox.width).toBeLessThan(30);
    await page.screenshot({ path: `test-results/invitation-layout-${width}.png` });
    await decline.click();
    const dialog = page.getByRole("dialog", { name: "초대를 거절하시겠어요?" });
    await expect(dialog).toContainText("모임장에게 알림이 가지 않아요");
    await expect(dialog).toContainText("다시 수락할 수 없어요");
    await expect(dialog).toHaveCSS("transform", "none");
    await page.mouse.move(0, 0);
    await expect(dialog.getByRole("button", { name: "취소", exact: true })).toHaveCSS("transform", "none");
    await expect(dialog.getByRole("button", { name: "거절", exact: true })).toHaveCSS("transform", "none");
    const cancelBox = await dialog.getByRole("button", { name: "취소", exact: true }).boundingBox();
    const confirmBox = await dialog.getByRole("button", { name: "거절", exact: true }).boundingBox();
    expect(confirmBox.x).toBeGreaterThan(cancelBox.x);
    expect(confirmBox.y + confirmBox.height / 2).toBe(cancelBox.y + cancelBox.height / 2);
    expect(confirmBox.width).toBe(acceptBox.width);
    expect(confirmBox.height).toBe(acceptBox.height);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/invitation-decline-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(decline).toBeFocused();
    expect(state.deletes).toBe(0);
    await decline.click();
    await dialog.getByRole("button", { name: "거절", exact: true }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("거절한 초대장입니다.");
    expect(state.deletes).toBe(0);
    expect(state.declines).toBe(1);
    await page.goto("/groups");
    if (width < 768) await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page.getByRole("button", { name: /알림함, 안 읽은 알림/ }).click();
    await page.getByRole("link", { name: /모임 초대가 도착했어요/ }).click();
    await expect(page).toHaveURL(/\/invitations\/501$/);
    await expect(page.getByRole("main").getByRole("status")).toHaveText("거절한 초대장입니다.");
    await expect(page.getByRole("button", { name: "수락", exact: true })).toHaveCount(0);
    expect(state.accepts).toEqual([]);
  });
  test(`초대장 키보드 수락·합류·접근성 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state } = await fixture(page);
    state.invitation.group.introduction = "긴소개".repeat(80);
    await page.goto("/invitations/501");
    const button = page.getByRole("button", { name: "수락" });
    await expect(button).toBeVisible();
    expect(state.groupReads).toBe(0); expect(state.accepts).toEqual([]);
    await expect(button).toHaveAttribute("data-ph-capture-attribute-action", "invitation_accept");
    const box = await button.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".invitation-page").analyze()).violations).toEqual([]);
    await button.focus(); await page.screenshot({ path: `test-results/invitation-active-${width}.png` });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main").getByRole("status")).toContainText("모임에 합류했어요");
    expect(state.accepts).toEqual([{}]);
    await page.getByRole("link", { name: "모임으로 이동" }).click();
    await expect(page).toHaveURL(/\/groups\/10$/);
  });
}
test("비회원 공유 초대는 공개 조회 후 가입 완료까지 경로를 보존하고 자동 합류하지 않는다", async ({ page }) => {
  const { state, shared } = await fixture(page, { auth: "anonymous" });
  await page.goto(`/invitations/link/${token}`);
  await expect(page.getByText("함께하는 자바 스터디")).toBeVisible();
  expect(state.accepts).toEqual([]); expect(state.groupReads).toBe(0);
  // GitHub 제공자 인증 뒤 서버가 가입 세션을 발급한 상황을 재현한다.
  await page.evaluate((path) => sessionStorage.setItem("jarihana:auth:return-target", path), `/invitations/link/${token}`);
  shared.auth = "signup-required";
  await page.goto("/oauth/callback"); await expect(page).toHaveURL(/\/signup$/);
  expect(await page.evaluate(() => sessionStorage.getItem("jarihana:auth:return-target"))).toBe(`/invitations/link/${token}`);
  await page.getByRole("radio", { name: "크루" }).click();
  await page.getByRole("textbox", { name: "크루 이름" }).fill("초대");
  await page.getByRole("combobox", { name: "과정" }).selectOption("FRONTEND");
  await page.getByRole("combobox", { name: "기수" }).selectOption("3");
  await page.getByRole("button", { name: "가입 완료하기" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invitations/link/${token}$`));
  await expect(page.getByRole("button", { name: "수락" })).toBeVisible();
  expect(state.accepts).toEqual([]);
  await page.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("모임에 합류했어요");
  expect(state.accepts).toEqual([{ token }]);
});
test("가입 세션에서 공유 초대의 회원가입 버튼은 복귀 주소를 저장한다", async ({ page }) => {
  await fixture(page, { auth: "signup-required" }); await page.goto(`/invitations/link/${token}`);
  await page.getByRole("button", { name: "회원가입 이어하기" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(await page.evaluate(() => sessionStorage.getItem("jarihana:auth:return-target"))).toBe(`/invitations/link/${token}`);
});
test("기존 회원의 OAuth 복귀는 지정 초대장으로 돌아오며 수락하지 않는다", async ({ page }) => {
  const { state } = await fixture(page);
  await page.goto("/groups");
  await page.evaluate(() => sessionStorage.setItem("jarihana:auth:return-target", "/invitations/501"));
  await page.goto("/oauth/callback");
  await expect(page).toHaveURL(/\/invitations\/501$/);
  await expect(page.getByRole("button", { name: "수락" })).toBeVisible();
  expect(state.accepts).toEqual([]);
});
for (const status of ["EXPIRED", "CANCELED", "REJECTED", "GROUP_ENDED"]) {
  test(`알림 클릭은 ${status} 상태를 조회한 뒤 읽음 처리하고 합류하지 않는다`, async ({ page }) => {
    const { state } = await fixture(page); state.invitation.status = status; state.invitation.canAccept = false;
    await page.goto("/notifications/open/7");
    await expect(page).toHaveURL(/\/invitations\/501$/);
    await expect(page.getByRole("main").getByRole("status")).toBeVisible();
    expect(state.order.slice(0, 3)).toEqual(["notification", "detail", "read"]);
    expect(state.reads).toBe(1); expect(state.groupReads).toBe(0); expect(state.accepts).toEqual([]);
    await page.screenshot({ path: `test-results/invitation-${status.toLowerCase()}.png` });
  });
}
for (const status of [403, 404]) {
  test(`초대 대상 ${status}는 알림을 읽거나 초대를 수락하지 않는다`, async ({ page }) => {
    const { state } = await fixture(page); state.detailStatus = status;
    await page.goto("/notifications/open/7");
    await expect(page.getByRole("alert")).toContainText("이 알림을 확인할 수 없어요");
    expect(state.reads).toBe(0); expect(state.accepts).toEqual([]); expect(state.groupReads).toBe(0);
  });
}
test("알림함의 초대 행은 기존 클릭 action으로 초대장에 연결한다", async ({ page }) => {
  const { state } = await fixture(page); await page.goto("/groups");
  await page.getByRole("button", { name: /알림함, 안 읽은 알림/ }).click();
  const row = page.getByRole("link", { name: /모임 초대가 도착했어요/ });
  await expect(row).toHaveAttribute("data-ph-capture-attribute-action", "notification_open"); await row.click();
  await expect(page).toHaveURL(/\/invitations\/501$/);
  await expect(page.getByRole("button", { name: "수락" })).toBeVisible();
  expect(state.reads).toBe(1); expect(state.accepts).toEqual([]);
});
test("조회 뒤 취소된 초대의 수락 실패는 안내하고 버튼을 제거한다", async ({ page }) => {
  const { state } = await fixture(page); state.acceptanceCode = "INVITATION_CANCELED";
  await page.goto("/invitations/501"); await page.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("alert")).toContainText("취소된 초대");
  await expect(page.getByRole("button", { name: "수락" })).toHaveCount(0);
});
test("일시적인 수락 충돌은 명시적으로 재시도하고 중복 합류를 안내한다", async ({ page }) => {
  const { state } = await fixture(page); state.acceptanceCode = "CONCURRENT_MODIFICATION";
  await page.goto(`/invitations/link/${token}`); await page.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("alert")).toContainText("요청이 겹쳐");
  expect(state.accepts).toHaveLength(1); state.acceptanceCode = null; state.result = "ALREADY_JOINED";
  await page.getByRole("button", { name: "수락" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("이미 참여 중");
  expect(state.accepts).toHaveLength(2);
});
test("잘못된 주소는 서버 초대 API를 호출하지 않는다", async ({ page }) => {
  const { state } = await fixture(page);
  await page.goto("/invitations/link/bad-token"); await expect(page.getByText("유효하지 않은 초대예요")).toBeVisible();
  expect(state.detailReads).toBe(0);
});
