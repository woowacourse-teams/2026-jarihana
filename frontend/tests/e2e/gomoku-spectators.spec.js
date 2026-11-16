import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture, prepareVisualCapture } from "./api-fixture.js";

for (const width of [390, 768, 1440]) {
  test.describe(`spectator roster ${width}px`, () => {
    test.use({ hasTouch: width === 390, isMobile: width === 390 });
    test(`spectator arrivals keep the board and focus stable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await installApiFixture(page);
      await page.addInitScript(() => {
        window.__presenceStreams = [];
        window.EventSource = class {
          constructor(url) {
            this.url = url;
            this.listeners = {};
            this.closed = false;
            window.__presenceStreams.push(this);
          }
          addEventListener(name, listener) {
            this.listeners[name] = listener;
            if (name === "snapshot") {
              void fetch(this.url.replace(/\/events$/, ""))
                .then((response) => response.json())
                .then((body) => {
                  if (!this.closed) listener({ data: JSON.stringify(body.data) });
                });
            }
          }
          close() {
            this.closed = true;
          }
        };
      });
      const room = {
        id: 1,
        hostMemberId: 1,
        hostName: "자리",
        guestMemberId: 2,
        guestName: "하나",
        visibility: "PUBLIC",
        rule: "RENJU",
        status: "PLAYING",
        hostReady: false,
        guestReady: false,
        gameNumber: 1,
        blackMemberId: 1,
        board: "0".repeat(225),
        ply: 0,
        lastX: null,
        lastY: null,
        winnerMemberId: null,
        endReason: null,
        revision: 1,
        serverNow: Date.now(),
        turnDeadline: Date.now() + 60000
      };
      await page.route("**/api/games/gomoku/**", (route) => {
        if (new URL(route.request().url()).pathname.endsWith("/chat/messages")) {
          return route.fulfill({
            status: 404,
            json: {
              success: false,
              data: null,
              error: { code: "GOMOKU_CHAT_DISABLED", message: "채팅 비활성" }
            }
          });
        }
        return route.fulfill({ json: { success: true, data: room, error: null } });
      });
      const presence = (spectators) =>
        page.evaluate((people) => {
          window.__presenceStreams
            .filter((stream) => !stream.closed)
            .forEach((stream) => {
              stream.listeners.spectators_changed({
                data: JSON.stringify({ roomId: 1, spectators: people })
              });
            });
        }, spectators);

      await page.goto("/games/gomoku/rooms/1");
      await expect(page.getByText("내 차례", { exact: true })).toBeVisible();
      const current = [
        { memberId: 3, name: "여름", avatarUrl: "https://avatars.githubusercontent.com/u/3" }
      ];
      await presence(current);
      const notice = page.locator(".gomoku-spectators");
      await expect(notice).toContainText("관전자 1명");
      const center = page.getByRole("button", { name: /^H8,/ });
      await center.click();
      await expect(center).toBeFocused();
      const before = await page.locator(".gomoku-table").boundingBox();
      const spectators = [
        ...current,
        { memberId: 4, name: "봄날", avatarUrl: "https://avatars.githubusercontent.com/u/4" }
      ];
      await presence(spectators);
      const trigger = page.getByRole("button", { name: "관전자 2명", exact: true });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(notice.getByRole("status")).toHaveCount(0);
      await expect(page.getByText(/관전을 시작했어요/)).toHaveCount(0);
      await expect(center).toBeFocused();
      expect(await page.locator(".gomoku-table").boundingBox()).toEqual(before);
      await expect(page.getByRole("button", { name: "자리하기", exact: true })).toBeEnabled();
      if (width === 390) await trigger.tap();
      else await trigger.hover();
      const panel = page.getByRole("region", { name: "관전자 목록" });
      await expect(panel).toBeVisible();
      await expect(panel.getByText("봄날", { exact: true })).toBeVisible();
      await expect(panel.getByRole("img", { name: "봄날 프로필" })).toBeVisible();
      if (width !== 390) await panel.hover();
      await expect(panel).toBeVisible();
      expect(await page.locator(".gomoku-table").boundingBox()).toEqual(before);
      await expect(trigger).toHaveAttribute(
        "data-ph-capture-attribute-action",
        "gomoku_spectators_toggle"
      );
      await expect(notice).toHaveAttribute("data-ph-private", "true");
      await prepareVisualCapture(page);
      await page.screenshot({ path: `test-results/gomoku-roster-${width}.png`, fullPage: true });
      expect(
        (await new AxeBuilder({ page }).include(".games-page--room").analyze()).violations
      ).toEqual([]);

      const many = Array.from({ length: 20 }, (_, index) => ({
        memberId: index + 10,
        name: index === 0 ? "아주긴관전자닉네임".repeat(5) : `관전자${index}`,
        avatarUrl: null
      }));
      await presence(many);
      await expect(panel.getByRole("listitem")).toHaveCount(20);
      expect(await panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
      expect(await page.locator(".gomoku-table").boundingBox()).toEqual(before);
      const roomSettings = page.getByRole("list", { name: "방 설정" });
      if (width === 390) await roomSettings.tap();
      else {
        await roomSettings.hover();
        expect(await panel.count()).toBe(0);
      }
      await expect(panel).toHaveCount(0);
      const updatedTrigger = page.getByRole("button", { name: "관전자 20명" });
      await updatedTrigger.focus();
      await expect(panel).toBeVisible();
      await updatedTrigger.press("Tab");
      await expect(panel).toBeFocused();
      await panel.press("Escape");
      await expect(updatedTrigger).toBeFocused();
      await expect(panel).toHaveCount(0);
      await presence([]);
      await expect(page.getByRole("button", { name: "관전자 0명" })).toBeVisible();
    });
  });
}
