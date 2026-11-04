import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

async function openCreate(page) {
  await installApiFixture(page);
  await page.clock.setFixedTime(new Date("2026-11-03T03:00:00Z"));
  await page.route("**/api/sparrings**", (route) => route.fulfill({
    json: { success: true, data: { items: [], nextCursor: null, hasNext: false }, error: null }
  }));
  await page.goto("/sparring");
  await page.getByRole("button", { name: "토론 만들기", exact: true }).click();
  return page.getByRole("dialog", { name: "토론 만들기" });
}

async function fillRequired(dialog) {
  await dialog.getByRole("textbox", { name: "토론 주제" }).fill("쉬는 날, 집콕 vs 나들이?");
  await dialog.getByRole("textbox", { name: "첫 번째 생각" }).fill("집에서 푹 쉬기");
  await dialog.getByRole("textbox", { name: "두 번째 생각" }).fill("밖으로 기분 전환");
}

for (const [width, height] of [[360, 640], [390, 844], [768, 900], [1440, 900]]) {
  test(`keeps the single-screen form and calendar accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const dialog = await openCreate(page);
    await fillRequired(dialog);
    await expect(dialog.getByRole("button", { name: "다음", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "내일", exact: true })).toHaveAttribute("aria-pressed", "true");
    const submit = dialog.getByRole("button", { name: "토론 만들기", exact: true });
    if (height >= 844) await expect(submit).toBeInViewport();
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("single-form.png") });

    await dialog.getByRole("button", { name: "마감 날짜 선택" }).click();
    const calendar = dialog.locator(".sparring-create-calendar");
    await expect(calendar).toBeInViewport();
    const calendarBox = await calendar.boundingBox();
    const dialogBox = await dialog.boundingBox();
    expect(calendarBox.x).toBeGreaterThanOrEqual(dialogBox.x);
    expect(calendarBox.x + calendarBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
    await page.screenshot({ path: testInfo.outputPath("calendar.png") });
    await dialog.getByRole("button", { name: "2026년 11월 7일", exact: true }).click();
    await expect(calendar).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "마감 날짜 선택" })).toBeFocused();

    const options = dialog.getByRole("button", { name: /설명·사진 추가/ });
    await options.click();
    await dialog.getByRole("textbox", { name: "설명 (선택)" }).fill("모처럼 쉬는 주말, 어떤 하루를 보내고 싶나요?");
    await expect(dialog.getByRole("button", { name: "사진 선택" })).toBeVisible();
    await submit.scrollIntoViewIfNeeded();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const expandedAccessibility = await new AxeBuilder({ page }).include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(expandedAccessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("optional-fields.png") });
    await options.click();
    await expect(dialog.getByRole("textbox", { name: "설명 (선택)" })).toBeHidden();
    await expect(options).toContainText("설명 추가됨");
  });
}

test("supports keyboard validation, calendar dismissal and modal focus return", async ({ page }) => {
  const dialog = await openCreate(page);
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("textbox", { name: "토론 주제" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("토론할 주제를 적어주세요.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "토론 주제" })).toBeFocused();
  const date = dialog.getByRole("button", { name: "마감 날짜 선택" });
  await date.focus();
  await page.keyboard.press("Enter");
  await expect(date).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(date).toBeFocused();
  await expect(date).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "토론 만들기", exact: true });
  await submit.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "토론 만들기", exact: true })).toBeFocused();
});

test("keeps the form after a server error and creates directly on retry", async ({ page }) => {
  const dialog = await openCreate(page);
  const requests = [];
  await page.route("**/api/sparrings", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.fulfill({ status: 500, json: {
      success: false, data: null, error: { code: "INTERNAL_SERVER_ERROR", message: "잠시 후 다시 시도해 주세요." }
    } });
    return route.fulfill({ status: 201, json: { success: true, data: { id: 99 }, error: null } });
  });
  await fillRequired(dialog);
  await dialog.getByRole("textbox", { name: "두 번째 생각" }).press("Enter");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "토론 주제" })).toHaveValue("쉬는 날, 집콕 vs 나들이?");
  await dialog.getByRole("button", { name: "토론 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/sparring\/99$/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({
    title: "쉬는 날, 집콕 vs 나들이?", a: "집에서 푹 쉬기", b: "밖으로 기분 전환",
    description: "", closesAt: "2026-11-04T14:59:59.999Z"
  });
});
