import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { blue, green, request, until, user } from "./verify.mjs";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");
const output = process.env.CHAT_EVIDENCE_DIR ?? "/private/tmp/jarihana-chat-realtime/evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const a = user(901001), b = user(901002);

async function makePage(account, port) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await context.addCookies([
    { name: "accessToken", value: account.accessToken, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "XSRF-TOKEN", value: account.csrf, domain: "127.0.0.1", path: "/", sameSite: "Lax" }
  ]);
  const page = await context.newPage();
  const errors = [];
  const connections = [];
  let navigation = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigation++; });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (connection) => {
    const state = { closed: false, navigation };
    connections.push(state);
    connection.on("close", () => { state.closed = true; });
  });
  await page.goto(`http://127.0.0.1:${port}/chat/902002`);
  await page.getByLabel("메시지", { exact: true }).waitFor();
  return { page, context, errors, connections, currentConnections: () => connections.filter((state) => state.navigation === navigation), port };
}

try {
  const first = await makePage(a, 5176);
  const second = await makePage(b, 5177);
  const { page } = first;
  const reply = second.page;
  const text = `브라우저 전달 ${randomUUID()}`;
  await page.getByLabel("메시지", { exact: true }).fill(text);
  await page.getByLabel("메시지", { exact: true }).press("Enter");
  await reply.locator(".chat-message__bubble", { hasText: text }).waitFor();
  assert.equal(await page.locator(".chat-message__bubble", { hasText: text }).count(), 1);
  assert.equal(await reply.locator(".chat-message__bubble", { hasText: text }).count(), 1);
  console.log("PASS browser users on different servers exchange one rendered message");

  let sentDuringComposition = 0;
  const trackComposition = (req) => { if (req.method() === "POST" && req.url().endsWith("/chat/messages")) sentDuringComposition++; };
  page.on("request", trackComposition);
  await page.getByLabel("메시지", { exact: true }).fill("한글 조합 중");
  await page.getByLabel("메시지", { exact: true }).dispatchEvent("compositionstart");
  await page.getByLabel("메시지", { exact: true }).dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229, bubbles: true });
  await delay(250);
  assert.equal(sentDuringComposition, 0);
  await page.getByLabel("메시지", { exact: true }).dispatchEvent("compositionend");
  await page.getByLabel("메시지", { exact: true }).fill("");
  page.off("request", trackComposition);

  const retryText = `실패 후 재시도 ${randomUUID()}`;
  const requests = [];
  await page.route("**/api/groups/902002/chat/messages", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.getByLabel("메시지", { exact: true }).fill(retryText);
  await page.getByLabel("메시지", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "전송 실패 · 다시 보내기" }).click();
  await reply.locator(".chat-message__bubble", { hasText: retryText }).waitFor();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].clientMessageId, requests[1].clientMessageId);
  assert.equal(await page.locator(".chat-message__bubble", { hasText: retryText }).count(), 1);
  await page.unroute("**/api/groups/902002/chat/messages");
  console.log("PASS IME does not send; failed send retries same key without duplicate");

  await first.context.setOffline(true);
  const recovered = `재연결 복구 ${randomUUID()}`;
  const saved = await request(b, green, "/groups/902002/chat/messages", "POST", { clientMessageId: randomUUID(), content: recovered });
  assert.equal(saved.status, 201);
  await first.context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator(".chat-message__bubble", { hasText: recovered }).waitFor();
  assert.equal(await page.locator(".chat-message__bubble", { hasText: recovered }).count(), 1);
  console.log("PASS browser offline recovery");

  await page.bringToFront();
  const slider = page.getByRole("slider", { name: "채팅 목록 너비 조절" });
  const before = await page.locator(".chat-sidebar").evaluate((el) => el.getBoundingClientRect().width);
  await slider.focus();
  await slider.press("ArrowRight");
  const after = await page.locator(".chat-sidebar").evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(after > before, `Sidebar width ${before} -> ${after}`);
  const underline = await page.getByLabel("메시지", { exact: true }).evaluate((el) => {
    const style = getComputedStyle(el);
    return { top: style.borderTopWidth, left: style.borderLeftWidth, bottom: style.borderBottomWidth };
  });
  assert.equal(underline.top, "0px");
  assert.equal(underline.left, "0px");
  assert.ok(parseFloat(underline.bottom) > 0);
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await delay(150);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow`);
    assert.ok(await page.getByLabel("메시지", { exact: true }).isVisible());
    await page.screenshot({ path: `${output}/chat-${width}.png`, fullPage: true });
    const accessibility = await new AxeBuilder({ page }).include(".chat-layout").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), []);
  }
  console.log("PASS resize, underline, 1440/768/360 overflow and chat accessibility");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5176/chat/902001");
  const older = page.getByRole("button", { name: "이전 대화 보기" });
  await older.waitFor();
  await page.locator(".chat-history").evaluate((el) => { el.scrollTop = 0; });
  const count = await page.locator(".chat-message").count();
  await older.click();
  await until(async () => await page.locator(".chat-message").count() > count, "older history appended");
  const top = await page.locator(".chat-history").evaluate((el) => el.scrollTop);
  assert.ok(top > 0, "History prepend preserves previous visible area");
  const roomList = await request(a, blue, "/chats?size=100");
  const ended = roomList.data.items.find((room) => room.status === "ENDED");
  assert.ok(ended, "Run functional verification before browser verification");
  await page.goto(`http://127.0.0.1:5176/chat/${ended.groupId}`);
  await page.getByText("종료된 모임이에요. 나눴던 이야기는 계속 볼 수 있어요.").waitFor();
  assert.equal(await page.getByLabel("메시지", { exact: true }).count(), 0);
  assert.ok(await page.locator(".chat-message").count() > 0);
  await until(() => first.currentConnections().some((state) => !state.closed), "ended room socket is connected before logout");
  const logoutConnections = first.currentConnections();
  await page.getByRole("button", { name: "채팅 닫기" }).click();
  await page.getByRole("button", { name: "프로필 메뉴" }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await until(async () => await page.locator(".chat-layout").count() === 0 && logoutConnections.every((state) => state.closed), "logout removes chat and closes sockets");
  console.log("PASS ended room keeps history without composer; logout clears chat surface and sockets");
  assert.deepEqual(first.errors, []);
  assert.deepEqual(second.errors, []);
  console.log("PASS historical pagination scroll anchor; no uncaught browser errors");
} finally { await browser.close(); }
