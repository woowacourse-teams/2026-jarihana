import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

const root = "/api/games/chair-stack";

test("a guest starts from the catalog, resumes after a reload, and ranks using the keyboard", async ({ page }) => {
  const nickname = `의자${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/games");
  const card = page.locator(".games-catalog > article").first();
  await expect(card.getByRole("heading", { name: "의자 쌓기" })).toBeVisible();
  await expect(card.getByText("의자를 얼마나 높이 쌓을 수 있을까요?", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "게임 시작" }).click();
  await page.getByRole("textbox", { name: "닉네임" }).fill(nickname);
  await page.getByRole("button", { name: "시작하기" }).click();

  const position = page.getByRole("slider", { name: "배치 위치" });
  await expect(position).toBeVisible();
  const restartAvailableAt = Date.now() + 1000;
  await position.press("ArrowRight");
  await expect(position).toHaveAttribute("aria-valuenow", "1");
  await position.press("ArrowLeft");
  const rotation = page.getByRole("slider", { name: "의자 회전" });
  await rotation.press("ArrowRight");
  await expect(rotation).toHaveValue("1");
  const horizontal = page.getByRole("button", { name: "좌우 반전" });
  const vertical = page.getByRole("button", { name: "상하 반전" });
  await horizontal.click();
  await expect(rotation).toHaveValue("-1");
  await vertical.click();
  await expect(rotation).toHaveValue("-179");
  await vertical.click();
  await horizontal.click();
  await rotation.press("ArrowLeft");
  await expect(rotation).toHaveValue("0");
  await expect(page.getByRole("button", { name: "다시하기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /왼쪽으로 이동|오른쪽으로 이동/ })).toHaveCount(0);
  await expect(page.getByText("좌우로 움직여 의자를 놓을 자리를 고르세요.")).toHaveCount(0);
  const initial = await page.request.get(root + "/runs/current");
  const { active, preview } = (await initial.json()).data.run.physics;
  expect(active.angle).toBe(0);
  expect(active.flat).toBe(true);
  expect(active.sideProfile).toBe(true);
  expect(active.verticalShear).toBe(0);
  expect(Math.abs(preview.angle)).toBeCloseTo(Math.PI);
  expect(preview.widthScale).toBe(active.widthScale);
  expect(preview.heightScale).toBe(active.heightScale);
  await page.route(`**${root}/drops`, async (route) => {
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort();
  }, { times: 1 });
  await position.press("Space");
  await expect(page.getByText("연결이 끊겼어요.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "다시 보내기" }).click();
  await expect(page.getByText("1개", { exact: true })).toBeVisible();
  await expect(page.locator(".chair-stack-clouds")).toHaveCSS("transform", "none");
  await expect(page.locator(".chair-stack-cloud--left")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".chair-stack-wind__gust").first()).toHaveCSS("animation-name", "none");

  await page.reload();
  await expect(page.getByText("1개", { exact: true })).toBeVisible();
  const resumed = await page.request.get(root + "/runs/current");
  expect((await resumed.json()).data.run.physics.active).toEqual(preview);
  await position.press("End");
  await position.press("Space");
  const result = page.getByRole("dialog", { name: "1개를 쌓았어요" });
  await expect(result).toBeVisible();
  await expect(result.getByText(/균형을 잃었어요|탑에 걸리지 않았어요/)).toHaveCount(0);
  await expect(result.getByRole("button", { name: "다시 도전" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(result).toBeHidden();
  const resultTrigger = page.getByRole("button", { name: "게임 결과 보기" });
  await expect(resultTrigger).toBeFocused();
  await page.getByRole("button", { name: "전체 랭킹" }).click();
  const ranking = page.getByRole("dialog", { name: "전체 랭킹" });
  await expect(ranking.getByText(/내 순위/)).toContainText("/ 1개");
  const leaderboard = await page.request.get(root + "/rankings");
  expect((await leaderboard.json()).data.me.nickname).toBe(nickname);
  await page.keyboard.press("Escape");
  await resultTrigger.click();
  await expect.poll(() => Date.now()).toBeGreaterThanOrEqual(restartAvailableAt);
  await result.getByRole("button", { name: "다시 도전" }).click();
  await expect(result).toBeHidden();
  await expect(position).toBeVisible();
});

test("physics playback works on a touch screen and mobile controls stay accessible", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference"
  });
  try {
    const page = await context.newPage();
    await page.goto("/games/chair-stack");
    await page.getByRole("textbox", { name: "닉네임" }).fill("모바일의자");
    await page.getByRole("button", { name: "시작하기" }).tap();
    const position = page.getByRole("slider", { name: "배치 위치" });
    await expect(position).toBeVisible();
    await expect(page.getByRole("slider", { name: "의자 회전" })).toBeVisible();
    const canvas = position.locator("canvas");
    const cloud = page.locator(".chair-stack-cloud--left");
    await expect(page.locator(".chair-stack-sky")).toHaveAttribute("data-sky", "day");
    await expect(cloud).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(cloud).toHaveCSS("animation-play-state", "running");
    await expect(page.locator(".chair-stack-wind__gust").first()).toHaveCSS("animation-play-state", "running");
    const startingCloudY = (await cloud.boundingBox()).y;
    const before = await canvas.evaluate((element) => element.toDataURL());
    const response = page.waitForResponse((entry) => entry.url().endsWith(root + "/drops"));
    await page.getByRole("button", { name: "놓기" }).tap();
    const result = await (await response).json();
    expect(result.data.frames.length).toBeGreaterThan(2);
    await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(before);
    await expect(page.getByText("1개", { exact: true })).toBeVisible();
    await expect(page.locator(".chair-stack-altitude")).toContainText("100 m");
    await page.screenshot({ path: test.info().outputPath("chair-stack-platform-mobile.png") });
    for (let count = 2; count <= 4; count++) {
      await page.getByRole("button", { name: "놓기" }).tap();
      await expect(page.getByText(`${count}개`, { exact: true })).toBeVisible();
    }
    const snapshot = await page.request.get(root + "/runs/current");
    const { chairs } = (await snapshot.json()).data.run.physics;
    expect(new Set(chairs.map(({ piece }) => `${piece.widthScale}/${piece.heightScale}`)).size).toBe(1);
    const uprightChairs = chairs.map(({ piece }, index) => piece.angle === 0 ? index + 1 : 0).filter(Boolean);
    expect([[1, 3], [1, 4]]).toContainEqual(uprightChairs);
    await expect.poll(async () => (await cloud.boundingBox()).y).toBeLessThan(startingCloudY - 8);

    await position.scrollIntoViewIfNeeded();
    const board = await position.boundingBox();
    const x = board.x + board.width / 2;
    const y = board.y + board.height / 2;
    await page.touchscreen.tap(x + board.width * 0.1, y);
    await expect.poll(async () => Number(await position.getAttribute("aria-valuenow"))).toBeGreaterThan(0);

    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 50, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => Number(await position.getAttribute("aria-valuenow"))).toBeLessThan(0);
    const selectedAim = await position.getAttribute("aria-valuenow");
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x + 40, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 40, y: y - 55 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    await expect(position).toHaveAttribute("aria-valuenow", selectedAim);

    await page.setViewportSize({ width: 360, height: 640 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    // Read all positions in one layout pass while the viewport settles after resizing.
    await expect.poll(() => page.locator(".chair-stack").evaluate((game) => {
      const slider = game.querySelector(".chair-stack-rotation input").getBoundingClientRect();
      const flip = game.querySelector(".chair-stack-flips button").getBoundingClientRect();
      const restart = game.querySelector(".chair-stack-hint button").getBoundingClientRect();
      return {
        centered: Math.abs(slider.x + slider.width / 2 - 180) < 2,
        flipsBelowSlider: flip.top >= slider.bottom,
        restartInView: restart.bottom <= 640
      };
    })).toEqual({ centered: true, flipsBelowSlider: true, restartInView: true });
    await page.screenshot({ path: test.info().outputPath("chair-stack-small-mobile.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.getByRole("button", { name: "놓기" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include(".chair-stack")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("chair-stack-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: test.info().outputPath("chair-stack-desktop.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "다시하기", exact: true }).tap();
    await page.getByRole("dialog").getByRole("button", { name: "다시하기", exact: true }).tap();
    await expect(page.getByText("0개", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "놓기" }).tap();
    await expect(page.getByText("1개", { exact: true })).toBeVisible();
    await position.press("End");
    await page.getByRole("button", { name: "놓기" }).tap();
    const resultDialog = page.getByRole("dialog", { name: "1개를 쌓았어요" });
    await expect(resultDialog).toBeVisible();
    await expect.poll(async () => {
      const { x, y, width, height } = await resultDialog.boundingBox();
      return Math.max(Math.abs(x + width / 2 - 195), Math.abs(y + height / 2 - 422));
    }).toBeLessThan(2);
    const resultAxe = await new AxeBuilder({ page }).include(".chair-stack-result")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(resultAxe.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("chair-stack-result-mobile.png") });
  } finally {
    await context.close();
  }
});
