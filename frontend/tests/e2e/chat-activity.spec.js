import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

test("home reports account activity on the shared socket and pauses only reports in the background", async ({ page }) => {
  await page.clock.install();
  await installApiFixture(page);
  await page.addInitScript(() => { delete window.PushManager; });
  const sockets = [];
  const reports = [];
  await page.routeWebSocket("**/api/ws/chat", (socket) => {
    sockets.push(socket);
    socket.onMessage((frame) => {
      const text = String(frame);
      if (text.startsWith("CONNECT")) socket.send("CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\u0000");
      if (text.startsWith("SEND")) reports.push(text);
    });
  });
  await page.goto("/groups");
  await page.bringToFront();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toContain("destination:/app/presence/active\n");
  expect(reports[0].split("\n\n")[1]).toBe("\u0000");
  await expect(page.getByRole("dialog", { name: "모임 채팅" })).toHaveCount(0);

  // Headless Chromium keeps both tabs focused/visible, so control these browser states.
  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  await page.clock.runFor(20000);
  expect(reports).toHaveLength(1);
  expect(sockets).toHaveLength(1);
  await page.evaluate(() => {
    delete document.hasFocus;
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => reports.length).toBe(2);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(20000);
  expect(reports).toHaveLength(2);
  expect(sockets).toHaveLength(1);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reports.length).toBe(3);
  await page.mouse.move(50, 100);
  await page.mouse.move(150, 100);
  expect(reports).toHaveLength(3);
  await page.clock.runFor(10000);
  await expect.poll(() => reports.length).toBe(4);
  expect(sockets).toHaveLength(1);
});
