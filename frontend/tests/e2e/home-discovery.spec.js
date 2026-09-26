import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";
import { group, installApiFixture } from "./api-fixture.js";

const today = "2026-09-27";
const makeGroup = (id, name, type = "SESSION", date = today, hour = "12") => ({
  ...group,
  id,
  name,
  type,
  introduction: "함께 이야기 나누며 즐겁게 참여할 수 있는 자리예요.",
  recurringSchedule: type === "SESSION" ? null : group.recurringSchedule,
  sessionSchedule:
    type === "SESSION"
      ? { sessionDate: date, startTime: `${hour}:00`, endTime: `${hour}:50` }
      : null
});
const groups = [
  makeGroup(101, "저녁 산책 같이해요", "SESSION", today, "19"),
  makeGroup(102, "점심 한 끼 같이해요", "SESSION", today, "12"),
  makeGroup(103, "커피와 이야기", "SESSION", today, "14"),
  { ...makeGroup(104, "보드게임 한 판", "SESSION", today, "17"), activeRecruitment: null },
  makeGroup(105, "내일의 독서", "SESSION", "2026-09-28", "10"),
  makeGroup(201, "자바 스터디", "STUDY"),
  makeGroup(202, "리액트 스터디", "STUDY"),
  makeGroup(203, "러닝 동아리", "CLUB")
];

async function installHome(page, options = {}) {
  await page.clock.install({ time: new Date("2026-09-27T00:00:00Z") });
  await installApiFixture(page);
  await page.route("**/images/default-group.png", (route) => route.continue());
  const state = { todayError: options.todayError ?? false, requests: [] };
  await page.route("**/api/groups?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    state.requests.push(Object.fromEntries(params));
    if (params.has("sessionDate") && state.todayError) {
      return route.fulfill({
        status: 503,
        json: { success: false, data: null, error: { code: "SERVICE_UNAVAILABLE" } }
      });
    }
    const rows = (
      options.emptyToday && params.has("sessionDate") ? [] : (options.groups ?? groups)
    ).filter(
      (row) =>
        (!params.get("type") || row.type === params.get("type")) &&
        (!params.get("excludedType") || row.type !== params.get("excludedType")) &&
        (!params.get("sessionDate") ||
          row.sessionSchedule?.sessionDate === params.get("sessionDate")) &&
        (!params.get("keyword") || row.name.includes(params.get("keyword")))
    );
    const offset = Number(params.get("cursor") || 0);
    const size = params.has("sessionDate") ? 2 : 3;
    const items = rows.slice(offset, offset + size);
    const hasNext = offset + size < rows.length;
    await route.fulfill({
      json: {
        success: true,
        error: null,
        data: { items, hasNext, nextCursor: hasNext ? String(offset + size) : null }
      }
    });
  });
  return state;
}

const hero = (page) =>
  page.getByRole("region", { name: "오늘의 같이해요를 먼저 확인해요", exact: true });
const sessions = (page) => page.getByRole("region", { name: "같이해요", exact: true });
const communities = (page) => page.getByRole("region", { name: "스터디·동아리", exact: true });
const activePlan = (page) => hero(page).locator('.today-plan__item:not([aria-hidden="true"])');

for (const width of [375, 768, 1280, 1440]) {
  test(`home layout, keyboard controls and accessibility at ${width}px`, async ({
    page
  }, testInfo) => {
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await installHome(page);
    await page.goto("/groups");
    await expect(activePlan(page)).toContainText("점심 한 끼 같이해요");
    await expect(hero(page).getByRole("link")).toHaveCount(4);
    await expect(sessions(page).getByRole("link")).toHaveCount(3);
    await expect(communities(page).getByRole("link")).toHaveCount(3);
    await expect(communities(page)).not.toContainText("같이해요");
    if (width < 768) {
      const card = sessions(page).getByRole("link").first();
      const visual = await card.locator(".ui-group-card__visual").boundingBox();
      const body = await card.locator(".ui-group-card__body").boundingBox();
      expect(body.x).toBeGreaterThan(visual.x);
      expect(Math.abs(body.y - visual.y)).toBeLessThan(2);
    }
    await expect(hero(page)).not.toContainText("내일의 독서");
    await hero(page).getByRole("button", { name: "다음 같이해요 보기", exact: true }).click();
    await expect(activePlan(page)).toContainText("커피와 이야기");
    await expect(hero(page).locator('a[aria-current="true"]')).toContainText("커피와 이야기");
    await expect
      .poll(async () => {
        const visiblePlan = await activePlan(page).boundingBox();
        const dial = await hero(page).locator(".today-plan__dial").boundingBox();
        return (
          visiblePlan.y >= dial.y && visiblePlan.y + visiblePlan.height <= dial.y + dial.height
        );
      })
      .toBe(true);
    expect((await hero(page).locator(".today-plan").boundingBox()).height).toBeLessThan(500);
    await hero(page).getByRole("button", { name: "4번째 같이해요 보기" }).focus();
    await page.keyboard.press("Enter");
    await expect(activePlan(page)).toContainText("저녁 산책 같이해요");
    await hero(page).getByRole("button", { name: "1번째 같이해요 보기" }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const missingActions = await page
      .locator(".groups-page--home")
      .locator("a,button,input,select,form")
      .evaluateAll((elements) =>
        elements
          .filter((element) => !element.dataset.phCaptureAttributeAction)
          .map((element) => element.outerHTML)
      );
    expect(missingActions).toEqual([]);
    const accessibility = await new AxeBuilder({ page })
      .include(".groups-page--home")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    expect(failures).toEqual([]);
  });
}

test("independent search, type filters, pagination and links", async ({ page }) => {
  const state = await installHome(page);
  await page.goto("/groups");
  await expect(sessions(page).getByRole("link")).toHaveCount(3);
  await sessions(page).getByRole("button", { name: "더 많은 같이해요 보기" }).click();
  await expect(sessions(page).getByRole("link")).toHaveCount(5);
  await expect(communities(page).getByRole("link")).toHaveCount(3);
  await sessions(page).getByRole("searchbox").fill("커피");
  await sessions(page).getByRole("button", { name: "검색", exact: true }).click();
  await expect(sessions(page).getByRole("link")).toHaveCount(1);
  await expect(communities(page).getByRole("link")).toHaveCount(3);
  await communities(page).getByLabel("모임 유형").selectOption("STUDY");
  await expect(communities(page).getByRole("link")).toHaveCount(2);
  await expect(sessions(page).getByRole("link")).toHaveCount(1);
  await communities(page).getByRole("searchbox").fill("자바");
  await communities(page).getByRole("button", { name: "검색", exact: true }).click();
  await expect(communities(page).getByRole("link")).toHaveCount(1);
  await expect(hero(page).getByRole("link")).toHaveCount(4);
  expect(
    state.requests.some((request) => request.sessionDate === today && request.cursor === "2")
  ).toBe(true);
  await sessions(page).getByRole("link").click();
  await expect(page).toHaveURL(/\/groups\/103$/);
  await page.goBack();
  await expect(sessions(page).getByRole("searchbox")).toHaveValue("커피");
  await expect(communities(page).getByRole("searchbox")).toHaveValue("자바");
});

test("automatic rotation synchronizes the dial, pauses on hover and remains paused after manual control", async ({
  page
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installHome(page);
  await page.goto("/groups");
  await expect(activePlan(page)).toContainText("점심 한 끼 같이해요");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await expect(activePlan(page)).toContainText("커피와 이야기");
  await page.screenshot({ path: testInfo.outputPath("dial-transition.png") });
  await page.clock.runFor(500);
  await page.screenshot({ path: testInfo.outputPath("dial-settled.png") });
  await hero(page).locator(".today-session-ticket").first().hover();
  await page.clock.fastForward(10000);
  await expect(activePlan(page)).toContainText("커피와 이야기");
  await hero(page).getByRole("button", { name: "다음 같이해요 보기", exact: true }).click();
  await page.mouse.move(0, 0);
  await page.getByRole("link", { name: "같이해요 둘러보기" }).focus();
  await page.clock.fastForward(15000);
  await expect(activePlan(page)).toContainText("보드게임 한 판");
  await hero(page).getByRole("button", { name: "오늘 같이해요 자동 전환 재생" }).click();
  await page.getByRole("link", { name: "같이해요 둘러보기" }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await expect(activePlan(page)).toContainText("저녁 산책 같이해요");
});

test("today empty state retains both discovery sections", async ({ page }, testInfo) => {
  await installHome(page, { emptyToday: true });
  await page.goto("/groups");
  await expect(hero(page)).toContainText("오늘 예정된 같이해요가 아직 없어요.");
  await expect(sessions(page).getByRole("link")).toHaveCount(3);
  await expect(communities(page).getByRole("link")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("home-empty.png"), fullPage: true });
});

test("today errors are isolated and can be retried", async ({ page }, testInfo) => {
  const state = await installHome(page, { todayError: true });
  await page.goto("/groups");
  await page.clock.fastForward(10000);
  await expect(hero(page).getByText("오늘의 같이해요를 불러오지 못했어요")).toBeVisible();
  await expect(sessions(page).getByRole("link")).toHaveCount(3);
  await expect(communities(page).getByRole("link")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("home-error.png"), fullPage: true });
  state.todayError = false;
  await hero(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(activePlan(page)).toContainText("점심 한 끼 같이해요");
});

test("a single today session has no unnecessary rotation controls", async ({ page }) => {
  await installHome(page, { groups: [groups[1], groups[5]] });
  await page.goto("/groups");
  await expect(activePlan(page)).toContainText("점심 한 끼 같이해요");
  await expect(hero(page).getByRole("button")).toHaveCount(0);
  await expect(hero(page).getByRole("link")).toHaveCount(1);
});

test("swiping on a mobile ticket changes the plan without opening the link", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await installHome(page);
  await page.goto("/groups");
  await expect(activePlan(page)).toContainText("점심 한 끼 같이해요");
  const box = await hero(page).locator(".today-session-ticket").first().boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = Math.round(box.y + 80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 290, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 160, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(activePlan(page)).toContainText("커피와 이야기");
  await expect(page).toHaveURL(/\/groups$/);
  await cdp.detach();
});

test("session creation opens the editor with 같이해요 selected", async ({ page }) => {
  await installHome(page);
  await page.goto("/groups");
  await sessions(page).getByRole("button", { name: "같이해요 만들기" }).click();
  await expect(page).toHaveURL(/\/groups\/new\?type=SESSION$/);
  await expect(page.locator('select[name="type"]')).toHaveValue("SESSION");
});
