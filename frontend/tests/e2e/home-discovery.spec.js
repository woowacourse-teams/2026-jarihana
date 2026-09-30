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
  await page.route("**/images/default-group*.png", (route) => route.continue());
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
    const size = params.has("sessionDate") ? 2 : (options.discoveryPageSize ?? 3);
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

const hero = (page) => page.locator('section[aria-labelledby="today-sessions-title"]');
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
    await expect(sessions(page).getByRole("link")).toHaveCount(width < 768 ? 1 : 3);
    await expect(communities(page).getByRole("link")).toHaveCount(3);
    await expect(communities(page)).not.toContainText("같이해요");
    await expect(hero(page).locator(".today-session-ticket__location").first()).toHaveText(
      group.location
    );
    await expect(sessions(page).locator(".discovery-group-card__location").first()).toHaveText(
      group.location
    );
    await expect(communities(page).locator(".discovery-group-card__location").first()).toHaveText(
      group.location
    );
    if (width < 768) {
      const card = sessions(page).getByRole("link").first();
      const visual = await card.locator(".discovery-group-card__visual").boundingBox();
      const body = await card.locator(".discovery-group-card__body").boundingBox();
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
    for (const type of ["session", "study", "club"]) {
      const image = page.locator(`.discovery-group-card--${type} img`).first();
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveAttribute("src", `/images/default-group-${type}-3d.png`);
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(1254);
    }
    await expect(hero(page).locator("img").first()).toHaveAttribute(
      "src",
      "/images/default-group-session-3d.png"
    );
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    expect(failures).toEqual([]);
  });
}

for (const [width, columns] of [
  [375, 1],
  [768, 3],
  [1280, 4]
]) {
  test(
    "session discovery starts with one row and expands independently at " + width + "px",
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const state = await installHome(page, {
        discoveryPageSize: 6,
        groups: [
          ...Array.from({ length: 8 }, (_, index) =>
            makeGroup(110 + index, "오늘의 자리 " + (index + 1))
          ),
          ...groups.filter((item) => item.type !== "SESSION")
        ]
      });
      const sessionRequests = () =>
        state.requests.filter((request) => request.type === "SESSION" && !request.sessionDate);
      await page.goto("/groups");
      await expect(sessions(page).getByRole("link")).toHaveCount(columns);
      const rowTops = await sessions(page)
        .getByRole("link")
        .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top));
      expect(Math.max(...rowTops) - Math.min(...rowTops)).toBeLessThan(1);
      await sessions(page)
        .getByRole("heading", { name: "같이해요", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("session-preview-" + width + ".png") });
      const requestCount = sessionRequests().length;
      const more = sessions(page).getByRole("button", { name: "더 많은 같이해요 보기" });
      await expect(more).toHaveAttribute(
        "data-ph-capture-attribute-action",
        "session_discovery_load_more"
      );
      await more.click();
      await expect(sessions(page).getByRole("link")).toHaveCount(6);
      expect(sessionRequests()).toHaveLength(requestCount);
      await more.click();
      await expect(sessions(page).getByRole("link")).toHaveCount(8);
      expect(sessionRequests().at(-1).cursor).toBe("6");
      await expect(more).toHaveCount(0);
      await expect(communities(page).getByRole("link")).toHaveCount(3);
      await communities(page).getByLabel("모임 유형").selectOption("STUDY");
      await expect(communities(page).getByRole("link")).toHaveCount(2);
      await expect(sessions(page).getByRole("link")).toHaveCount(8);
      await sessions(page).getByRole("searchbox").fill("오늘");
      await expect(sessions(page).getByRole("link")).toHaveCount(8);
      await sessions(page).getByRole("button", { name: "검색", exact: true }).click();
      await expect(sessions(page).getByRole("link")).toHaveCount(columns);
      await more.click();
      await expect(sessions(page).getByRole("link")).toHaveCount(6);
      await sessions(page).getByRole("searchbox").fill("");
      await sessions(page).getByRole("button", { name: "검색", exact: true }).click();
      await expect(sessions(page).getByRole("link")).toHaveCount(columns);
      await page.setViewportSize({ width: 375, height: 900 });
      await expect(sessions(page).getByRole("link")).toHaveCount(1);
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(sessions(page).getByRole("link")).toHaveCount(4);
      await more.click();
      await expect(sessions(page).getByRole("link")).toHaveCount(8);
      await page.setViewportSize({ width: 375, height: 900 });
      await expect(sessions(page).getByRole("link")).toHaveCount(8);
    }
  );
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

test("cards use list locations, omit missing locations and contain long locations", async ({
  page
}) => {
  const longLocation = "서울특별시 송파구 올림픽로 35길 123 함께 공부하는 공간의 가장 안쪽 회의실";
  const detailRequests = [];
  page.on("request", (request) => {
    if (/\/api\/groups\/\d+$/.test(new URL(request.url()).pathname))
      detailRequests.push(request.url());
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await installHome(page, {
    groups: [{ ...groups[0], location: null }, { ...groups[1], location: longLocation }, groups[5]]
  });
  await page.goto("/groups");
  await expect(sessions(page).getByRole("link")).toHaveCount(1);
  await sessions(page).getByRole("button", { name: "더 많은 같이해요 보기" }).click();
  await expect(sessions(page).getByRole("link")).toHaveCount(2);
  await expect(
    hero(page).locator('a[href="/groups/101"] .today-session-ticket__location')
  ).toHaveCount(0);
  await expect(
    sessions(page).locator('a[href="/groups/101"] .discovery-group-card__location')
  ).toHaveCount(0);
  await expect(
    hero(page).locator('a[href="/groups/102"] .today-session-ticket__location')
  ).toHaveText(longLocation);
  await expect(
    sessions(page).locator('a[href="/groups/102"] .discovery-group-card__location')
  ).toHaveText(longLocation);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(detailRequests).toEqual([]);
});

test.describe("time-aware home headline", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("switches from lunch to afternoon at 13:00 in Seoul even in another browser timezone", async ({
    page
  }, testInfo) => {
    await installHome(page);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.addInitScript(() => {
      Math.random = () => 0.999;
    });
    await page.clock.setSystemTime(new Date("2026-09-27T03:59:50Z"));
    await page.goto("/groups");
    const heading = page.locator("#today-sessions-title");
    await expect(heading).toHaveText("오늘 구식 별로라던데, 나가서 먹을래요?");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: testInfo.outputPath("lunch-headline-375.png") });
    await page.clock.fastForward(60_000);
    await expect(heading).toHaveText("칼퇴. 칼퇴.");
  });
});

test.describe("campus-aware home headline", () => {
  const campus = { latitude: 37.406397, longitude: 127.088898, accuracy: 10 };

  test("uses an allowed campus location at night and drops the match after five minutes", async ({
    page,
    context
  }, testInfo) => {
    await installHome(page);
    await page.setViewportSize({ width: 375, height: 1000 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(campus);
    await page.clock.setSystemTime(new Date("2026-09-27T09:59:50Z"));
    await page.goto("/groups");
    const heading = page.locator("#today-sessions-title");
    await expect(heading).not.toHaveText("왜 아직 집 안 갔어요?");
    const checkLocation = page.getByRole("button", { name: "내 위치로 캠퍼스 확인" });
    await expect(checkLocation).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "home_campus_location_check"
    );
    await checkLocation.click();
    await expect(hero(page).getByRole("status")).toHaveText("판교 캠퍼스 근처예요.");
    await expect(heading).not.toHaveText("왜 아직 집 안 갔어요?");
    await page.clock.fastForward(60_000);
    await expect(heading).toHaveText("왜 아직 집 안 갔어요?");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: testInfo.outputPath("pangyo-night-375.png") });
    const accessibility = await new AxeBuilder({ page })
      .include(".today-sessions-hero__intro")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.clock.fastForward(4 * 60_000);
    await expect(heading).not.toHaveText("왜 아직 집 안 갔어요?");
    await expect(page.locator(".today-sessions-hero__location-status")).toBeEmpty();
  });

  for (const [name, position, message] of [
    [
      "outside the campus",
      { latitude: 37.5665, longitude: 126.978, accuracy: 10 },
      "캠퍼스 밖이네요. 어디서든 같이해요."
    ],
    ["too imprecise", { ...campus, accuracy: 300 }, "위치가 정확하지 않아요. 다시 확인해 주세요."]
  ]) {
    test("keeps general night copy when the position is " + name, async ({ page, context }) => {
      await installHome(page);
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation(position);
      await page.clock.setSystemTime(new Date("2026-09-27T10:00:00Z"));
      await page.goto("/groups");
      const heading = page.locator("#today-sessions-title");
      const original = await heading.textContent();
      await page.getByRole("button", { name: "내 위치로 캠퍼스 확인" }).click();
      await expect(hero(page).getByRole("status")).toHaveText(message);
      await expect(heading).toHaveText(original);
      await expect(heading).not.toHaveText("왜 아직 집 안 갔어요?");
    });
  }

  test("shows permission guidance while keeping general copy after denial", async ({ page }) => {
    await installHome(page);
    await page.clock.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: (_success, failure) => failure({ code: 1 }) }
      });
    });
    await page.goto("/groups");
    const heading = page.locator("#today-sessions-title");
    const original = await heading.textContent();
    await page.getByRole("button", { name: "내 위치로 캠퍼스 확인" }).click();
    await expect(hero(page).getByRole("status")).toHaveText(
      "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요."
    );
    await expect(heading).toHaveText(original);
  });
});
