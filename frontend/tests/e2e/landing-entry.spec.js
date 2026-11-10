import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const width of [390, 1440]) {
  test(`public landing entry and browse at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installApiFixture(page, { auth: "anonymous" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/land$/);
    await expect(page.locator(".landing-page")).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator(".groups-page--home")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.goto("/groups");
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator(".landing-page")).toHaveCount(0);
    await page.getByRole("link", { name: "자리하나 홈" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator(".groups-page--home")).toBeVisible();
    await expect(page.locator(".landing-page")).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/groups$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/land$/);
    await expect(page.locator(".landing-page")).toBeVisible();
    await page.goto("/land");
    await expect(page.locator(".landing-page")).toBeVisible();
  });
}

test("members keep the current home and may explicitly open the landing", async ({ page }) => {
  await installApiFixture(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".groups-page--home")).toBeVisible();
  await expect(page.locator(".landing-page")).toHaveCount(0);
  await page.goto("/land");
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "GitHub로 시작하기" })).toHaveCount(0);
  const home = page.getByRole("banner").getByRole("link", { name: "홈으로 가기" });
  await expect(home).toHaveAttribute("href", "/home");
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".groups-page--home")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".landing-page")).toBeVisible();
  await page.getByRole("link", { name: /오늘 바로 모임을 열 수 있어요/ }).click();
  await expect(page).toHaveURL(/\/land\/create$/);
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "모임 만들기", exact: true }).first()).toHaveAttribute("href", "/groups/new");
});
