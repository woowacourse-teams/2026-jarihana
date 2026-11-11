import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture } from "./api-fixture.js";

function encoded(black, white = [[0,0],[2,0],[4,0],[6,0]]) {
  const cells = Array(225).fill("0");
  black.forEach(([x,y]) => { cells[y * 15 + x] = "1"; });
  white.forEach(([x,y]) => { cells[y * 15 + x] = "2"; });
  return cells.join("");
}

async function setup(page, spectator = false) {
  await installApiFixture(page);
  await page.addInitScript(() => {
    const streams = new Set();
    window.__gomokuEmit = (room) => streams.forEach((stream) => stream.snapshot?.({ data: JSON.stringify(room) }));
    window.EventSource = class {
      constructor(url) { this.url = url; streams.add(this); }
      addEventListener(name, listener) {
        if (name !== "snapshot") return;
        this.snapshot = listener;
        const url = new URL(this.url, location.origin);
        url.pathname = url.pathname.replace(/\/events$/, "");
        void fetch(url).then((response) => response.json())
          .then((body) => { if (streams.has(this)) listener({ data: JSON.stringify(body.data) }); });
      }
      close() { streams.delete(this); }
    };
  });
  const room = {
    id:1, hostMemberId:1, hostName:"테스트 크루", guestMemberId:2, guestName:"상대",
    visibility:"PUBLIC", rule:"RENJU", status:"PLAYING", hostReady:false, guestReady:false,
    gameNumber:1, blackMemberId:1, board:encoded([[6,7],[8,7],[7,6],[7,8]]), ply:8,
    lastX:6, lastY:0, winnerMemberId:null, endReason:null, revision:1,
    serverNow:Date.now(), turnDeadline:Date.now()+60_000
  };
  const moves = [];
  await page.route("**/api/games/gomoku/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/moves")) moves.push(route.request().postDataJSON());
    const data = path.endsWith("/observations")
      ? { participationId:"00000000-0000-4000-8000-000000000001", chatStartSequence:"0" }
      : path.endsWith("/rooms/1") ? room
        : { items:[], nextCursor:null, hasNext:false, participationId:"00000000-0000-4000-8000-000000000001", latestSequence:"0" };
    await route.fulfill({ json:{ success:true, data, error:null } });
  });
  await page.goto(`/games/gomoku/rooms/1${spectator ? "/watch" : ""}`);
  return { room, moves, emit: async (changes) => {
    Object.assign(room, changes, { revision:room.revision+1 });
    await page.evaluate((value) => window.__gomokuEmit(value), room);
  } };
}

for (const width of [1280, 390]) {
  test(`black Renju forbidden dots and interaction at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    const { moves, emit } = await setup(page);
    const center = page.getByRole("button", { name:"H8, 빈 자리, 쌍3 금수", exact:true });
    await expect(center).toHaveAttribute("aria-disabled", "true");
    const dot = center.locator(".gomoku-forbidden");
    await expect(dot).toBeVisible();
    expect(await dot.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(199, 53, 42)");
    const sizeRatio = await dot.evaluate((node) => node.getBoundingClientRect().width / node.parentElement.getBoundingClientRect().width);
    expect(sizeRatio).toBeCloseTo(0.35, 1);
    await center.dispatchEvent("click");
    await center.dispatchEvent("dblclick");
    await expect(page.getByRole("button", { name:"자리하기", exact:true })).toBeDisabled();
    expect(moves).toEqual([]);
    await page.getByRole("button", { name:"G8, 흑돌", exact:true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(center).toBeFocused();
    await center.evaluate((node) => node.blur());
    await page.screenshot({ path:`test-results/gomoku-forbidden-${width}.png`, fullPage:true });
    await page.locator(".gomoku-board-slot").screenshot({ path:`test-results/gomoku-forbidden-board-${width}.png` });
    const a11y = await new AxeBuilder({ page }).include(".gomoku-board").analyze();
    expect(a11y.violations).toEqual([]);
    await emit({ board:encoded([[5,7],[6,7],[8,7],[7,5],[7,6],[7,8]]), ply:12 });
    await expect(page.getByRole("button", { name:"H8, 빈 자리, 쌍4 금수", exact:true })).toHaveAttribute("aria-disabled", "true");
    await emit({ blackMemberId:2 });
    await expect(page.locator(".gomoku-forbidden")).toHaveCount(0);
    await emit({ blackMemberId:1, rule:"FREESTYLE" });
    await expect(page.locator(".gomoku-forbidden")).toHaveCount(0);
    await emit({ rule:"RENJU", status:"FINISHED", winnerMemberId:1, endReason:"RESIGN" });
    await expect(page.locator(".gomoku-forbidden")).toHaveCount(0);
  });
}

test("a previously selected cell becoming forbidden cannot be confirmed", async ({ page }) => {
  const { emit, moves } = await setup(page);
  const black = [[6,7],[8,7],[7,6],[7,8]];
  await emit({ board:encoded(black, [[4,7],[10,7]]) });
  await page.getByRole("button", { name:"H8, 빈 자리", exact:true }).click();
  const confirm = page.getByRole("button", { name:"자리하기", exact:true });
  await expect(confirm).toBeEnabled();
  await emit({ board:encoded(black) });
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole("button", { name:"H8, 빈 자리, 쌍3 금수", exact:true })).toHaveAttribute("aria-pressed", "false");
  expect(moves).toEqual([]);
});


test("spectators never receive black-player forbidden guidance", async ({ page }) => {
  await setup(page, true);
  await expect(page.getByText("관전 중", { exact:true })).toBeVisible();
  await expect(page.locator(".gomoku-cell")).toHaveCount(225);
  await expect(page.locator(".gomoku-forbidden")).toHaveCount(0);
});
