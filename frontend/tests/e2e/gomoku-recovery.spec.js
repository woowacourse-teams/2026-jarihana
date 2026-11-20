import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

async function prepareRoom(page, status = "PLAYING") {
  await installApiFixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    window.__gomokuStreams = [];
    window.EventSource = class {
      constructor(url) { this.url = url; window.__gomokuStreams.push(this); }
      addEventListener(name, callback) {
        this[name] = callback;
        if (name === "snapshot" && window.__gomokuStreams.length === 1)
          void fetch(this.url.replace(/\/events$/, ""))
            .then((response) => response.json())
            .then((body) => { if (!this.closed) callback({ data: JSON.stringify(body.data) }); });
      }
      close() { this.closed = true; }
    };
  });
  const state = {
    failRead: false, moves: [], resigns: 0, invites: 0,
    room: {
      id: 1, hostMemberId: 1, hostName: "자리", guestMemberId: 2, guestName: "친구",
      visibility: "PUBLIC", rule: "RENJU", status, hostReady: false, guestReady: false,
      gameNumber: 1, blackMemberId: 1, board: "0".repeat(225), ply: 0,
      lastX: null, lastY: null, winnerMemberId: null, endReason: null,
      revision: 1, serverNow: Date.now(), turnDeadline: Date.now() + 60000
    }
  };
  await page.route("**/api/games/gomoku/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (data) => route.fulfill({ json: { success: true, data, error: null } });
    if (path.endsWith("/moves")) {
      state.moves.push(route.request().postDataJSON());
      Object.assign(state.room, { board: "0".repeat(112) + "1" + "0".repeat(112), ply: 1, lastX: 7, lastY: 7, revision: state.room.revision + 1 });
      state.failRead = true;
      return reply({ roomId: 1 });
    }
    if (path.endsWith("/resign")) {
      state.resigns += 1;
      Object.assign(state.room, { status: "FINISHED", winnerMemberId: 2, endReason: "RESIGN", revision: state.room.revision + 1 });
      state.failRead = true;
      return reply({ roomId: 1 });
    }
    if (path.endsWith("/invite")) {
      state.invites += 1;
      state.failRead = true;
      return reply({ token: "review-new-invitation" });
    }
    if (state.failRead) return route.fulfill({ status: 503, json: { success: false, data: null, error: { code: "TEMPORARILY_UNAVAILABLE" } } });
    return reply(state.room);
  });
  await page.goto("/games/gomoku/rooms/1");
  await expect(page.getByRole("button", { name: "H8, 빈 자리" })).toHaveCount(1);
  return state;
}

async function snapshot(page, room) {
  await page.evaluate((value) => window.__gomokuStreams.at(-1).snapshot({ data: JSON.stringify(value) }), room);
}

test("immediate SSE recovery keeps the move available and legacy UUID works despite refresh failure", async ({ page }) => {
  const fixedNow = new Date("2026-11-03T12:00:00Z");
  await page.clock.setFixedTime(fixedNow);
  const state = await prepareRoom(page);
  state.room.serverNow = fixedNow.getTime();
  state.room.turnDeadline = fixedNow.getTime() + 1000;
  state.room.revision += 1;
  await snapshot(page, state.room);
  await expect(page.getByLabel("남은 시간 1초")).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 차례예요" })).toBeVisible();
  await page.getByRole("button", { name: "H8, 빈 자리" }).click();
  await page.evaluate(() => window.__gomokuStreams[0].onerror());
  await expect.poll(() => page.evaluate(() => window.__gomokuStreams.length)).toBe(2);
  const confirm = page.getByRole("button", { name: "자리하기", exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => state.moves.length).toBe(1);
  expect(state.moves[0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(confirm).toBeDisabled();
  await expect(page.getByText("요청은 처리됐어요. 최신 게임 정보를 다시 확인하고 있어요.")).toBeVisible();
  await snapshot(page, state.room);
  await expect(page.getByRole("button", { name: "H8, 흑돌, 마지막 수" })).toBeVisible();
  await expect(page.getByText("요청은 처리됐어요. 최신 게임 정보를 다시 확인하고 있어요.")).toHaveCount(0);
});

test("successful resignation closes its confirmation even when the refresh fails", async ({ page }) => {
  const state = await prepareRoom(page);
  await page.getByRole("button", { name: "기권하기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "기권할까요?" });
  await dialog.getByRole("button", { name: "기권하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.resigns).toBe(1);
  await snapshot(page, state.room);
  await expect(page.getByRole("heading", { name: "LOSE" })).toBeVisible();
});

test("new invitation remains available after a failed follow-up query", async ({ page }) => {
  const state = await prepareRoom(page, "WAITING");
  await page.getByRole("button", { name: "초대하기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "초대 링크" })).toHaveValue(/\/games\/gomoku\/invite\/review-new-invitation$/);
  expect(state.invites).toBe(1);
});
