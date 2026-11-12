import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function startBrowserPreview(root) {
  const directory = path.join(root, "frontend/dist");
  await stat(path.join(directory, "index.html"));
  const mime = { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
  const preview = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    let target = path.resolve(directory, `.${decodeURIComponent(pathname)}`);
    if (!target.startsWith(`${directory}${path.sep}`)) target = path.join(directory, "index.html");
    try { if (!(await stat(target)).isFile()) target = path.join(directory, "index.html"); }
    catch { target = path.join(directory, "index.html"); }
    try { response.writeHead(200, { "Content-Type": mime[path.extname(target)] ?? "text/html", "Cache-Control": "no-store" }); response.end(await readFile(target)); }
    catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { preview.once("error", reject); preview.listen(0, "127.0.0.1", resolve); });
  return {
    originUrl: `http://127.0.0.1:${preview.address().port}`,
    async close() {
      preview.closeAllConnections();
      await new Promise((resolve) => preview.close(resolve));
    },
  };
}

// Uses the real production bundle and WebSocket server. Existing HTTP UI fixtures
// supply account/group data; backend authorization is tested separately.
export async function verifyBrowser({ root, originUrl, url, token, room, revision, evidence }) {
  const require = createRequire(path.join(root, "frontend/package.json"));
  const { chromium } = require("playwright");
  const { installApiFixture, group, leader } = await import(pathToFileURL(path.join(root, "frontend/tests/e2e/api-fixture.js")));
  let browser;
  const receipt = [];
  const errors = [];
  const frames = [];
  const sent = [];
  try {
    browser = await chromium.launch({ headless: true });
    const pages = [];
    for (const memberId of ["1", "2"]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: "ko-KR", reducedMotion: "reduce" });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("websocket", (socket) => {
        if (!socket.url().endsWith("/ws/realtime")) return;
        socket.on("framesent", ({ payload }) => {
          try {
            const message = JSON.parse(payload.toString());
            sent.push({ memberId, type: message.type, payload: message.payload, moveSeq: message.moveSeq });
          } catch { /* non-JSON transport frames */ }
        });
        socket.on("framereceived", ({ payload }) => {
          try { frames.push({ memberId, message: JSON.parse(payload.toString()) }); } catch { /* non-JSON transport frames */ }
        });
      });
      await installApiFixture(page);
      const success = (data) => ({ success: true, data, error: null });
      await page.route("**/api/members/me", (route) => route.fulfill({ json: success({ member: { ...leader, id: Number(memberId), crewName: `tester-${memberId}` }, signupCompleted: true }) }));
      await page.route(`**/api/groups/${group.id}/space`, (route) => route.fulfill({ json: success({ room, revision: revision(), canEdit: memberId === "1", updatedAt: null }) }));
      await page.route(`**/api/groups/${group.id}/space/join-token`, (route) => route.fulfill({ json: success({ token: token(memberId, String(group.id)), websocketUrl: url, expiresAt: Date.now() + 60000 }) }));
      await page.goto(`${originUrl}/groups/${group.id}`);
      await page.getByRole("button", { name: "놀러가기", exact: true }).waitFor({ timeout: 90000 });
      await page.getByRole("button", { name: "놀러가기", exact: true }).click();
      await page.getByText("함께 있는 아지트", { exact: true }).waitFor({ timeout: 45000 });
      await page.keyboard.press("Escape");
      pages.push(page);
      process.stdout.write(`Browser ${memberId} joined\n`);
    }
    const until = async (predicate, name, timeout = 15000) => {
      const expires = Date.now() + timeout;
      while (Date.now() < expires) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
      throw new Error(`Browser verification timed out: ${name}`);
    };
    const latest = (id) => frames.filter((frame) => frame.memberId === id && ["ROOM_STATE", "ROOM_SNAPSHOT"].includes(frame.message.type)).at(-1)?.message;
    await until(() => latest("1")?.participants.length === 2 && latest("2")?.participants.length === 2, "two participants");
    receipt.push("two isolated browser sessions join the same real room");
    for (const memberId of ["1", "2"]) {
      const appearances = latest(memberId).participants.map((actor) => [actor.memberId, actor.avatarAppearance?.outfit]);
      assert.deepEqual(Object.fromEntries(appearances), { "1": "mint", "2": "coral" });
    }
    receipt.push("both sessions receive each member's saved avatar appearance");
    await pages[0].bringToFront();
    await pages[0].getByRole("button", { name: "인사 H", exact: true }).click();
    await until(() => latest("2")?.participants.find((actor) => actor.memberId === "1")?.emote?.kind === "wave", "greeting fan-out");
    receipt.push("UI greeting is accepted and delivered to the second browser");
    const origin = latest("2").participants.find((actor) => actor.memberId === "1").position;
    await pages[0].locator(".room-canvas").click({ position: { x: 500, y: 500 } });
    await pages[0].keyboard.down("KeyA");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await pages[0].keyboard.up("KeyA");
    await until(() => frames.some(({ memberId, message }) => memberId === "2" && message.type === "MOVEMENT_FRAME" &&
      message.participants.some((actor) => actor.memberId === "1" && actor.locomotion === "walking" &&
        Math.hypot(actor.position.x - origin.x, actor.position.z - origin.z) > 0.1)), "movement fan-out");
    receipt.push("keyboard movement reaches the remote browser");
    await pages[0].keyboard.press("Escape");
    const movement = sent.filter((frame) => frame.memberId === "1" && frame.type === "MOVE").at(-1).payload;
    const desiredYaw = Math.atan2(-5 - movement.x, -(6.5 - movement.z));
    await pages[0].locator(".room-canvas").focus();
    await pages[0].keyboard.down("ArrowLeft");
    await until(() => sent.filter((frame) => frame.memberId === "1" && frame.type === "MOVE").at(-1)?.payload.yaw <= desiredYaw + 0.08, "turn toward camera cabinet", 35000);
    await pages[0].keyboard.up("ArrowLeft");
    await pages[0].keyboard.press("KeyE");
    await pages[0].getByRole("button", { name: /카메라 꺼내기/ }).click();
    await pages[0].getByRole("button", { name: "사진 찍기", exact: true }).click();
    const photo = pages[0].getByRole("dialog", { name: "아지트 사진", exact: true });
    await photo.waitFor();
    await photo.getByAltText("방금 촬영한 아지트").evaluate((img) => img.decode());
    await pages[0].screenshot({ path: path.join(evidence, "camera-preview.png"), fullPage: true });
    await photo.getByRole("button", { name: "활동 기록에 첨부", exact: true }).click();
    const composer = pages[0].getByRole("dialog", { name: "활동 기록 남기기", exact: true });
    await composer.waitFor();
    assert.equal(await composer.getByAltText("선택한 활동 사진 미리보기").count(), 1);
    await composer.getByRole("button", { name: "닫기", exact: true }).click();
    receipt.push("camera is taken through shared UI, captures a preview and attaches to the activity form");
    for (let index = 0; index < pages.length; index += 1) {
      await pages[index].keyboard.press("Escape");
      await pages[index].getByRole("button", { name: "시점 설정", exact: true }).click();
      await pages[index].getByRole("button", { name: "3인칭", exact: true }).click();
      await pages[index].screenshot({ path: path.join(evidence, `browser-${index + 1}.png`), fullPage: true });
      assert.equal(await pages[index].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(evidence, "browser-receipt.json"), JSON.stringify({ passed: receipt, errors, browser: browser.version() }, null, 2));
    return receipt;
  } catch (error) {
    await writeFile(path.join(evidence, "browser-failure.json"), JSON.stringify({ message: error.message, passed: receipt, errors, sent: sent.slice(-20), frames: frames.slice(-12) }, null, 2));
    for (const [index, page] of (browser?.contexts().flatMap((context) => context.pages()) ?? []).entries()) {
      await page.screenshot({ path: path.join(evidence, `browser-failure-${index}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close();
  }
}
