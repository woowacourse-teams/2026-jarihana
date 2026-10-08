import { expect, test } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { group, installApiFixture, rejectedMyRegistration } from "./api-fixture.js";

for (const width of [360, 1440]) {
  test(`@core approved group focus searches later pages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installApiFixture(page);
    let fetchedNext = false;
    await page.route("**/api/groups?**", (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get("relation") !== "JOINED") return route.fallback();
      const ended = params.get("status") === "ENDED";
      const next = Boolean(params.get("cursor"));
      if (next) fetchedNext = true;
      return route.fulfill({ json: { success: true, error: null, data: {
        items: next ? [{ ...group, type: "STUDY" }] : [],
        hasNext: !ended && !next, nextCursor: !ended && !next ? "next" : null
      } } });
    });
    await page.goto("/my?focusGroup=10&notification=1");
    const row = page.locator('#my-groups-panel [data-activity-id="10"]');
    await expect(row).toBeFocused();
    await expect(row).toHaveClass(/activity-row--notification/);
    expect(fetchedNext).toBe(true);
    await expect(page.getByRole("tab", { name: /동아리·스터디/ })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect((await new AxeBuilder({ page }).include(".my-dashboard").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/notification-account-focus-${width}.png`, fullPage: true });
  });
}

test("@core rejected focus uses the exact application on a later page", async ({ page }) => {
  await installApiFixture(page);
  await page.route("**/api/registrations?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("status") !== "REJECTED") return route.fallback();
    const next = Boolean(params.get("cursor"));
    return route.fulfill({ json: { success: true, error: null, data: {
      items: [{ ...rejectedMyRegistration, id: next ? 45 : 44 }],
      hasNext: !next, nextCursor: next ? null : "next"
    } } });
  });
  await page.goto("/my?registrationStatus=REJECTED&focusRegistration=45&notification=2");
  await expect(page.locator('#my-registrations-panel [data-activity-id="45"]')).toBeFocused();
  await expect(page.locator('#my-registrations-panel [data-activity-id="44"]')).not.toHaveClass(/activity-row--notification/);
  await expect(page.getByRole("tab", { name: /미승인/ })).toHaveAttribute("aria-selected", "true");
});

for (const search of ["focusGroup=999", "registrationStatus=REJECTED&focusRegistration=999"]) {
  test(`@core missing account notification target ${search} shows guidance`, async ({ page }) => {
    await installApiFixture(page);
    await page.goto(`/my?${search}`);
    await expect(page.getByText("알림에 해당하는 항목을 찾을 수 없어요. 탈퇴했거나 기록이 삭제되었을 수 있어요.")).toBeVisible();
    await expect(page.locator(".activity-row--notification")).toHaveCount(0);
  });
}
