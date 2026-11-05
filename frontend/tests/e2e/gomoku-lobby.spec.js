import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture } from "./api-fixture.js";

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`gomoku lobby shows waiting and playing rooms at ${width}px ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const reducedMotion = colorScheme === "light" ? "no-preference" : "reduce";
      await page.emulateMedia({ colorScheme, reducedMotion });
      await installApiFixture(page);
      const waiting = {
        id: 7,
        hostMemberId: 2,
        hostName: "가을",
        guestMemberId: null,
        guestName: null,
        visibility: "PUBLIC",
        rule: "RENJU",
        status: "WAITING"
      };
      const playing = {
        ...waiting,
        id: 8,
        hostName: "겨울",
        guestMemberId: 3,
        guestName: "봄날",
        status: "PLAYING"
      };
      let mine = null;
      const joins = [];
      await page.route("**/api/games/gomoku/rooms**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/join")) joins.push(path);
        const data = path.endsWith("/me")
          ? { roomId: mine }
          : { items: [waiting, playing], nextCursor: null, hasNext: false };
        return route.fulfill({ json: { success: true, data, error: null } });
      });
      await page.goto("/games/gomoku");
      const waitingRow = page.getByRole("listitem").filter({ hasText: "가을님과의 자리" });
      const playingRow = page.getByRole("listitem").filter({ hasText: "겨울님과의 자리" });
      await expect(waitingRow).toContainText("상대 대기 중");
      await expect(waitingRow).toContainText("1 / 2");
      await expect(waitingRow.getByRole("button", { name: "참여하기" })).toBeEnabled();
      await expect(playingRow).toContainText("2 / 2");
      await expect(playingRow.getByRole("button", { name: "관전하기" })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      expect((await new AxeBuilder({ page }).include(".games-page--lobby").analyze()).violations).toEqual([]);
      await page.screenshot({ path: `test-results/gomoku-lobby-${width}-${colorScheme}.png`, fullPage: true });

      mine = 8;
      await page.reload();
      const returnButton = playingRow.getByRole("button", { name: "돌아가기" });
      await expect(returnButton).toBeEnabled();
      await expect(returnButton).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_my_room_open");
      const ownRoom = page.getByRole("complementary", { name: "참여 중인 자리" });
      const controls = await page.locator(".games-lobby-controls").boundingBox();
      const ownRoomBounds = await ownRoom.boundingBox();
      expect(ownRoomBounds.y).toBeGreaterThanOrEqual(controls.y + controls.height);
      const roomListTop = await page.locator(".games-room-list").evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY
      );
      await waitingRow.getByRole("button", { name: "참여하기" }).click();
      const notice = page.getByRole("alert");
      await expect(notice).toContainText("이미 참여 중인 방이 있어요.");
      const timing = await notice.evaluate((element) => {
        const style = getComputedStyle(element);
        return { delay: style.animationDelay, duration: style.animationDuration };
      });
      expect(timing.delay).toBe("3s");
      expect(Number.parseFloat(timing.duration)).toBe(reducedMotion === "reduce" ? 0.00001 : 0.24);
      await page.screenshot({ path: `test-results/gomoku-lobby-notice-${width}-${colorScheme}.png`, fullPage: true });
      if (reducedMotion === "no-preference") {
        const frames = await page.evaluate(() => new Promise((resolve) => {
          const samples = [];
          function sample() {
            const element = document.querySelector(".games-notice--transient");
            const list = document.querySelector(".games-room-list");
            samples.push({
              present: Boolean(element),
              opacity: element ? Number(getComputedStyle(element).opacity) : 0,
              height: element?.getBoundingClientRect().height ?? 0,
              listTop: list.getBoundingClientRect().top + window.scrollY
            });
            if (!element) resolve(samples);
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }));
        const movingFrames = frames.filter((frame) => frame.opacity > 0 && frame.opacity < 1);
        expect(movingFrames.length).toBeGreaterThan(2);
        expect(movingFrames.some((frame) => frame.height < frames[0].height - 1)).toBe(true);
        expect(movingFrames.some((frame) => frame.listTop < frames[0].listTop - 1)).toBe(true);
        const lastVisible = frames.filter((frame) => frame.present).at(-1);
        expect(Math.abs(frames.at(-1).listTop - lastVisible.listTop)).toBeLessThan(2);
        await test.info().attach("notice-collapse-frames", {
          body: JSON.stringify(frames),
          contentType: "application/json"
        });
      }
      await expect(notice).toHaveCount(0, { timeout: 4500 });
      const finalRoomListTop = await page.locator(".games-room-list").evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY
      );
      expect(Math.abs(finalRoomListTop - roomListTop)).toBeLessThan(1);
      await expect(ownRoom).toBeVisible();
      expect(joins).toEqual([]);
    });
  }
}
