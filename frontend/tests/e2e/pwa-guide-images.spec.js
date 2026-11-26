import { expect, test } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

test("설치 안내의 브라우저별 스크린샷을 프론트 배포 파일에서 읽는다", async ({ page }) => {
  await installApiFixture(page, { auth: "anonymous" });
  await page.goto("/groups");
  await page.getByRole("button", { name: "설치 안내 보기" }).click();

  const guide = page.getByRole("dialog", { name: /PWA 앱 설치/ });
  const screenshot = guide.locator(".pwa-guide__screenshot img");
  const sources = new Set();
  for (const [device, browser] of [
    ["iOS", "Chrome"], ["iOS", "Safari"],
    ["Android", "Chrome"], ["Android", "삼성 브라우저"]
  ]) {
    await guide.getByRole("tab", { name: device, exact: true }).click();
    await guide.getByRole("tab", { name: browser, exact: true }).click();
    const steps = Number(await guide.getByRole("progressbar").getAttribute("aria-valuemax"));
    for (let step = 0; step < steps; step++) {
      if (step > 0) await guide.getByRole("button", { name: "다음", exact: true }).click();
      await expect(screenshot).toHaveAttribute("src", /^\/assets\/push-guide\//);
      sources.add(await screenshot.evaluate(async (image) => {
        await image.decode();
        return image.currentSrc;
      }));
    }
  }
  expect(sources.size).toBe(15);
});
