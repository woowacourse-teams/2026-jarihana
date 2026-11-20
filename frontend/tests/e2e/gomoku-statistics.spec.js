import { test, expect } from "playwright/test";
import { installApiFixture, assertSurface } from "./api-fixture.js";

const stats = { total: 24, wins: 15, losses: 7, draws: 2, winRate: 62.5 };
const names = ["가온", "해솔", "여울", "나루", "이든", "도담", "소담", "자리"];
const rows = names.map((name, i) => ({
  ...stats,
  name,
  rank: i + 1,
  memberId: i === 7 ? 1 : i + 10,
  avatarUrl: `https://avatars.githubusercontent.com/u/${i + 10}`
}));

async function fixture(page, options = {}) {
  const state = await installApiFixture(page);
  let historyFailed = options.historyFailed ?? false;
  await page.route("**/api/games/gomoku/**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (data) => route.fulfill({ json: { success: true, data, error: null } });
    if (url.pathname.endsWith("/history/me/summary"))
      return reply(
        options.empty ? { total: 0, wins: 0, losses: 0, draws: 0, winRate: null } : stats
      );
    if (url.pathname.endsWith("/history/me")) {
      if (historyFailed) {
        historyFailed = false;
        return route.abort("failed");
      }
      const second = url.searchParams.has("cursor");
      return reply({
        items: options.empty
          ? []
          : [
              {
                id: second ? 2 : 1,
                opponentName: second ? "해솔" : "가온",
                opponentAvatarUrl: null,
                result: second ? "LOSE" : "WIN",
                rule: "RENJU",
                endReason: second ? "TIMEOUT" : "FIVE",
                endedAt: "2026-11-04T19:42:00"
              }
            ],
        nextCursor: second || options.empty ? null : "next",
        hasNext: !second && !options.empty
      });
    }
    if (url.pathname.endsWith("/ranking"))
      return reply({
        items: options.empty ? [] : rows,
        me: options.empty ? null : rows[7],
        hasNext: false,
        nextCursor: null
      });
    if (url.pathname.endsWith("/rooms/me")) return reply({ roomId: null });
    if (url.pathname.endsWith("/rooms"))
      return reply({ items: [], hasNext: false, nextCursor: null });
    return route.fallback();
  });
  return state;
}

for (const width of [360, 390, 1200]) {
  test(`history, win rate and signature chair ranking at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    await page.goto("/games/gomoku?tab=history");
    await expect(page.getByRole("heading", { name: "24판의 기록" })).toBeVisible();
    await expect(page.getByLabel("승률 62.5퍼센트")).toBeVisible();
    await expect(page.locator(".games-lobby-heading__art img")).toHaveAttribute(
      "src",
      /gomoku-lounge-v1.webp$/
    );
    await expect(page.getByText("친구와 함께하는 오목", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "기록 더 보기" }).click();
    await expect(page.locator(".gomoku-history-list li")).toHaveCount(2);
    await page.screenshot({ path: `test-results/gomoku-history-${width}.png`, fullPage: true });
    await page.getByRole("tab", { name: "랭킹", exact: true }).click();
    await expect(page).toHaveURL(/tab=ranking/);
    await expect(page.getByRole("heading", { name: "승리의 자리" })).toBeVisible();
    const champion = page.locator(".gomoku-ranking-champion");
    await expect(champion.getByRole("img", { name: "자리하나 시그니처 의자" })).toBeVisible();
    await expect(champion.getByRole("img", { name: "가온 프로필" })).toHaveAttribute(
      "src",
      rows[0].avatarUrl
    );
    await expect(page.locator(".gomoku-ranking-mine")).toContainText("8위");
    await page.screenshot({ path: `test-results/gomoku-ranking-${width}.png`, fullPage: true });
    await assertSurface(page, state, { axe: true });
    await page.reload();
    await expect(page.getByRole("tab", { name: "랭킹", exact: true })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page.goBack();
    await expect(page.getByRole("tab", { name: "내 전적", exact: true })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
}

test("empty records, empty ranking and keyboard tab navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixture(page, { empty: true });
  await page.goto("/games/gomoku?tab=history");
  await expect(page.getByLabel("아직 대국 기록이 없습니다")).toContainText("-");
  await expect(page.getByRole("heading", { name: "첫 대국을 기다리고 있어요" })).toBeVisible();
  await page.getByRole("tab", { name: "내 전적", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "아직 주인공이 없는 자리예요" })).toBeVisible();
  await expect(page.locator(".gomoku-ranking-chair")).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "대기방", exact: true })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("failed history retries without losing the current tab", async ({ page }) => {
  await fixture(page, { historyFailed: true });
  await page.goto("/games/gomoku?tab=history");
  await expect(page.getByText("기록을 불러오지 못했어요.")).toBeVisible();
  await page.locator('[data-ph-capture-attribute-action="gomoku_history_retry"]').click();
  await expect(page.getByRole("heading", { name: "24판의 기록" })).toBeVisible();
  await expect(page).toHaveURL(/tab=history/);
});
