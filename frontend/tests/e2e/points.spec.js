import { expect, test } from "playwright/test";
import { assertSurface, installApiFixture } from "./api-fixture.js";

const activityPostWeekly = { limit: 2, completed: 1, pending: 0, remaining: 1 };
const events = [
  { id: "3", reason: "GOMOKU_WIN", amount: 50, status: "PENDING", skipReason: null, completedAt: null },
  { id: "2", reason: "GROUP_CREATED", amount: 200, status: "COMPLETED", skipReason: null,
    completedAt: "2026-11-06T14:00:00" },
  { id: "4", reason: "MEMBER_SIGNUP", label: "서비스 가입", amount: 200, status: "COMPLETED", skipReason: null,
    occurredAt: "2026-11-06T11:00:00", completedAt: "2026-11-06T11:00:00" },
  { id: "0", reason: "GOMOKU_WIN", amount: 50, status: "SKIPPED", skipReason: "WEEKLY_LIMIT", completedAt: null,
    occurredAt: "2026-10-29T13:50:00" }
].map((event) => ({ occurredAt: "2026-11-06T13:50:00", ...event }));

async function setup(page, { needsReview = false } = {}) {
  const state = await installApiFixture(page);
  let settled = false;
  const reads = { summary: 0, history: 0 };
  await page.route("**/api/members/me/points**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (data) => route.fulfill({ json: { success: true, data, error: null } });
    if (url.pathname.endsWith("/transactions")) {
      reads.history++;
      const next = url.searchParams.has("cursor");
      const first = { ...events[0] };
      if (settled) Object.assign(first, { status: "COMPLETED", completedAt: "2026-11-06T14:00:00" });
      if (needsReview) first.status = "NEEDS_REVIEW";
      return reply({ items: next ? events.slice(3) : [first, ...events.slice(1, 3)], hasNext: !next, nextCursor: next ? null : "next" });
    }
    reads.summary++;
    const gomokuWeekly = { limit: 3, completed: settled ? 3 : 2, pending: settled ? 0 : 1, remaining: 0 };
    return reply({
      enabled: true,
      processing: !settled && !needsReview,
      balance: settled ? 700 : 650,
      resetsAt: "2026-11-09T00:00:00",
      weeklyQuotas: [
        { reason: "GROUP_CREATED", label: "모임 만들기", quota: { limit: 2, completed: 1, pending: 0, remaining: 1 } },
        { reason: "GOMOKU_WIN", label: "오목 승리", quota: gomokuWeekly },
        { reason: "ACTIVITY_POST", label: "사진 활동기록", quota: activityPostWeekly }
      ]
    });
  });
  return { state, settle: () => { settled = true; }, reads };
}

for (const width of [390, 896, 1440, 1920]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`points from my page at ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      const { state } = await setup(page);
      await page.goto("/my");
      const heading = page.getByRole("heading", { name: "마이페이지", exact: true });
      const walletName = "포인트 650 P, 내역 보기";
      const wallet = page.locator(".account-heading").getByRole("link", { name: walletName });
      await expect(wallet).toBeVisible();
      await expect(page.locator(".profile-column").getByRole("link", { name: walletName })).toHaveCount(0);
      const label = wallet.getByRole("heading", { name: "포인트", exact: true });
      const balance = wallet.getByText("650 P", { exact: true });
      const historyLabel = wallet.getByText("내역 보기", { exact: true });
      await expect(label).toBeVisible();
      const titleBox = await heading.boundingBox();
      const walletBox = await wallet.boundingBox();
      expect(walletBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
      if (width < 768) {
        await expect(balance).toBeHidden();
        await expect(historyLabel).toBeHidden();
      } else {
        await expect(balance).toBeVisible();
        await expect(historyLabel).toBeVisible();
        const labelBox = await label.boundingBox();
        const balanceBox = await balance.boundingBox();
        expect(balanceBox.x).toBeGreaterThanOrEqual(labelBox.x + labelBox.width);
        const centerOffset = labelBox.y + labelBox.height / 2 - (balanceBox.y + balanceBox.height / 2);
        expect(Math.abs(centerOffset)).toBeLessThanOrEqual(1.5);
      }
      await page.screenshot({ path: testInfo.outputPath("my-page.png"), fullPage: true });
      await wallet.click();
      await expect(page).toHaveURL(/\/my\/points$/);
      await expect(page.getByText("650 P", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "이번 주 적립 한도" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "모임 만들기", exact: true })).toBeVisible();
      await expect(page.getByText("3회 중 2회 적립, 1회 처리 중")).toBeVisible();
      await expect(page.getByText("처리 중", { exact: true })).toBeVisible();
      await expect(page.getByText("+50 P", { exact: true })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: "서비스 가입" })).toContainText("+200 P");
      await page.getByRole("button", { name: "내역 더 보기" }).click();
      await expect(page.getByText("활동한 주의 적립 한도에 도달했어요.")).toBeVisible();
      await assertSurface(page, state, { axe: true });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath("points.png"), fullPage: true });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: testInfo.outputPath("points-end.png") });
    });
  }
}

test("renders a new reward and quota from the server rule", async ({ page }) => {
  const state = await installApiFixture(page);
  const reason = "CHALLENGE_CLEAR";
  const label = "챌린지 완료";
  const quota = { limit: 2, completed: 1, pending: 0, remaining: 1 };
  await page.route("**/api/members/me/points", (route) => route.fulfill({ json: {
    success: true,
    data: {
      enabled: true, balance: 7, processing: false, resetsAt: "2026-11-09T00:00:00",
      weeklyQuotas: [{ reason, label, quota }]
    },
    error: null
  } }));
  await page.route("**/api/members/me/points/transactions", (route) => route.fulfill({ json: {
    success: true,
    data: {
      items: [{ ...events[1], reason, label, amount: 7 }],
      hasNext: false, nextCursor: null
    },
    error: null
  } }));

  await page.goto("/my/points");
  await expect(page.getByRole("heading", { name: label })).toBeVisible();
  await expect(page.getByText("2회 중 1회 적립")).toBeVisible();
  const reward = page.getByRole("listitem").filter({ hasText: label });
  await expect(reward).toContainText("+7 P");
  await assertSurface(page, state, { axe: true });
});

test("pending points refresh while the member stays on the page", async ({ page }) => {
  const { settle } = await setup(page);
  await page.goto("/my/points");
  await expect(page.getByText("처리 중", { exact: true })).toBeVisible();
  settle();
  await expect(page.getByText("700 P", { exact: true })).toBeVisible();
  await expect(page.getByText("처리 중", { exact: true })).toHaveCount(0);
});

test("shows a reward awaiting review without polling summary or history", async ({ page }) => {
  await page.clock.install();
  const { reads } = await setup(page, { needsReview: true });
  await page.goto("/my/points");
  await expect(page.getByText("지급 확인 중", { exact: true })).toBeVisible();
  const initialReads = { ...reads };

  await page.clock.runFor(15000);

  expect(reads).toEqual(initialReads);
});
