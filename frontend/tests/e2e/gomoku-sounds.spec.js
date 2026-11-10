import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";
import { installGomokuAudioFixture } from "./gomoku-audio-fixture.js";

async function setup(page, { holdDecode = false } = {}) {
  await installApiFixture(page);
  await installGomokuAudioFixture(page);
  await page.addInitScript((holdDecode) => {
    window.__gomokuAudio = { decoded: [], played: [] };
    const decodeGate = holdDecode
      ? new Promise((resolve) => { window.__gomokuReleaseDecode = resolve; })
      : Promise.resolve();
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      async decodeAudioData(data) {
        await decodeGate;
        const buffer = await super.decodeAudioData(data);
        window.__gomokuAudio.decoded.push(buffer.duration);
        return buffer;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => {
          window.__gomokuAudio.played.push({ duration: source.buffer.duration, state: this.state });
          start(...args);
        };
        return source;
      }
    };
    const streams = new Set();
    window.__gomokuEmit = (room) => streams.forEach((stream) => stream.snapshot?.({ data: JSON.stringify(room) }));
    window.EventSource = class {
      constructor(url) { this.url = url; streams.add(this); }
      addEventListener(name, listener) {
        if (name !== "snapshot") return;
        this.snapshot = listener;
        void fetch(this.url.replace(/\/events$/, ""))
          .then((response) => response.json())
          .then((body) => { if (streams.has(this)) listener({ data: JSON.stringify(body.data) }); });
      }
      close() { streams.delete(this); }
    };
  }, holdDecode);
  const room = {
    id: 1, hostMemberId: 1, hostName: "테스트 크루", guestMemberId: 2, guestName: "상대",
    visibility: "PUBLIC", rule: "RENJU", status: "WAITING", hostReady: true, guestReady: true,
    gameNumber: 0, blackMemberId: 0, board: "0".repeat(225), ply: 0, lastX: null, lastY: null,
    winnerMemberId: null, endReason: null, revision: 1, serverNow: Date.now(), turnDeadline: null
  };
  const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
  await page.route("**/api/games/gomoku/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/start")) {
      Object.assign(room, { status: "PLAYING", gameNumber: room.gameNumber + 1, blackMemberId: 1,
        ply: 0, board: "0".repeat(225), revision: room.revision + 1,
        serverNow: Date.now(), turnDeadline: Date.now() + 60_000 });
      return reply(route, { roomId: 1 });
    }
    if (path.endsWith("/rooms/1")) return reply(route, room);
    return reply(route, { items: [], nextCursor: null, hasNext: false });
  });
  await page.goto("/games/gomoku/rooms/1");
  await expect(page.getByRole("button", { name: "시작하기", exact: true })).toBeEnabled();
  if (!holdDecode) {
    await expect.poll(() => page.evaluate(() => window.__gomokuAudio.decoded)).toContainEqual(expect.closeTo(1, 3));
  }
  return room;
}

test("a confirmed start still plays when the WAV finishes decoding just after start", async ({ page }) => {
  await setup(page, { holdDecode: true });
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(page.locator(".gomoku-board")).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.__gomokuAudio.played)).toEqual([]);
  await page.evaluate(() => window.__gomokuReleaseDecode());
  await expect.poll(() => page.evaluate(() => window.__gomokuAudio.played)).toEqual([
    { duration: expect.closeTo(1, 3), state: "running" }
  ]);
});

test("a one-second WAV plays once on confirmed start and rematch", async ({ page }) => {
  const room = await setup(page);
  expect(await page.evaluate(() => window.__gomokuAudio.played)).toEqual([]);
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__gomokuAudio.played)).toEqual([{ duration: expect.closeTo(1, 3), state: "running" }]);
  await page.evaluate((value) => window.__gomokuEmit(value), room);
  expect(await page.evaluate(() => window.__gomokuAudio.played)).toHaveLength(1);
  Object.assign(room, { status: "FINISHED", revision: room.revision + 1, ply: 15, endReason: "RESIGN" });
  await page.evaluate((value) => window.__gomokuEmit(value), room);
  Object.assign(room, { status: "PLAYING", revision: room.revision + 1, gameNumber: 2, ply: 0, endReason: null });
  await page.evaluate((value) => window.__gomokuEmit(value), room);
  await expect.poll(() => page.evaluate(() => window.__gomokuAudio.played.length)).toBe(2);
  await page.reload();
  await expect(page.locator(".gomoku-board")).toBeVisible();
  expect(await page.evaluate(() => window.__gomokuAudio.played)).toEqual([]);
});
