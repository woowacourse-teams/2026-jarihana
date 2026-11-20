import { expect, test } from "playwright/test";

import { installApiFixture, leader } from "./api-fixture.js";

const apiResponse = (route, data) => route.fulfill({ json: { success: true, data, error: null } });

test("opens the original notification after signing in from the groups header", async ({ page }) => {
  const session = await installApiFixture(page, { auth: "anonymous" });
  const readAt = "2026-11-05T12:00:00";
  await page.route("**/api/notifications/123?*", (route) => apiResponse(route, {
    id: 123,
    eventType: "REGISTRATION_APPROVED",
    payloadVersion: 1,
    title: "모임 신청이 승인됐어요",
    body: "내 모임을 확인해 보세요",
    createdAt: readAt,
    readAt: null,
    target: { kind: "MY_GROUPS", groupId: 1, recruitmentId: 2 }
  }));
  await page.route("**/api/notifications/123/read", (route) => apiResponse(route, { id: 123, readAt }));

  await page.goto("/notifications/open/123");
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByRole("banner").getByRole("button", { name: "GitHub로 로그인" }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);

  session.auth = "authenticated";
  const read = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/notifications/123/read" &&
    response.request().method() === "PATCH"
  );
  await page.goto("/oauth/callback");
  await expect(page).toHaveURL(/\/my\?focusGroup=1&notification=123$/);
  expect((await read).ok()).toBe(true);
});

for (const sameAccount of [true, false]) {
  test(`restores a draft only for the same account (same account: ${sameAccount})`, async ({ page }) => {
    await installApiFixture(page);
    await page.goto("/board/new");
    const title = page.getByRole("textbox", { name: "제목" });
    const content = page.getByRole("textbox", { name: "어떤 모임인가요?" });
    await title.fill("다음 주 점심 모임");
    await content.fill("함께 식사할 분을 찾습니다.");

    let releaseProfile;
    const profileGate = new Promise((resolve) => { releaseProfile = resolve; });
    await page.route("**/api/members/me", async (route) => {
      await profileGate;
      await apiResponse(route, {
        member: sameAccount ? leader : { ...leader, id: leader.id + 1 },
        signupCompleted: true
      });
    });

    try {
      const recheck = page.waitForRequest("**/api/members/me");
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      await recheck;
      await expect(title).toBeHidden();
    } finally {
      releaseProfile();
    }

    await expect(title).toBeVisible();
    await expect(title).toHaveValue(sameAccount ? "다음 주 점심 모임" : "");
    await expect(content).toHaveValue(sameAccount ? "함께 식사할 분을 찾습니다." : "");
  });
}
