import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture, prepareVisualCapture } from "./api-fixture.js";

for (const width of [390, 768, 1440, 1920]) {
  for (const colorScheme of ["light", "dark"]) {
    test.describe(`observation ${width}px ${colorScheme}`, () => {
      test.use({
        viewport: { width, height: 900 },
        colorScheme,
        isMobile: width === 390,
        hasTouch: width === 390,
        deviceScaleFactor: width === 390 ? 3 : 1
      });

      test("spectates, chats, resumes, watches rematch and leaves without player commands", async ({
        page
      }) => {
        await installApiFixture(page);
        const installStreams = () => {
          window.__observationStreams = [];
          window.EventSource = class {
            constructor(url) {
              this.url = url;
              this.listeners = {};
              this.closed = false;
              window.__observationStreams.push(this);
            }
            addEventListener(name, listener) {
              this.listeners[name] = listener;
              if (name === "snapshot") {
                const url = new URL(this.url, location.origin);
                url.pathname = url.pathname.replace(/\/events$/, "");
                void fetch(url)
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
        };
        await page.addInitScript(installStreams);
        const room = {
          id: 7,
          hostMemberId: 2,
          hostName: "겨울",
          guestMemberId: 3,
          guestName: "봄날",
          visibility: "PUBLIC",
          rule: "RENJU",
          status: "PLAYING",
          hostReady: false,
          guestReady: false,
          gameNumber: 1,
          blackMemberId: 2,
          board: "0".repeat(225),
          ply: 0,
          lastX: null,
          lastY: null,
          winnerMemberId: null,
          endReason: null,
          revision: 1,
          serverNow: Date.now(),
          turnDeadline: Date.now() + 60000,
          spectatorCount: 3
        };
        const visits = new Map();
        const admissions = [];
        const commands = [];
        const messages = [
          {
            id: "1",
            sequence: "1",
            senderId: "2",
            author: "겨울",
            senderRole: "PARTICIPANT",
            clientMessageId: crypto.randomUUID(),
            content: "입장 전의 대화",
            createdAt: "2026-11-05T12:00:00"
          }
        ];
        let failLeave = true;
        const reply = (route, data, status = 200) =>
          route.fulfill({ status, json: { success: true, data, error: null } });
        const handleGameRequest = async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const path = url.pathname;
          if (path.endsWith("/observations") && request.method() === "POST") {
            const body = request.postDataJSON();
            admissions.push(body);
            let visit = visits.get(body.requestId);
            const created = !visit;
            if (!visit) {
              visit = {
                participationId: crypto.randomUUID(),
                chatStartSequence: String(messages.length),
                left: false
              };
              visits.set(body.requestId, visit);
            }
            return reply(route, visit, created ? 201 : 200);
          }
          if (path.includes("/observations/") && request.method() === "DELETE") {
            if (failLeave) {
              failLeave = false;
              return route.fulfill({
                status: 503,
                json: {
                  success: false,
                  data: null,
                  error: { code: "GOMOKU_STREAM_BUSY", message: "일시 실패" }
                }
              });
            }
            const id = path.split("/").at(-1);
            const visit = [...visits.values()].find((value) => value.participationId === id);
            visit.left = true;
            return route.fulfill({ status: 204 });
          }
          if (path.endsWith("/chat/messages")) {
            if (request.method() === "POST") {
              const body = request.postDataJSON();
              const saved = {
                id: String(messages.length + 1),
                sequence: String(messages.length + 1),
                senderId: "1",
                author: "관객",
                senderRole: "SPECTATOR",
                content: body.content,
                clientMessageId: body.clientMessageId,
                createdAt: "2026-11-05T12:01:00"
              };
              messages.push(saved);
              return reply(route, saved, 201);
            }
            const visit = [...visits.values()].find(
              (value) => value.participationId === url.searchParams.get("participationId")
            );
            expect(visit).toBeTruthy();
            const floor = Number(visit.chatStartSequence);
            const after = Number(url.searchParams.get("afterSequence") || 0);
            return reply(route, {
              participationId: visit.participationId,
              latestSequence: String(messages.length),
              items: messages.filter((value) => Number(value.sequence) > Math.max(floor, after)),
              nextCursor: null,
              hasNext: false
            });
          }
          if (request.method() !== "GET") commands.push(path);
          if (path.endsWith("/me")) return reply(route, { roomId: null });
          if (path.endsWith("/rooms"))
            return reply(route, { items: [room], nextCursor: null, hasNext: false });
          return reply(route, room);
        };
        await page.route("**/api/games/gomoku/**", handleGameRequest);
        async function capture(state) {
          await prepareVisualCapture(page);
          await page.screenshot({
            path: `test-results/gomoku-observation-${width}-${colorScheme}-${state}.png`,
            fullPage: true,
            animations: "disabled"
          });
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
            false
          );
        }
        async function openChat() {
          if (width < 1024) await page.getByRole("button", { name: /^채팅/ }).click();
          await expect(page.getByRole("textbox", { name: "게임방 메시지" })).toBeVisible();
        }
        async function closeChat() {
          if (width < 1024) await page.getByRole("button", { name: "게임방 채팅 닫기" }).click();
        }
        async function emitSnapshot() {
          await page.evaluate((snapshot) => {
            for (const stream of window.__observationStreams)
              if (!stream.closed) stream.listeners.snapshot({ data: JSON.stringify(snapshot) });
          }, room);
        }

        await page.goto("/games/gomoku");
        await expect(page.getByText("관전자 3명")).toBeVisible();
        await expect(page.getByRole("button", { name: "관전하기" })).toBeEnabled();
        await capture("lobby");
        await page.getByRole("button", { name: "관전하기" }).click();
        await expect(page).toHaveURL(/\/rooms\/7\/watch$/);
        await expect(page.getByText("관전 중", { exact: true })).toBeVisible();
        await expect(page.getByText("흑돌 차례예요")).toBeVisible();
        await expect(
          page.getByRole("button", { name: /자리하기|기권하기|초대링크|준비하기/ })
        ).toHaveCount(0);
        const center = page.getByRole("button", { name: /^H8,/ });
        await expect(center).toHaveAttribute("aria-disabled", "true");
        await center.click({ force: true });
        await expect(page.locator(".gomoku-cell--selected")).toHaveCount(0);
        await capture("playing");
        expect(
          (await new AxeBuilder({ page }).include(".games-page--room").analyze()).violations
        ).toEqual([]);
        await openChat();
        await expect(page.getByText("입장 전의 대화")).toHaveCount(0);
        await page.getByRole("textbox", { name: "게임방 메시지" }).fill("여기 두면 이겨요");
        await page.getByRole("textbox", { name: "게임방 메시지" }).press("Enter");
        await expect(page.getByRole("log").getByText("여기 두면 이겨요")).toBeVisible();
        await expect(page.locator(".gomoku-chat__message--mine .gomoku-chat__author")).toHaveCount(0);
        await capture("chat");
        await closeChat();
        const requestId = admissions[0].requestId;
        const duplicate =
          width === 1440 && colorScheme === "light" ? await page.context().newPage() : null;
        let duplicateRequestId;
        if (duplicate) {
          await installApiFixture(duplicate);
          await duplicate.addInitScript(installStreams);
          const saved = await page.evaluate(() => sessionStorage.getItem("gomoku-observation:1:7"));
          await duplicate.addInitScript(
            (value) => sessionStorage.setItem("gomoku-observation:1:7", value),
            saved
          );
          await duplicate.route("**/api/games/gomoku/**", handleGameRequest);
          await duplicate.goto("/games/gomoku/rooms/7/watch");
          await expect(duplicate.getByText("관전 중", { exact: true })).toBeVisible();
          expect(admissions.at(-1).requestId).not.toBe(requestId);
          failLeave = false;
          await duplicate.getByRole("button", { name: "대기실", exact: true }).click();
          await expect(duplicate).toHaveURL(/\/games\/gomoku$/);
          expect(visits.get(requestId).left).toBe(false);
          await expect(page.getByText("관전 중", { exact: true })).toBeVisible();
          await duplicate.getByRole("button", { name: "관전하기" }).click();
          await expect(duplicate.getByText("관전 중", { exact: true })).toBeVisible();
          duplicateRequestId = admissions.at(-1).requestId;
          expect(duplicateRequestId).not.toBe(requestId);
          failLeave = true;
        }
        await page.reload();
        await expect(page.getByText("관전 중", { exact: true })).toBeVisible();
        expect(admissions.at(-1).requestId).toBe(requestId);
        await openChat();
        await expect(page.getByText("여기 두면 이겨요")).toBeVisible();
        await closeChat();

        Object.assign(room, {
          status: "FINISHED",
          winnerMemberId: 2,
          endReason: "FIVE",
          revision: 2,
          turnDeadline: null
        });
        await emitSnapshot();
        await expect(page.getByRole("heading", { name: "겨울님 승리" })).toBeVisible();
        await expect(page.getByText("다음 대국을 기다리고 있어요.")).toBeVisible();
        await capture("finished");
        Object.assign(room, {
          status: "PLAYING",
          gameNumber: 2,
          winnerMemberId: null,
          endReason: null,
          revision: 3,
          blackMemberId: 3,
          turnDeadline: Date.now() + 60000
        });
        await emitSnapshot();
        await expect(page.getByText("흑돌 차례예요")).toBeVisible();
        await expect(page.getByRole("heading", { name: "겨울님 승리" })).toHaveCount(0);

        await page.getByRole("button", { name: "관전 나가기" }).click();
        await expect(page.getByRole("alert")).toContainText("관전을 종료하지 못했어요");
        await expect(page).toHaveURL(/\/watch$/);
        if (duplicate) {
          await expect(duplicate).toHaveURL(/\/watch$/);
          expect(visits.get(duplicateRequestId).left).toBe(false);
          await page.getByRole("button", { name: "관전 나가기" }).click();
          await expect(duplicate).toHaveURL(/\/games\/gomoku$/);
          expect(visits.get(duplicateRequestId).left).toBe(true);
          expect(
            await duplicate.evaluate(() => sessionStorage.getItem("gomoku-observation:1:7"))
          ).toBeNull();
          await duplicate.close();
        } else {
          await page.getByRole("button", { name: "대기실", exact: true }).click();
        }
        await expect(page).toHaveURL(/\/games\/gomoku$/);
        expect(visits.get(requestId).left).toBe(true);
        await page.getByRole("button", { name: "관전하기" }).click();
        await expect(page.getByText("관전 중", { exact: true })).toBeVisible();
        expect(admissions.at(-1).requestId).not.toBe(requestId);
        await openChat();
        await expect(page.getByText("여기 두면 이겨요")).toHaveCount(0);
        await closeChat();
        Object.assign(room, {
          status: "CLOSED",
          revision: 4,
          endReason: "RESIGN",
          winnerMemberId: 2,
          turnDeadline: null
        });
        await emitSnapshot();
        await expect(page.getByRole("heading", { name: "종료된 방이에요" })).toBeVisible();
        await expect(page.getByText("겨울님 승리", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "관전 나가기" })).toHaveCount(0);
        await capture("closed");
        expect(
          await page.evaluate(() => window.__observationStreams.every((value) => value.closed))
        ).toBe(true);
        expect(commands).toEqual([]);
      });
    });
  }
}
