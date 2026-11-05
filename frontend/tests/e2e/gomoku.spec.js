import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const { width, confirmation } of [390, 1200].flatMap((width) =>
  ["button", "double-click"].map((confirmation) => ({ width, confirmation }))
)) {
  test(`gomoku catalog, waiting room creation and ${confirmation} move at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await installApiFixture(page);
    // Playwright fulfill closes SSE responses, so keep the UI fixture connection open.
    // Production EventSource lifecycle is exercised separately by the hook tests.
    await page.addInitScript(() => {
      window.__gomokuCopiedLinks = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__gomokuCopiedLinks.push(value);
          }
        }
      });
      window.EventSource = class {
        constructor(url) {
          this.url = url;
          this.closed = false;
        }
        addEventListener(name, listener) {
          if (name === "snapshot")
            void fetch(this.url.replace(/\/events$/, ""))
              .then((response) => response.json())
              .then((body) => {
                if (!this.closed) listener({ data: JSON.stringify(body.data) });
              });
        }
        close() {
          this.closed = true;
        }
      };
    });
    const room = {
      id: 1,
      hostMemberId: 1,
      hostName: "테스트 크루",
      guestMemberId: 2,
      guestName: "상대",
      visibility: "PUBLIC",
      rule: "RENJU",
      status: "WAITING",
      hostReady: false,
      guestReady: false,
      gameNumber: 0,
      blackMemberId: 0,
      board: "0".repeat(225),
      ply: 0,
      lastX: null,
      lastY: null,
      winnerMemberId: null,
      endReason: null,
      revision: 1,
      serverNow: Date.now(),
      turnDeadline: null
    };
    let created;
    let ready;
    let move;
    let moveCount = 0;
    let resign;
    let invitationCount = 0;
    const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
    await page.route("**/api/games/gomoku/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/events"))
        return route.fulfill({
          contentType: "text/event-stream",
          body: `event: snapshot\nid: ${room.revision}\ndata: ${JSON.stringify(room)}\n\n`
        });
      if (path.endsWith("/moves")) {
        moveCount += 1;
        move = route.request().postDataJSON();
        room.board = "0".repeat(112) + "1" + "0".repeat(112);
        room.ply = 1;
        room.lastX = 7;
        room.lastY = 7;
        room.revision += 1;
        return reply(route, { roomId: 1 });
      }
      if (path.endsWith("/resign")) {
        resign = route.request().postDataJSON();
        room.status = "FINISHED";
        room.endReason = "RESIGN";
        room.winnerMemberId = 2;
        room.revision += 1;
        return reply(route, { roomId: 1 });
      }
      if (path.endsWith("/me")) return reply(route, { roomId: null });
      if (path.endsWith("/invite")) {
        invitationCount += 1;
        return reply(route, { token: `layout-test-token-${invitationCount}` });
      }
      if (path.endsWith("/ready")) {
        ready = route.request().postDataJSON();
        room.hostReady = ready.ready;
        room.revision += 1;
        return reply(route, { roomId: 1 });
      }
      if (path.endsWith("/rooms/1")) return reply(route, room);
      if (route.request().method() === "POST") {
        created = route.request().postDataJSON();
        return reply(route, { roomId: 1 });
      }
      return reply(route, { items: [], nextCursor: null, hasNext: false });
    });
    await page.goto("/games");
    await expect(page.getByRole("heading", { name: "게임방", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "준비 중", exact: true })).toBeDisabled();
    await page.locator('[data-ph-capture-attribute-action="gomoku_lobby_open"]').click();
    await expect(page.getByRole("heading", { name: "대기실", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "방 만들기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "방 만들기" });
    await expect(dialog.getByRole("radio", { name: /^공개/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "기본 규칙", exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "방 만들기", exact: true }).click();
    await expect(page).toHaveURL(/\/games\/gomoku\/rooms\/1$/);
    expect(created).toEqual({ visibility: "PUBLIC", rule: "RENJU" });
    await expect(page.getByRole("heading", { name: "대국 준비" })).toBeVisible();
    await expect(page.locator(".gomoku-cell")).toHaveCount(225);
    await expect(
      page.locator('[data-ph-capture-attribute-action="gomoku_move_confirm"]')
    ).toHaveCount(0);
    const board = page.locator(".gomoku-table");
    const boardGeometry = () =>
      board.evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x: x + window.scrollX, y: y + window.scrollY, width, height };
      });
    const originalBoard = await boardGeometry();
    await page.getByRole("button", { name: "초대링크", exact: true }).click();
    const invitation = page.getByRole("region", { name: "초대 링크", exact: true });
    await expect(invitation).toBeVisible();
    const invitationInput = invitation.getByRole("textbox", { name: "초대 링크" });
    await expect(invitationInput).toHaveValue(/layout-test-token-1$/);
    const copyIcon = invitation.getByRole("button", { name: "복사", exact: true });
    await expect(copyIcon).toHaveText("");
    const inputBox = await invitationInput.boundingBox();
    const copyBox = await copyIcon.boundingBox();
    const fieldBox = await invitation.locator(".gomoku-invitation-field").boundingBox();
    expect(copyBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width);
    expect(copyBox.x + copyBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);
    expect(await page.evaluate(() => window.__gomokuCopiedLinks)).toEqual([]);
    expect(await boardGeometry()).toEqual(originalBoard);
    await page.screenshot({ path: `test-results/gomoku-invitation-open-${width}.png` });
    await page.getByRole("button", { name: "초대링크", exact: true }).click();
    await expect(invitation).toHaveCount(0);
    expect(await boardGeometry()).toEqual(originalBoard);
    const invitationToggle = page.getByRole("button", { name: "초대링크", exact: true });
    await expect(invitationToggle).toBeFocused();
    await invitationToggle.click();
    await expect(invitationInput).toHaveValue(/layout-test-token-1$/);
    expect(invitationCount).toBe(1);
    await invitationInput.focus();
    await page.keyboard.press("Escape");
    await expect(invitationToggle).toBeFocused();
    await expect(invitation).toHaveCount(0);
    await invitationToggle.click();
    await invitation.getByRole("button", { name: "새 링크 만들기" }).click();
    await expect(invitationInput).toHaveValue(/layout-test-token-2$/);
    expect(await boardGeometry()).toEqual(originalBoard);
    expect(await page.evaluate(() => window.__gomokuCopiedLinks)).toEqual([]);
    await invitation.getByRole("button", { name: "복사", exact: true }).click();
    await expect(invitation).toHaveCount(0);
    expect(await page.evaluate(() => window.__gomokuCopiedLinks)).toEqual([
      "http://127.0.0.1:4174/games/gomoku/invite/layout-test-token-2"
    ]);
    await expect(invitationToggle).toBeFocused();
    expect(await boardGeometry()).toEqual(originalBoard);
    await page.screenshot({ path: `test-results/gomoku-invitation-copied-${width}.png` });
    await page.getByRole("button", { name: "준비하기", exact: true }).click();
    await expect.poll(() => ready).toEqual({ ready: true, gameNumber: 1 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: `test-results/gomoku-room-${confirmation}-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
    Object.assign(room, {
      hostReady: false,
      guestReady: false,
      guestMemberId: 2,
      guestName: "상대",
      gameNumber: 1,
      blackMemberId: 1,
      status: "PLAYING",
      revision: 3,
      turnDeadline: Date.now() + 60000,
      serverNow: Date.now()
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "내 차례예요" })).toBeVisible();
    await expect
      .poll(async () => Number(await page.locator(".gomoku-clock strong").textContent()))
      .toBeLessThanOrEqual(60);
    await page.getByRole("button", { name: "H8, 빈 자리" }).click();
    expect(move).toBeUndefined();
    if (confirmation === "double-click") {
      await page.getByRole("button", { name: "A1, 빈 자리" }).click();
      await page.getByRole("button", { name: "H8, 빈 자리" }).dblclick();
    } else {
      await page.getByRole("button", { name: "자리하기", exact: true }).click();
    }
    await expect.poll(() => move?.expectedPly).toBe(0);
    expect(move).toMatchObject({ x: 7, y: 7, gameNumber: 1 });
    expect(move.requestId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.getByRole("button", { name: "H8, 흑돌, 마지막 수" })).toBeVisible();
    await expect(page.getByRole("button", { name: "I8, 빈 자리" })).toBeDisabled();
    await page.getByRole("button", { name: "I8, 빈 자리" }).dblclick({ force: true });
    expect(moveCount).toBe(1);
    await page.screenshot({ path: `test-results/gomoku-move-${confirmation}-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "기권하기", exact: true }).click();
    const resignDialog = page.getByRole("dialog", { name: "기권할까요?" });
    expect(resign).toBeUndefined();
    await resignDialog.getByRole("button", { name: "기권하기", exact: true }).click();
    await expect.poll(() => resign).toEqual({ gameNumber: 1 });
    await expect(page.getByRole("heading", { name: "LOSE" })).toBeVisible();
    await page.getByRole("button", { name: "다시 대결", exact: true }).click();
    await expect.poll(() => ready).toEqual({ ready: true, gameNumber: 2 });
  });
}
