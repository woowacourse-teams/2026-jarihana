import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium, expect } = require("playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const output = "/private/tmp/jarihana-chat-realtime/evidence/entry-placement";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://localhost:5176/_preview/chat");
  await page.getByRole("button", { name: /하루로 시작하기/ }).click();
  await expect(page.getByRole("button", { name: "채팅 닫기" })).toBeVisible();
  await page.goto("http://localhost:5176/my");
  await expect(page.locator(".activity-row").first()).toBeVisible();
  assert.equal(await page.locator('.activity-row a[href*="chat="]').count(), 0);
  for (const groupId of ["905001", "905002"]) {
    await page.goto(`http://localhost:5176/groups/${groupId}`);
    for (const width of [1456, 1135, 858, 768, 360]) {
      await page.setViewportSize({ width, height: 853 });
      const link = page.locator(".group-detail-chat:visible");
      await expect(link).toBeVisible();
      await link.scrollIntoViewIfNeeded();
      assert.equal(await page.locator(".group-profile .group-chat-shortcut").count(), 0);
      const bounds = await link.boundingBox();
      assert.equal(await page.locator(".group-detail-tabs .group-detail-chat").count(), 0);
      const container = width >= 1260 ? ".group-rail--desktop" : ".group-recruitment-entry";
      await expect(page.locator(`${container} .group-detail-chat`)).toBeVisible();
      assert.ok(await link.evaluate((element) => element === element.parentElement.lastElementChild));
      assert.ok(bounds.x + bounds.width <= width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const axe = await new AxeBuilder({ page }).include(container).analyze();
      assert.deepEqual(axe.violations.map((item) => item.id), []);
      await page.screenshot({ path: `${output}/${groupId}-${width}.png` });
      await link.click();
      await expect(page.locator(".chat-modal")).toBeVisible();
      assert.equal(new URL(page.url()).searchParams.get("chat"), groupId);
      await page.getByRole("button", { name: "채팅 닫기" }).click();
      await expect(page.locator(".chat-modal")).toHaveCount(0);
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS my-page chat removal; detail desktop sidebar/mobile action chat placement, opening/closing, overflow and axe at 1456/1135/858/768/360px; zero page errors");
} finally {
  await context.close();
  await browser.close();
}
