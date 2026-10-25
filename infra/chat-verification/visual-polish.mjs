import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium, expect } = require("playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const output = "/private/tmp/jarihana-chat-realtime/evidence/polish";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1456, height: 853 }, recordVideo: { dir: output, size: { width: 1456, height: 853 } } });
await context.addInitScript(() => {
  if (!document.startViewTransition) return;
  const start = document.startViewTransition.bind(document);
  window.chatTransitionCount = 0;
  document.startViewTransition = (...args) => {
    const transition = start(...args);
    window.chatTransitionCount += 1;
    window.chatTransitionFinished = transition.finished.catch(() => {});
    return transition;
  };
});
const page = await context.newPage();
async function settleTransition() {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await window.chatTransitionFinished;
  });
}
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://localhost:5176/_preview/chat");
  await page.getByRole("button", { name: /하루로 시작하기/ }).click();
  await expect(page.getByLabel("메시지", { exact: true })).toBeVisible();
  const composer = page.getByLabel("메시지", { exact: true });
  const initialHeight = (await composer.boundingBox()).height;
  assert.ok(initialHeight <= 52);
  assert.equal(await page.getByRole("button", { name: "모임 정보", exact: true }).count(), 0);
  await composer.fill("첫 줄\n둘째 줄\n셋째 줄");
  assert.ok((await composer.boundingBox()).height > initialHeight);
  const inputBounds = await composer.boundingBox();
  const sendBounds = await page.locator(".chat-send").boundingBox();
  assert.ok(Math.abs(inputBounds.y + inputBounds.height - sendBounds.y - sendBounds.height) < 2);
  await composer.fill("");
  assert.ok((await composer.boundingBox()).height <= 52);
  await page.getByRole("button", { name: "채팅 닫기" }).click();
  const chat = page.locator(".app-header__desktop-action .app-header__chat");
  const create = page.locator(".app-header__desktop-action .app-header__create");
  const bell = page.locator(".app-header__desktop-action .notification-bell");
  const icon = await chat.locator("svg").evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, color: getComputedStyle(element).color }));
  assert.deepEqual(icon, await bell.locator("svg").evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, color: getComputedStyle(element).color })));
  assert.equal(await chat.innerText(), "");
  assert.ok((await create.boundingBox()).x < (await chat.boundingBox()).x);
  const chatBounds = await chat.boundingBox();
  const bellBounds = await bell.boundingBox();
  assert.ok(bellBounds.x - chatBounds.x - chatBounds.width <= 5);
  await page.screenshot({ path: `${output}/header.png` });
  await page.goto("http://localhost:5176/groups/905002");
  await expect(page.locator(".group-detail-page")).toBeVisible();
  await chat.click();
  await expect(page.getByText("대화할 모임을 선택해 주세요")).toBeVisible();
  assert.equal(await page.locator(".group-profile__art").evaluate((element) => getComputedStyle(element).viewTransitionName), "none");
  assert.equal(await page.getByRole("button", { name: "다시 불러오기", exact: true }).count(), 0);
  assert.equal(await page.getByText("함께하는 자리, 이어지는 이야기").count(), 0);
  await expect(page.locator(".chat-room-row__cover img")).toHaveCount(3);
  for (const width of [1456, 1135, 768, 360]) {
    await page.setViewportSize({ width, height: 853 });
    await expect(page.locator(".chat-room-row").first()).toBeVisible();
    const bounds = await page.locator(".chat-modal").boundingBox();
    if (width < 768) {
      assert.equal(bounds.x, 0);
      assert.equal(Math.round(bounds.width), width);
    } else {
      assert.ok(bounds.x > 0);
      assert.ok(bounds.width < width);
      const maximum = await page.locator(".chat-modal").evaluate((element) => parseFloat(getComputedStyle(document.documentElement).fontSize) * parseFloat(getComputedStyle(element).getPropertyValue("--chat-modal-width")));
      assert.ok(bounds.width <= maximum + 1);
    }
    const row = page.locator(".chat-room-row").first();
    const card = await row.boundingBox();
    const cover = await row.locator(".chat-room-row__cover").boundingBox();
    assert.ok(Math.abs(cover.height - (card.height - 2)) < 2);
    for (const selector of [".chat-room-row__title", ".chat-room-row__preview", "time"]) {
      const content = await row.locator(selector).boundingBox();
      assert.ok(content.x + content.width <= card.x + card.width);
    }
    await page.screenshot({ path: `${output}/inbox-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const axe = await new AxeBuilder({ page }).include(".chat-modal").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map((item) => item.id), []);
  }
  await page.setViewportSize({ width: 1135, height: 853 });
  await page.locator('[data-room-id="905002"]').hover();
  await page.screenshot({ path: `${output}/hover.png` });
  await page.locator('[data-room-id="905001"]').click();
  await expect(page.getByLabel("메시지", { exact: true })).toBeVisible();
  await page.getByLabel("메시지", { exact: true }).fill("전환해도 남는 초안");
  const selected = page.locator('.chat-room-row[aria-current="page"]');
  await expect(selected).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const selection = await selected.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, marker: getComputedStyle(element, "::before").content, border: getComputedStyle(element).borderColor }));
  assert.equal(selection.background, "rgb(255, 255, 255)");
  assert.equal(selection.marker, "none");
  const endedStyle = await page.locator('[data-room-id="905003"]').evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }));
  assert.notEqual(selection.background, endedStyle.background);
  assert.equal(selection.border, endedStyle.border);
  await expect(selected).not.toHaveCSS("box-shadow", "none");
  const baseFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-body").trim());
  assert.equal(await page.locator(".chat-layout").evaluate((element) => getComputedStyle(element).getPropertyValue("--text-body").trim()), baseFont);
  await selected.hover();
  assert.equal(await selected.evaluate((element) => getComputedStyle(element).borderColor), selection.border);
  const history = await page.locator(".chat-history").boundingBox();
  const thread = await page.locator(".chat-thread").boundingBox();
  assert.ok(thread.x - history.x <= 12);
  assert.ok(history.width - thread.width <= 40);
  await page.locator('[data-room-id="905002"]').click();
  await expect(page.getByRole("heading", { name: "리액트 같이 공부해요" })).toBeVisible();
  await page.locator('[data-room-id="905001"]').click();
  await expect(page.getByLabel("메시지", { exact: true })).toHaveValue("전환해도 남는 초안");
  await settleTransition();
  assert.ok(await page.evaluate(() => window.chatTransitionCount > 0));
  await page.screenshot({ path: `${output}/conversation.png` });
  await page.locator('[data-room-id="905003"]').click();
  await expect(page.getByText("종료된 모임이에요. 나눴던 이야기는 계속 볼 수 있어요.")).toBeVisible();
  await settleTransition();
  await page.screenshot({ path: `${output}/ended.png` });
  await page.setViewportSize({ width: 360, height: 853 });
  await page.getByRole("link", { name: "채팅 목록으로" }).click();
  await expect(page.locator('[data-room-id="905002"]')).toBeVisible();
  await page.locator('[data-room-id="905002"]').click();
  await expect(page.getByLabel("메시지", { exact: true })).toBeVisible();
  await settleTransition();
  await page.screenshot({ path: `${output}/mobile-room.png` });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".chat-conversation").evaluate((element) => getComputedStyle(element).animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "채팅 닫기" }).click();
  await expect(page.locator(".chat-modal")).toHaveCount(0);
  await expect(page.locator(".group-profile__art")).toHaveCSS("view-transition-name", "group-image");
  await page.goto("http://localhost:5176/groups?chat=905002");
  await page.getByRole("link", { name: "리액트 같이 공부해요 모임 상세 보기" }).click();
  await expect(page).toHaveURL("http://localhost:5176/groups/905002");
  await expect(page.locator(".chat-modal")).toHaveCount(0);
  await expect(page.locator(".group-detail-page")).toBeVisible();
  assert.deepEqual(errors, []);
  console.log("PASS site typography inherited, compact header icon gap, shadow selection with unchanged border, ended gray card, modal/thread geometry, 4 viewports/axe, room transitions/drafts, mobile back, reduced motion and zero page errors");
} finally {
  await context.close();
  await browser.close();
}
