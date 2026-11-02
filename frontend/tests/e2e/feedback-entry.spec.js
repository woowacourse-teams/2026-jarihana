import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const loginPrompt = "로그인이 필요한 서비스예요";

for (const { surface, width } of [
  { surface: "desktop floating button", width: 1280 },
  { surface: "mobile floating button", width: 390 },
  { surface: "footer", width: 1280 }
]) {
  test(`shows a login-required dialog without redirecting from the ${surface}`, async ({ page }) => {
    const state = await installApiFixture(page, { auth: "anonymous" });
    await page.setViewportSize({ height: 900, width });
    await page.goto("/groups");

    if (surface === "footer") {
      const contact = page.getByRole("region", { name: "Contact us" });
      await contact.scrollIntoViewIfNeeded();
      await contact.getByRole("button", { name: "피드백 남기기" }).click();
    } else {
      await page.locator(".app-feedback-button").click();
    }

    await expect(page.getByRole("dialog", { name: loginPrompt })).toBeVisible();
    await expect(page.getByText("피드백을 남기려면 로그인해 주세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인하러 가기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toHaveCount(0);
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog", { name: loginPrompt })).toHaveCount(0);
    expect(state.unexpectedResponses).toEqual([]);
  });
}

test("returns from login and opens the feedback form automatically", async ({ page }) => {
  const state = await installApiFixture(page, { auth: "anonymous" });
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.route("https://github.com/login/oauth/authorize**", (route) =>
    route.fulfill({
      body: `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8"><title>Stub GitHub OAuth</title></head>
  <body><a href="http://127.0.0.1:4174/oauth/callback?code=mock">로그인 완료</a></body>
</html>`,
      contentType: "text/html"
    })
  );
  await page.goto("/groups");

  await page.locator(".app-feedback-button").click();
  await page.getByRole("button", { name: "로그인하러 가기" }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);

  state.auth = "authenticated";
  await page.getByRole("link", { name: "로그인 완료" }).click();

  await expect(page).toHaveURL(/\/groups\?feedback=open$/);
  await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page).not.toHaveURL(/feedback=open/);
  expect(state.unexpectedResponses).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`keeps feedback fixed and reveals its label on hover and keyboard focus at ${width}px`, async ({ page }, testInfo) => {
    await installApiFixture(page);
    await page.setViewportSize({ height: 900, width });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/groups");

    const button = page.locator(".app-feedback-button");
    const label = button.locator(".app-feedback-button__label");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("data-ph-capture-attribute-action", "feedback_start");
    await expect(label).toHaveCSS("opacity", "0");
    await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: /피드백/ })).toHaveCount(0);
    const initialBox = await button.boundingBox();
    expect(initialBox.width).toBeGreaterThanOrEqual(44);
    expect(initialBox.height).toBeGreaterThanOrEqual(44);
    expect(initialBox.x + initialBox.width).toBeLessThan(width);
    expect(initialBox.y + initialBox.height).toBeLessThan(900);
    const accessibility = await new AxeBuilder({ page })
      .include(".app-feedback-button")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("rest.png") });

    await button.hover();
    const motionSample = await label.evaluate((element) => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(Number(getComputedStyle(element).opacity));
      }));
    }));
    expect(motionSample).toBeGreaterThan(0);
    expect(motionSample).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath("hover-mid.png") });
    await expect(label).toHaveCSS("opacity", "1");
    const labelBox = await label.boundingBox();
    expect(labelBox.x).toBeGreaterThanOrEqual(0);
    expect(labelBox.x + labelBox.width).toBeLessThan(initialBox.x);
    await page.screenshot({ path: testInfo.outputPath("hover.png") });

    await page.mouse.move(0, 0);
    await expect(label).toHaveCSS("opacity", "0");
    await button.focus();
    await expect(label).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();

    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await expect(label).toHaveCSS("transform", "none");
    await page.mouse.click(0, 0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrollTop = page.getByRole("button", { name: "맨 위로 이동" });
    await expect(scrollTop).toBeVisible();
    const scrolledBox = await button.boundingBox();
    const scrollTopBox = await scrollTop.boundingBox();
    expect(scrolledBox.y).toBeCloseTo(initialBox.y, 0);
    expect(scrollTopBox.y + scrollTopBox.height).toBeLessThan(scrolledBox.y);
    await page.screenshot({ path: testInfo.outputPath("scrolled-dark-preference.png") });
  });
}
