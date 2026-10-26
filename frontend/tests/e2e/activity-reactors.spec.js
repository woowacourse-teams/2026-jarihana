import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

async function openDetail(page) {
  await installApiFixture(page);
  const cursors = [];
  const reactors = Array.from({ length: 35 }, (_, index) => ({
    avatarUrl: `https://avatars.githubusercontent.com/u/${index + 1}`,
    course: "FRONTEND",
    crewName: index === 0 ? "자리" : `크루${index + 1}`,
    generation: 8,
    memberType: "CREW",
    mine: index === 0
  }));
  await page.route("**/api/activity-posts**", (route) => {
    const url = new URL(route.request().url());
    const reply = (data) => route.fulfill({ json: { success: true, data, error: null } });
    if (url.pathname.endsWith("/comments")) {
      return reply({
        items: Array.from({ length: 8 }, (_, index) => ({
          id: index + 1, authorNickname: "바다", authorAvatarUrl: null,
          content: "함께 배우니 더 잘 이해할 수 있었어요.", createdAt: "2026-10-10T12:00:00",
          canDelete: false, reactions: []
        })),
        hasNext: false, nextCursor: null
      });
    }
    if (url.pathname.endsWith("/reactions/HEART")) {
      const cursor = url.searchParams.get("cursor");
      cursors.push({ cursor, size: url.searchParams.get("size") });
      return reply({
        emoji: "HEART", count: 35,
        reactors: cursor ? reactors.slice(30) : reactors.slice(0, 30),
        hasNext: !cursor, nextCursor: cursor ? null : "next-30"
      });
    }
    return reply({
      items: [{
        id: 77, caption: "같이 설명하니 더 잘 알겠어요.", authorNickname: "하루",
        imageUrl: "/images/activity.jpg", activityDate: "2026-10-10", createdAt: "2026-10-10T12:00:00",
        canModify: false, commentCount: 8, reactions: [{ emoji: "HEART", count: 35, reacted: true }],
        group: { id: 10, name: "함께 배우는 토요일", type: "STUDY", status: "ACTIVE", recruiting: false, joined: true }
      }],
      hasNext: false, nextCursor: null
    });
  });
  await page.goto("/activities?post=77");
  const detail = page.getByRole("dialog", { name: "함께 배우는 토요일", exact: true });
  await expect(detail).toBeVisible();
  const summary = detail.locator('[data-ph-capture-attribute-action="activity_reactors_open"]');
  await expect(summary).toContainText("크루2");
  await detail.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  return { cursors, detail, summary };
}

for (const width of [360, 390, 768, 1440]) {
  test(`activity reactors use ${width < 640 ? "sheet A" : "popover D"} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { cursors, detail, summary } = await openDetail(page);
    const composer = detail.getByRole("textbox", { name: "댓글", exact: true });
    await composer.fill("작성 중인 댓글");
    await summary.click();
    const mobile = width < 640;
    const list = detail.getByRole(mobile ? "dialog" : "region", { name: "좋아요한 사람", exact: true });
    await expect(list).toBeVisible();
    await detail.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    const scrollBefore = await detail.evaluate((element) => element.scrollTop);
    const bounds = await list.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(901);
    if (mobile) {
      expect(bounds.y).toBeGreaterThan(150);
      expect(bounds.x).toBe(0);
      expect(Math.round(bounds.width)).toBe(width);
      await expect(detail.locator(".activity-post-detail__side")).toHaveAttribute("inert", "");
      const close = list.getByRole("button", { name: "좋아요한 사람 닫기" });
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(list.getByRole("region", { name: "좋아요 목록" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
    } else {
      expect(bounds.y).toBeGreaterThan((await summary.boundingBox()).y);
    }
    const accessibility = await new AxeBuilder({ page })
      .include(mobile ? ".activity-reactors-sheet" : ".activity-reactors-popover")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`reactors-${width}.png`) });
    const scroller = list.locator(mobile ? ".activity-reactors-sheet__body" : ".activity-reactors-popover__body");
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(list.getByText("크루35", { exact: true })).toBeVisible();
    expect(cursors.some(({ cursor, size }) => cursor === "next-30" && size === "30")).toBe(true);
    await expect(list.getByText("모두 확인했어요")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).not.toBeVisible();
    await expect(detail).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(composer).toHaveValue("작성 중인 댓글");
    expect(await detail.evaluate((element) => element.scrollTop)).toBe(scrollBefore);
    await summary.click();
    if (mobile) {
      await detail.getByRole("button", { name: "좋아요 목록 닫기", exact: true }).click({ position: { x: 10, y: 10 } });
    } else {
      await detail.getByText("같이 설명하니 더 잘 알겠어요.", { exact: true }).click();
    }
    await expect(list).not.toBeVisible();
    await expect(detail).toBeVisible();
  });
}

test("an open reactor list adapts between the mobile sheet and desktop popover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { detail, summary } = await openDetail(page);
  await summary.click();
  await expect(detail.getByRole("dialog", { name: "좋아요한 사람" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(detail.getByRole("dialog", { name: "좋아요한 사람" })).not.toBeVisible();
  await expect(detail.getByRole("region", { name: "좋아요한 사람" })).toBeVisible();
  await expect(detail.locator(".activity-post-detail__side")).not.toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = detail.getByRole("dialog", { name: "좋아요한 사람" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "좋아요한 사람 닫기" }).click();
  await expect(sheet).not.toBeVisible();
  await expect(summary).toBeFocused();
});
