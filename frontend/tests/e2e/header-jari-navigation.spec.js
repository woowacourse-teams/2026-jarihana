import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const destinations = [
  { label: "뭐있나?", path: "/groups", description: "함께할 자리 둘러보기", action: "group_browse" },
  { label: "뭐했나?", path: "/activities", description: "사진으로 보는 자리 이야기", action: "browse_activity_posts" },
  { label: "뭐할래?", path: "/board", description: "하고 싶은 자리 제안하기", action: "browse_proposals" }
];

async function installNavigationFixture(page) {
  const state = await installApiFixture(page, { auth: "anonymous" });
  for (const path of ["activity-posts", "proposals"]) {
    await page.route(`**/api/${path}**`, route => route.fulfill({
      json: { success: true, data: { items: [], nextCursor: null, hasNext: false }, error: null }
    }));
  }
  return state;
}

for (const width of [768, 1440]) {
  test(`자리 dropdown supports hover, keyboard and dismissal at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const state = await installNavigationFixture(page);
    await page.goto("/groups");
    const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
    const trigger = navigation.getByRole("button", { name: "자리", exact: true });
    const dropdown = navigation.locator(".app-header__group-dropdown");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("link")).toHaveText(["토론하나?", "게임하나?"]);
    await expect(navigation.getByRole("link", { name: "뭐있나?", exact: true })).toHaveCount(0);

    await trigger.hover();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(dropdown).toHaveCSS("opacity", "1");
    const triggerBox = await trigger.boundingBox();
    await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height + 2);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const destination of destinations) {
      const link = navigation.getByRole("link", { name: destination.label, exact: true });
      await expect(link).toHaveAttribute("href", destination.path);
      await expect(link).toHaveAccessibleDescription(destination.description);
      await expect(link).toHaveAttribute("data-ph-capture-attribute-action", destination.action);
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const icon = link.locator("img.app-header__group-icon");
      await expect(icon).toHaveAttribute("alt", "");
      await expect(icon).toHaveAttribute("aria-hidden", "true");
      await expect(icon).toHaveCSS("width", "36px");
      await expect(icon).toHaveCSS("height", "36px");
      await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth === 144)).toBe(true);
    }
    await navigation.getByRole("link", { name: "뭐했나?", exact: true }).hover();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panelBox = await dropdown.boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await page.screenshot({ path: testInfo.outputPath(`dropdown-${colorScheme}.png`) });
    }
    const accessibility = await new AxeBuilder({ page }).include(".app-header")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.locator("main").hover({ position: { x: 10, y: 300 } });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(navigation.getByRole("link", { name: "뭐있나?", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(navigation.getByRole("link", { name: "뭐했나?", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.locator("main").click({ position: { x: 10, y: 300 } });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.press("Enter");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const duration = await trigger.locator(".app-header__group-caret")
      .evaluate(element => parseFloat(getComputedStyle(element).transitionDuration));
    expect(duration).toBeLessThanOrEqual(0.001);
    expect(state.unexpectedResponses).toEqual([]);
  });
}

test("자리 links keep public routes, close after navigation and reflect the current destination", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installNavigationFixture(page);
  await page.goto("/home");
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  const trigger = navigation.getByRole("button", { name: "자리", exact: true });
  for (const destination of destinations) {
    await trigger.press("Enter");
    await navigation.getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.locator(".app-header__group-navigation")).toHaveAttribute("data-active", "true");
    await trigger.press("Enter");
    await expect(navigation.getByRole("link", { name: destination.label, exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: testInfo.outputPath(`${destination.action}.png`) });
    await trigger.press("Escape");
  }
  await page.getByRole("link", { name: "자리하나 홈" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(state.unexpectedResponses).toEqual([]);
});

for (const width of [360, 390]) {
  test.describe(`자리 mobile at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true });

    test("tap expands the list, Escape keeps the drawer and selection closes it", async ({ page }, testInfo) => {
      const state = await installNavigationFixture(page);
      await page.goto("/groups");
      const navigation = page.getByRole("navigation", { name: "모바일 메뉴" });
      for (const destination of destinations) {
        await page.getByRole("button", { name: "메뉴 열기" }).tap();
        const trigger = navigation.getByRole("button", { name: "자리", exact: true });
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await trigger.tap();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(navigation.getByRole("link", { name: destination.label, exact: true })).toBeVisible();
        const icon = navigation.getByRole("link", { name: destination.label, exact: true }).locator("img.app-header__group-icon");
        await expect(icon).toHaveCSS("width", "36px");
        await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth === 144)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const accessibility = await new AxeBuilder({ page }).include('.ui-overlay [role="dialog"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`${destination.action}-mobile.png`) });
        await navigation.getByRole("link", { name: destination.label, exact: true }).focus();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "전체 메뉴" })).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(trigger).toBeFocused();
        await trigger.tap();
        await navigation.getByRole("link", { name: destination.label, exact: true }).tap();
        await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
        await expect(page.getByRole("dialog", { name: "전체 메뉴" })).toHaveCount(0);
      }
      await page.getByRole("link", { name: "자리하나 홈" }).tap();
      await expect(page).toHaveURL(/\/home$/);
      expect(state.unexpectedResponses).toEqual([]);
    });
  });
}
