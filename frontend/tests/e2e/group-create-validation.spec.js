import { expect, test } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture } from "./api-fixture.js";

async function waitForScrollToSettle(page) {
  await page.evaluate(() => new Promise(resolve => {
    let previous = window.scrollY;
    let stableFrames = 0;
    function check() {
      stableFrames = previous === window.scrollY ? stableFrames + 1 : 0;
      previous = window.scrollY;
      if (stableFrames >= 5) resolve();
      else window.requestAnimationFrame(check);
    }
    window.requestAnimationFrame(check);
  }));
}

for (const width of [360, 1440]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    test(`생성 오류 필드 이동 ${width}px ${reducedMotion}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await installApiFixture(page);
      const creates = [];
      await page.route("**/api/groups", route => {
        if (route.request().method() === "POST") creates.push(route.request().postDataJSON());
        return route.fallback();
      });
      await page.addInitScript(() => {
        window.validationScrolls = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (options) {
          window.validationScrolls.push(options);
          return original.call(this, options);
        };
      });
      for (const type of ["STUDY", "CLUB", "SESSION"]) {
        await page.goto("/groups/new");
        await page.getByLabel("모임 종류").selectOption(type);
        const submit = page.getByRole("button", { name: "모임 만들기", exact: true });
        await submit.scrollIntoViewIfNeeded();
        const before = await page.evaluate(() => window.scrollY);
        await submit.click();
        const name = page.getByLabel("모임 이름", { exact: true });
        await expect(name).toBeFocused();
        await waitForScrollToSettle(page);
        await expect(name).toBeInViewport();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before);
        await expect.poll(async () => (await name.boundingBox()).y).toBeGreaterThan(50);
        expect(await page.evaluate(() => window.validationScrolls.at(-1).behavior))
          .toBe(reducedMotion === "reduce" ? "auto" : "smooth");
        await page.screenshot({ path: testInfo.outputPath(`${type}-first-error.png`) });

        await name.fill("테스트 모임");
        await submit.click();
        const intro = page.getByLabel("한 줄 소개", { exact: true });
        await expect(intro).toBeFocused();
        await waitForScrollToSettle(page);
        await expect(intro).toBeInViewport();
        await expect(name).toHaveValue("테스트 모임");
        if (type === "SESSION") {
          await intro.fill("함께 만나요");
          await submit.scrollIntoViewIfNeeded();
          const beforeSchedule = await page.evaluate(() => window.scrollY);
          await submit.click();
          const scheduleButton = page.getByRole("button", { name: "모임 일정 설정" });
          await expect(scheduleButton).toBeFocused();
          await waitForScrollToSettle(page);
          await expect(scheduleButton).toBeInViewport();
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(beforeSchedule);
          await expect(page.getByRole("dialog", { name: "활동 일정" })).toHaveCount(0);
          expect(await page.evaluate(() => window.validationScrolls.at(-1).behavior))
            .toBe(reducedMotion === "reduce" ? "auto" : "smooth");
          await page.screenshot({ path: testInfo.outputPath("session-schedule-error.png") });

          await scheduleButton.click();
          const dialog = page.getByRole("dialog", { name: "활동 일정" });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByLabel("진행 날짜")).toBeFocused();
          await expect(dialog.getByLabel("진행 날짜")).toBeInViewport();
          await dialog.evaluate(async element => {
            await Promise.all(element.closest(".ui-overlay").getAnimations({ subtree: true })
              .filter(animation => animation.effect.getComputedTiming().iterations !== Infinity)
              .map(animation => animation.finished));
          });
          expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
          await page.screenshot({ path: testInfo.outputPath("session-date-error.png") });
        }
      }
      expect(creates).toEqual([]);
    });
  }
}
