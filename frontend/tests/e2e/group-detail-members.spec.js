import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

for (const width of [360, 768, 1440]) {
  test(`@core keeps the leader first before and after loading all members at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installApiFixture(page);

    const members = Array.from({ length: 35 }, (_, index) => ({
      groupMemberId: 200 - index,
      memberId: 200 - index,
      crewName: `참여자${35 - index}`,
      memberType: "CREW",
      generation: 8,
      course: "BACKEND",
      role: "MEMBER",
      joinedAt: "2026-10-10T12:00:00"
    }));
    const leader = {
      ...group.leader,
      groupMemberId: 101,
      course: "FRONTEND",
      role: "LEADER",
      joinedAt: "2026-08-01T12:00:00"
    };
    await page.route("**/api/groups/10", (route) => route.fulfill({
      json: { success: true, error: null, data: { ...group, memberCount: 36, representativeImageUrl: "/images/default-group.png" } }
    }));
    const cursors = [];
    await page.route("**/api/groups/10/members**", (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      cursors.push(cursor);
      return route.fulfill({
        json: {
          success: true,
          error: null,
          data: {
            items: cursor ? [...members.slice(20), leader] : members.slice(0, 20),
            hasNext: !cursor,
            nextCursor: cursor ? null : "older-members"
          }
        }
      });
    });

    await page.goto("/groups/10");
    await page.getByRole("tab", { name: "참여자" }).click();
    const panel = page.locator(".group-members-list-panel");
    const names = panel.locator(".group-member-card__name-row strong");
    await expect(names).toHaveCount(21);
    await expect(names.first()).toHaveText(group.leader.crewName);
    await expect(panel.locator("[data-member-card]").first()).toBeVisible();
    expect(cursors).toEqual([null]);
    await panel.scrollIntoViewIfNeeded();
    const collapsedScreenshot = testInfo.outputPath("leader-first-collapsed.png");
    await panel.screenshot({ path: collapsedScreenshot });
    await testInfo.attach("처음 표시된 참여자 목록", { path: collapsedScreenshot, contentType: "image/png" });

    await panel.getByRole("button", { name: "더보기", exact: true }).click();
    await expect(names).toHaveText([group.leader.crewName, ...members.map((member) => member.crewName)]);
    await expect(panel.getByText(group.leader.crewName, { exact: true })).toHaveCount(1);
    await expect(page.locator(".group-cohort-panel__donut-label strong")).toHaveText("36명");
    expect(cursors).toEqual([null, "older-members"]);
    const expandedScreenshot = testInfo.outputPath("leader-first-expanded.png");
    await panel.screenshot({ path: expandedScreenshot });
    await testInfo.attach("더보기 후 참여자 목록", { path: expandedScreenshot, contentType: "image/png" });

    await panel.getByRole("button", { name: "접기", exact: true }).click();
    await expect(panel.locator(".group-member-grid")).toHaveClass(/is-collapsed/);
    await expect(panel.locator("[data-member-card]").first()).toBeVisible();
    await expect(names.first()).toHaveText(group.leader.crewName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const accessibility = await new AxeBuilder({ page }).include(".group-members-overview").analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
