import { expect, test } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

const activeChair = { width: 12, left: -6, right: 6, orientation: 0, toy: { color: "red", rows: [0, 0] } };
const run = {
  id: "member-chair-run", placements: [], active: activeChair, preview: activeChair,
  failedLayer: null, finished: false, toyMode: false, physics: null,
  motion: { amplitude: 0, periodMs: 1000, fallMs: 300 }
};

test("a signed-in member starts directly from the chair stack card and resumes on reload", async ({ page }) => {
  await installApiFixture(page);
  let currentRun = null;
  let starts = 0;
  await page.route("**/api/games/chair-stack/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (data) => route.fulfill({ json: { success: true, data, error: null } });
    if (url.pathname.endsWith("/runs/current")) {
      expect(url.searchParams.get("member")).toBe("true");
      return reply({ guest: false, nickname: "자리", bestScore: 0, run: currentRun, frames: [] });
    }
    if (url.pathname.endsWith("/runs") && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ member: true, nickname: null, previousRunId: null });
      starts++;
      currentRun = run;
      return reply({ guest: false, nickname: "자리", bestScore: 0, run, frames: [] });
    }
    return route.fallback();
  });

  await page.goto("/games");
  await page.locator(".games-catalog > article").first().getByRole("link", { name: "게임 시작" }).click();
  await expect(page).toHaveURL(/\/games\/chair-stack$/);
  await expect(page.getByRole("button", { name: "놓기" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "닉네임" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "내 계정으로 시작" })).toHaveCount(0);
  expect(starts).toBe(1);

  await page.reload();
  await expect(page.getByRole("button", { name: "놓기" })).toBeVisible();
  expect(starts).toBe(1);
});
