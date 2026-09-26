import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

test("마이페이지에서 내 모임과 내 신청을 별도 카드로 보여 준다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.setViewportSize({ height: 900, width: 1280 });

  await page.goto("/my");

  await expect(page.getByRole("heading", { name: "내 모임", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 신청", exact: true })).toBeVisible();
  await expect(
    page.locator("#my-groups-panel").getByRole("link", { name: "웹 접근성 실전 세션", exact: true })
  ).toBeVisible();

  await page.getByRole("tab", { name: /동아리·스터디/ }).click();
  await expect(
    page.locator("#my-groups-panel").getByRole("link", { name: "프론트엔드 한 자리", exact: true })
  ).toBeVisible();

  await expect(
    page
      .locator("#my-registrations-panel")
      .getByRole("link", { name: "프론트엔드 한 자리", exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: /거절됨/ }).click();
  await expect(page.locator("#my-registrations-panel")).toContainText("거절 사유: 이번 모집의 정원이 모두 찼습니다.");
  expect(state.unexpectedResponses).toEqual([]);
});

test("마이페이지의 두 카드는 모바일에서 세로로 쌓이고 가로로 넘치지 않는다", async ({ page }) => {
  await installApiFixture(page);
  await page.setViewportSize({ height: 900, width: 360 });

  await page.goto("/my");
  await expect(page.getByRole("heading", { name: "내 모임", exact: true })).toBeVisible();

  const panels = await page.locator(".activity-column > .dashboard-panel").all();
  expect(panels).toHaveLength(2);
  const firstPanel = await panels[0].boundingBox();
  const secondPanel = await panels[1].boundingBox();
  expect(firstPanel).not.toBeNull();
  expect(secondPanel).not.toBeNull();
  expect(secondPanel.y).toBeGreaterThan(firstPanel.y + firstPanel.height);

  const overflow = await page.locator(".activity-column").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});
