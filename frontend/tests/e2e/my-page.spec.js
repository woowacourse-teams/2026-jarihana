import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

test("마이페이지에서 가입 모임을 유형별로 나누고 신청 탭을 유지한다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.setViewportSize({ height: 900, width: 1280 });

  await page.goto("/my");

  const sessionSection = page.getByRole("group", { name: "같이해요" });
  const recurringSection = page.getByRole("group", { name: "동아리·스터디" });
  await expect(sessionSection).toBeVisible();
  await expect(recurringSection).toBeVisible();
  await expect(sessionSection.locator(".activity-row")).toHaveClass(/activity-row--session/);
  await expect(recurringSection.locator(".activity-row").first()).toHaveClass(
    /activity-row--(club|study)/
  );
  await expect(sessionSection.getByRole("link", { name: "웹 접근성 실전 세션" })).toHaveAttribute(
    "href",
    "/groups/12"
  );
  await expect(sessionSection.getByRole("link", { name: "웹 접근성 실전 세션" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "my_group_detail_open"
  );

  await page.getByRole("tab", { name: /신청한 모임/ }).click();
  await expect(page.getByRole("link", { name: "프론트엔드 한 자리" })).toBeVisible();
  await expect(page.getByText("검토 중", { exact: true })).toBeVisible();
  expect(state.unexpectedResponses).toEqual([]);
});

test("마이페이지 유형 영역은 모바일에서 세로로 쌓이고 가로로 넘치지 않는다", async ({ page }) => {
  await installApiFixture(page);
  await page.setViewportSize({ height: 900, width: 360 });

  await page.goto("/my");

  const sessionBox = await page.locator(".activity-type-section--session").boundingBox();
  const recurringBox = await page.locator(".activity-type-section--recurring").boundingBox();
  expect(sessionBox).not.toBeNull();
  expect(recurringBox).not.toBeNull();
  expect(recurringBox.y).toBeGreaterThan(sessionBox.y + sessionBox.height);

  const overflow = await page.locator(".dashboard-panel").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});
