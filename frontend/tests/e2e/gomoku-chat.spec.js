import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture, prepareVisualCapture } from "./api-fixture.js";

const participationId = "11111111-1111-4111-8111-111111111111";
for (const width of [390, 768, 1280, 1440, 1920]) {
  for (const theme of ["light", "dark"]) {
    test(`game-room text chat, recovery, keyboard and layout at ${width}px ${theme}`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await installApiFixture(page);
      await page.addInitScript(() => {
        window.__gameStreams = [];
        window.EventSource = class {
          constructor(url) {
            this.url = url;
            this.listeners = {};
            this.closed = false;
            window.__gameStreams.push(this);
          }
          addEventListener(name, listener) {
            this.listeners[name] = listener;
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
      const messages = [];
      const bodies = [];
      let failNext = true;
      let holdHistory = false;
      let releaseHistory;
      const delayedHistory = new Promise((resolve) => {
        releaseHistory = resolve;
      });
      let releaseInitial;
      const initialHistory = new Promise((resolve) => {
        releaseInitial = resolve;
      });
      const message = (content, senderId = "2", key = crypto.randomUUID()) => ({
        id: String(messages.length + 1),
        sequence: String(messages.length + 1),
        senderId,
        clientMessageId: key,
        author: senderId === "1" ? "자리" : "하나",
        content,
        createdAt: "2026-11-05T12:00:00"
      });
      const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
      await page.route("**/api/games/gomoku/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/chat/messages")) {
          if (route.request().method() === "POST") {
            const body = route.request().postDataJSON();
            bodies.push(body);
            if (failNext) {
              failNext = false;
              return route.fulfill({
                status: 503,
                json: {
                  success: false,
                  data: null,
                  error: { code: "INTERNAL_ERROR", message: "일시 실패" }
                }
              });
            }
            let saved = messages.find((item) => item.clientMessageId === body.clientMessageId);
            if (!saved) {
              saved = message(body.content, "1", body.clientMessageId);
              messages.push(saved);
            }
            return reply(route, saved);
          }
          await initialHistory;
          const before = url.searchParams.get("beforeSequence");
          const after = url.searchParams.get("afterSequence");
          if (before && holdHistory) await delayedHistory;
          const size = Number(url.searchParams.get("size") || 50);
          const filtered = messages.filter((item) =>
            before
              ? BigInt(item.sequence) < BigInt(before)
              : after
                ? BigInt(item.sequence) > BigInt(after)
                : true
          );
          const items = after ? filtered.slice(0, size) : filtered.slice(-size);
          const hasNext = filtered.length > size;
          return reply(route, {
            participationId,
            latestSequence: String(messages.length),
            items,
            hasNext,
            nextCursor: hasNext ? (after ? items.at(-1).sequence : items[0].sequence) : null
          });
        }
        return reply(route, room);
      });
      const signal = () =>
        page.evaluate(
          ({ participationId, latestSequence }) => {
            for (const stream of window.__gameStreams)
              if (!stream.closed)
                stream.listeners.chat_changed?.({
                  data: JSON.stringify({ participationId, latestSequence })
                });
          },
          { participationId, latestSequence: String(messages.length) }
        );

      await page.goto("/games/gomoku/rooms/1");
      const compact = width < 1280;
      await expect(page.locator(".gomoku-arena")).toBeVisible();
      const originalArena = await page.locator(".gomoku-arena").boundingBox();
      releaseInitial();
      if (compact) await page.getByRole("button", { name: "채팅", exact: true }).click();
      await expect(page.getByText("가벼운 인사를 건네보세요.")).toBeVisible();
      if (!compact) {
        const arena = await page.locator(".gomoku-arena").boundingBox();
        const panel = await page.locator(".gomoku-chat").boundingBox();
        expect(arena).toEqual(originalArena);
        expect(Math.abs(arena.x + arena.width / 2 - width / 2)).toBeLessThan(1);
        expect(panel.x).toBeGreaterThan(arena.x + arena.width);
        expect(panel.y).toBe(arena.y);
        expect(panel.height).toBe(arena.height);
      }
      const input = page.getByRole("textbox", { name: "게임방 메시지" });
      await expect(page.getByRole("button", { name: "게임방 메시지 전송" })).toHaveText("전송");
      await expect(page.getByText("Enter 전송 / Shift+Enter 줄바꿈", { exact: true })).toHaveCount(
        0
      );
      await expect(page.getByText("참가자와 관전자가 함께 대화해요", { exact: true })).toHaveCount(
        0
      );
      await input.fill("한글 조합");
      await input.evaluate((element) =>
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })
        )
      );
      expect(bodies).toHaveLength(0);
      await input.fill("  안녕하세요!\n좋은 대국 해요.  ");
      await input.press("Enter");
      await expect(page.getByText("전송 실패", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "다시 보내기", exact: true }).click();
      await expect(page.getByText("전송 실패", { exact: false })).toHaveCount(0);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(messages[0].content).toBe("  안녕하세요!\n좋은 대국 해요.  ");
      await expect(page.locator(".gomoku-chat__message--mine .gomoku-chat__author")).toHaveCount(0);
      expect(room.revision).toBe(1);
      await input.fill("다음에도 좋은 대국 해요.");
      await input.press("Enter");
      await expect.poll(() => messages.length).toBe(2);
      await expect(page.getByText("보내는 중...", { exact: true })).toHaveCount(0);

      messages.push(message("<script>대화는 텍스트예요</script>"));
      await signal();
      await expect(
        page.getByRole("log").getByText("<script>대화는 텍스트예요</script>")
      ).toBeVisible();
      await expect(page.locator(".gomoku-chat script")).toHaveCount(0);
      await expect(page.locator(".gomoku-chat__author")).toHaveText(["하나"]);
      messages.push(message("같은 분에 이어 보낸 대화"));
      await signal();
      await expect(page.getByRole("log").getByText("같은 분에 이어 보낸 대화")).toBeVisible();
      await expect(page.locator(".gomoku-chat__author")).toHaveText(["하나"]);
      const received = page.locator(".gomoku-chat__message:not(.gomoku-chat__message--mine)");
      await expect(received.first().locator(".gomoku-chat__author")).toBeVisible();
      await expect(received.last().locator(".gomoku-chat__author")).toHaveCount(0);
      await expect(received.first().locator("time")).toHaveCount(0);
      await expect(received.last().locator("time")).toBeVisible();
      const mine = page.locator(".gomoku-chat__message--mine");
      const firstMine = await mine.first().boundingBox();
      const lastMine = await mine.last().boundingBox();
      const firstReceived = await received.first().boundingBox();
      const lastReceived = await received.last().boundingBox();
      const betweenGroups = firstReceived.y - lastMine.y - lastMine.height;
      const withinMine = lastMine.y - firstMine.y - firstMine.height;
      const withinReceived = lastReceived.y - firstReceived.y - firstReceived.height;
      expect(withinMine).toBeGreaterThan(0);
      expect(withinMine).toBeLessThan(betweenGroups);
      expect(withinReceived).toBeCloseTo(withinMine, 1);
      await page.screenshot({
        path: `../.omo/evidence/gomoku-chat/group-authors-${width}-${theme}.png`
      });
      if (compact) {
        await expect(page.getByRole("timer")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "게임방 대화" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "채팅", exact: true })).toBeFocused();
        messages.push(message("닫혀 있을 때 온 대화"));
        await signal();
        await expect(page.getByRole("button", { name: "채팅, 새 메시지 있음" })).toBeVisible();
        await page.getByRole("button", { name: "채팅, 새 메시지 있음" }).click();
        await expect(page.getByText("닫혀 있을 때 온 대화")).toBeVisible();
      }

      for (let i = 0; i < 60; i++)
        messages.push(message(`${i}번째 대화 ${"긴 메시지도 읽을 수 있어요. ".repeat(5)}`));
      await signal();
      await expect(page.locator(".gomoku-chat__message")).toHaveCount(messages.length);
      const scroller = page.locator(".gomoku-chat__scroll");
      await scroller.evaluate((element) => {
        element.scrollTop = 100;
        element.dispatchEvent(new Event("scroll"));
      });
      const scrollTop = await scroller.evaluate((element) => element.scrollTop);
      messages.push(message("과거를 읽어도 화면을 옮기지 않아요."));
      await signal();
      await expect(page.getByRole("button", { name: "최근 메시지" })).toBeVisible();
      await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(scrollTop);
      await page.getByRole("button", { name: "최근 메시지" }).click();
      await expect(page.getByText("과거를 읽어도 화면을 옮기지 않아요.")).toBeVisible();
      await prepareVisualCapture(page);
      await page.screenshot({
        path: `../.omo/evidence/gomoku-chat/chat-${width}-${theme}.png`,
        fullPage: true
      });
      await page.screenshot({
        path: `../.omo/evidence/gomoku-chat/chat-${width}-${theme}-viewport.png`
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(accessibility.violations).toEqual([]);

      await page.reload();
      if (compact) {
        await page.getByRole("button", { name: /채팅/ }).click();
        await page.getByRole("dialog", { name: "게임방 대화" }).evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
      }
      await expect(page.getByText("과거를 읽어도 화면을 옮기지 않아요.")).toBeVisible();
      await scroller.evaluate((element) => {
        element.scrollTop = 0;
        element.dispatchEvent(new Event("scroll"));
      });
      const anchorText = await page.locator(".gomoku-chat__bubble").first().innerText();
      const anchor = page.getByRole("log").getByText(anchorText, { exact: true });
      const anchorPosition = () =>
        anchor.evaluate(
          (element) =>
            element.getBoundingClientRect().top -
            element.closest(".gomoku-chat__scroll").getBoundingClientRect().top
        );
      const originalPosition = await anchorPosition();
      holdHistory = true;
      await page.getByRole("button", { name: "이전 대화 보기" }).click();
      await expect(page.getByRole("button", { name: "불러오는 중..." })).toBeDisabled();
      const incomingContent = "이전 대화를 불러오는 동안 도착한 새 메시지예요.\n".repeat(12);
      messages.push(message(incomingContent));
      await signal();
      await expect(
        page.getByRole("log").getByText(incomingContent, { exact: true })
      ).toBeAttached();
      await expect
        .poll(async () => Math.abs((await anchorPosition()) - originalPosition))
        .toBeLessThan(1);
      releaseHistory();
      await expect(page.getByRole("button", { name: "불러오는 중..." })).toHaveCount(0);
      await expect
        .poll(async () => Math.abs((await anchorPosition()) - originalPosition))
        .toBeLessThan(1);
      await expect(
        page.getByRole("log").getByText("<script>대화는 텍스트예요</script>")
      ).toBeAttached();
      room.status = "CLOSED";
      room.revision += 1;
      await page.evaluate((snapshot) => {
        for (const stream of window.__gameStreams)
          if (!stream.closed) stream.listeners.snapshot?.({ data: JSON.stringify(snapshot) });
      }, room);
      await expect(page.getByText("방이 종료되어 메시지를 보낼 수 없어요.")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "게임방 메시지" })).toHaveCount(0);
    });
  }
}
