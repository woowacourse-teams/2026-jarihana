import { chromium, expect, test } from "playwright/test";

import { assertSurface, installApiFixture, prepareVisualCapture } from "./api-fixture.js";

const evidenceDirectory = "../.omo/evidence/visual-qa";
const returnTargetStorageKey = "jarihana:auth:return-target";

const viewports = [
  { height: 800, label: "mobile-360", width: 360 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 1000, label: "desktop-1440", width: 1440 }
];

const isolatedRouteCaptures = new Set([
  "not-found:mobile-360",
  "not-found:tablet-768",
  "not-found:desktop-1440",
  "signup:desktop-1440",
  "recruitments-manage:desktop-1440",
  "oauth-callback:mobile-360",
  "my-registrations:desktop-1440"
]);

const routes = [
  { expected: "크루와 함께할 자리를 찾아보세요", name: "root", path: "/" },
  { expected: "크루와 함께할 자리를 찾아보세요", name: "groups", path: "/groups" },
  { expected: "프론트엔드 한 자리", name: "group-detail", path: "/groups/10" },
  {
    expected: "프론트엔드 한 자리 모집",
    name: "recruitment-detail",
    path: "/groups/10/recruitments/20"
  },
  { expected: "마이페이지", name: "oauth-callback", path: "/oauth/callback" },
  {
    auth: "signup-required",
    expected: "자리하나에서 사용할 정보를",
    name: "signup",
    path: "/signup"
  },
  { expected: "마이페이지", name: "my", path: "/my" },
  { expected: "내 모임", name: "my-groups", path: "/my/groups" },
  { expected: "내 신청", name: "my-registrations", path: "/my/registrations" },
  { expected: "신규 모임 생성", name: "group-create", path: "/groups/new" },
  { expected: "프론트엔드 한 자리", name: "group-manage", path: "/groups/10/manage" },
  { expected: "멤버 관리", name: "members-manage", path: "/groups/10/manage/members" },
  { expected: "모집 관리", name: "recruitments-manage", path: "/groups/10/manage/recruitments" },
  {
    expected: "프론트엔드 한 자리",
    name: "registrations-manage",
    path: "/groups/10/manage/recruitments/20/registrations"
  },
  { expected: "자리하나 UI Primitive Showcase", name: "showcase", path: "/__showcase" },
  { expected: "페이지를 찾을 수 없어요", name: "not-found", path: "/does-not-exist" }
];

const matchedFigmaCaptures = [
  {
    expected: "크루와 함께할 자리를 찾아보세요",
    height: 1009,
    name: "groups-1526x1009",
    path: "/groups",
    width: 1526
  },
  {
    expected: "프론트엔드 한 자리",
    height: 1349,
    name: "group-detail-1440x1349",
    path: "/groups/10",
    width: 1440
  },
  { expected: "마이페이지", height: 1000, name: "my-1440x1000", path: "/my", width: 1440 },
  {
    expected: "프론트엔드 한 자리",
    height: 1349,
    name: "group-manage-edit-1440x1349",
    path: "/groups/10/manage",
    width: 1440
  },
  {
    expected: "프론트엔드 한 자리",
    height: 1000,
    name: "manage-registrations-1440x1000",
    path: "/groups/10/manage/recruitments/20/registrations",
    width: 1440
  },
  {
    expected: "신규 모임 생성",
    height: 1120,
    name: "group-create-1440x1120",
    path: "/groups/new",
    width: 1440
  },
  {
    expected: "멤버 관리",
    height: 1120,
    name: "members-manage-1440x1120",
    path: "/groups/10/manage/members",
    width: 1440
  },
  {
    expected: "모집 관리",
    height: 1120,
    name: "recruitments-manage-1440x1120",
    path: "/groups/10/manage/recruitments",
    width: 1440
  }
];

function watchBrowserFailures(page, expectedFetchFailures = []) {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const locationUrl = message.location().url;
    const expectedFailure = expectedFetchFailures.some(({ path, status }) => {
      const responsePattern = new RegExp(`Failed to load resource.*status.*${status}`, "i");
      return (
        locationUrl &&
        new URL(locationUrl).pathname === path &&
        responsePattern.test(message.text())
      );
    });
    if (!expectedFailure) failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

async function captureEvidence(page, options) {
  const { path, ...captureOptions } = options;
  await page.locator(".app-header").screenshot({ animations: "disabled" });
  await page.screenshot({ ...captureOptions, animations: "disabled" });
  await prepareVisualCapture(page);
  await page.screenshot({ ...captureOptions, animations: "disabled", path });
}

test.describe("visual evidence", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    for (const route of routes) {
      test(`${route.name} renders at ${viewport.label}`, async ({ page }) => {
        const isolateCapture = isolatedRouteCaptures.has(`${route.name}:${viewport.label}`);
        const isolatedBrowser = isolateCapture
          ? await chromium.launch({ args: ["--disable-gpu"] })
          : null;
        const isolatedContext = isolatedBrowser
          ? await isolatedBrowser.newContext({
              baseURL: "http://127.0.0.1:4174",
              locale: "ko-KR",
              reducedMotion: "reduce",
              timezoneId: "Asia/Seoul",
              viewport
            })
          : null;
        const capturePage = isolatedContext ? await isolatedContext.newPage() : page;

        await capturePage.setViewportSize(viewport);
        const browserFailures = watchBrowserFailures(capturePage);
        const state = await installApiFixture(capturePage, { auth: route.auth });

        await capturePage.goto(route.path);
        await expect(
          capturePage.getByRole("heading", { name: route.expected, exact: false }).first()
        ).toBeVisible();
        await assertSurface(capturePage, state, { axe: viewport.width === 1440 });
        expect(browserFailures, "브라우저 console/page error가 없어야 합니다").toEqual([]);
        await prepareVisualCapture(capturePage);
        const requiresFullPage = await capturePage.evaluate(
          () => document.documentElement.scrollHeight > window.innerHeight
        );

        const screenshotOptions = {
          animations: "disabled",
          fullPage: requiresFullPage,
          path: `${evidenceDirectory}/${route.name}-${viewport.label}.png`
        };
        if (isolateCapture) {
          await capturePage.screenshot(screenshotOptions);
        } else {
          await captureEvidence(capturePage, screenshotOptions);
        }
        await isolatedBrowser?.close();
      });
    }
  }

  for (const capture of matchedFigmaCaptures) {
    test(`${capture.name} matched Figma capture`, async ({ page }) => {
      const viewport = { height: capture.height, width: capture.width };
      const isolateCapture = capture.name === "members-manage-1440x1120";
      const isolatedBrowser = isolateCapture
        ? await chromium.launch({ args: ["--disable-gpu"] })
        : null;
      const isolatedContext = isolatedBrowser
        ? await isolatedBrowser.newContext({
            baseURL: "http://127.0.0.1:4174",
            locale: "ko-KR",
            reducedMotion: "reduce",
            timezoneId: "Asia/Seoul",
            viewport
          })
        : null;
      const capturePage = isolatedContext ? await isolatedContext.newPage() : page;

      await capturePage.setViewportSize(viewport);
      const browserFailures = watchBrowserFailures(capturePage);
      const state = await installApiFixture(capturePage);

      await capturePage.goto(capture.path);
      await expect(
        capturePage.getByRole("heading", { name: capture.expected, exact: false }).first()
      ).toBeVisible();
      await assertSurface(capturePage, state);
      expect(browserFailures).toEqual([]);
      await prepareVisualCapture(capturePage);
      const screenshotOptions = {
        animations: "disabled",
        path: `${evidenceDirectory}/matched/${capture.name}.png`
      };
      if (isolateCapture) {
        await capturePage.screenshot(screenshotOptions);
      } else {
        await captureEvidence(capturePage, screenshotOptions);
      }
      await isolatedBrowser?.close();
    });
  }
});

test("does not show the persistent footer while a lazy route is resolving", async ({ page }) => {
  let lazyChunkRequested = false;
  let releaseLazyChunk;
  const lazyChunkReleased = new Promise((resolve) => {
    releaseLazyChunk = resolve;
  });

  await page.route("**/assets/**", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    if (!body.toString().includes("groups-hero")) {
      await route.fulfill({ body, response });
      return;
    }

    lazyChunkRequested = true;
    await lazyChunkReleased;
    await route.fulfill({ body, response });
  });

  const state = await installApiFixture(page);
  await page.goto("/", { waitUntil: "commit" });
  await expect.poll(() => lazyChunkRequested).toBe(true);
  await expect(page.locator(".route-loading")).toHaveCount(1);
  await expect(page.locator("footer")).toBeHidden();

  releaseLazyChunk();
  await expect(page.getByRole("heading", { name: "크루와 함께할 자리를 찾아보세요" })).toBeVisible();
  expect(state.unexpectedResponses).toEqual([]);
});

test("keeps the desktop footer contact hierarchy muted and vertically centered", async ({ page }) => {
  await page.setViewportSize({ height: 831, width: 1190 });
  const state = await installApiFixture(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "크루와 함께할 자리를 찾아보세요" })).toBeVisible();

  const styles = await page.evaluate(() => {
    const footer = document.querySelector(".app-footer");
    const actions = document.querySelector(".app-footer__actions");
    const heading = document.querySelector(".app-footer__contact h2");
    const copy = document.querySelector(".app-footer__contact p");
    const center = (rect) => rect.top + rect.height / 2;
    return {
      actionsCenter: center(actions.getBoundingClientRect()),
      copyColor: getComputedStyle(copy).color,
      copyFontSize: getComputedStyle(copy).fontSize,
      footerCenter: center(footer.getBoundingClientRect()),
      headingColor: getComputedStyle(heading).color
    };
  });

  expect(styles.copyColor).toBe("rgb(184, 184, 184)");
  expect(styles.copyFontSize).toBe("14px");
  expect(styles.headingColor).toBe("rgb(255, 255, 255)");
  expect(Math.abs(styles.actionsCenter - styles.footerCenter)).toBeLessThan(2);
  expect(state.unexpectedResponses).toEqual([]);
});

test("places the desktop primary navigation beside the brand", async ({ page }) => {
  await page.setViewportSize({ height: 831, width: 1190 });
  const state = await installApiFixture(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "크루와 함께할 자리를 찾아보세요" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const brand = document.querySelector(".app-header__brand").getBoundingClientRect();
    const nav = document.querySelector(".app-header__desktop-nav").getBoundingClientRect();
    const action = document.querySelector(".app-header__desktop-action").getBoundingClientRect();
    return {
      actionLeft: action.left,
      brandRight: brand.right,
      navLeft: nav.left,
      navRight: nav.right
    };
  });

  expect(layout.navLeft).toBeGreaterThanOrEqual(layout.brandRight);
  expect(layout.navLeft - layout.brandRight).toBeLessThanOrEqual(32);
  expect(layout.navRight).toBeLessThan(layout.actionLeft);
  expect(state.unexpectedResponses).toEqual([]);
});

test("anonymous deep link preserves continuation and stubs GitHub OAuth", async ({ page }) => {
  const browserFailures = watchBrowserFailures(page, [
    { path: "/api/members/me", status: 401 },
    { path: "/api/auth/refresh", status: 401 }
  ]);
  const state = await installApiFixture(page, { auth: "anonymous" });

  await page.goto("/my/registrations?status=PENDING");
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByText("우테코 동료와", { exact: false })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), returnTargetStorageKey)).toBe(
    "/my/registrations?status=PENDING"
  );

  await page.getByRole("button", { name: "GitHub로 로그인" }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);
  await expect(page.getByRole("heading", { name: "Stub GitHub OAuth" })).toBeVisible();
  expect(browserFailures).toEqual([]);
  expect(state.unexpectedResponses).toEqual([]);
});

test("signup-required continuation submits exact member payload", async ({ page }) => {
  const browserFailures = watchBrowserFailures(page);
  const state = await installApiFixture(page, { auth: "signup-required" });
  await page.addInitScript(
    ([key, value]) => {
      sessionStorage.setItem(key, value);
    },
    [returnTargetStorageKey, "/my/registrations"]
  );

  await page.goto("/signup");
  await page.getByLabel("크루 이름").fill("자리");
  await page.getByLabel("기수").fill("8");
  await page.getByLabel("과정").selectOption("FRONTEND");
  await page.getByRole("button", { name: "가입 완료하기" }).click();

  await expect(page).toHaveURL(/\/my\/registrations$/);
  const signupRequest = state.requests.find(
    (request) => request.method === "POST" && request.path === "/members"
  );
  expect(signupRequest?.postData).toEqual({ course: "FRONTEND", crewName: "자리", generation: 8 });
  expect(browserFailures).toEqual([]);
  expect(state.unexpectedResponses).toEqual([]);
});

test("group discovery keeps filters in URL and opens detail tabs", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.goto("/groups");

  await page.getByLabel("모임 검색").fill("프론트");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page).toHaveURL(/keyword=%ED%94%84%EB%A1%A0%ED%8A%B8/);
  await page.getByRole("button", { name: "스터디" }).click();
  await expect(page).toHaveURL(/type=STUDY/);
  await page.getByRole("link", { name: /프론트엔드 한 자리/ }).click();
  await expect(page).toHaveURL(/\/groups\/10$/);

  const memberTab = page.getByRole("tab", { name: /멤버/ });
  await memberTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toBeVisible();
  await assertSurface(page, state);
});

test("anonymous protected navigation gives login feedback without a silent round trip", async ({
  page
}) => {
  const state = await installApiFixture(page, { auth: "anonymous" });
  await page.goto("/groups");

  await page.getByRole("link", { name: "모임 만들기", exact: true }).click();

  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByText("로그인이 필요한 메뉴예요", { exact: true })).toBeVisible();
  await expect(
    page.getByText("GitHub로 로그인한 뒤 이용할 수 있어요", { exact: true })
  ).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), returnTargetStorageKey)).toBe(
    "/groups/new"
  );
  expect(state.unexpectedResponses).toEqual([]);
});

test("group discovery aligns its sections and keeps status badges inside card bodies", async ({
  page
}) => {
  await page.setViewportSize({ height: 806, width: 1159 });
  const state = await installApiFixture(page);
  await page.goto("/groups");
  await expect(page.getByRole("link", { name: /프론트엔드 한 자리/ }).first()).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    };
    const searchStyle = getComputedStyle(document.querySelector(".groups-search__control"));
    return {
      badge: bounds(".groups-grid .ui-badge"),
      body: bounds(".groups-grid .ui-group-card__body"),
      grid: bounds(".groups-grid"),
      hero: bounds(".groups-hero"),
      image: bounds(".groups-grid .ui-group-card__image"),
      searchBorderRadius: Number.parseFloat(searchStyle.borderRadius),
      searchBorderStyle: searchStyle.borderStyle,
      tools: bounds(".groups-tools")
    };
  });

  expect(geometry.searchBorderStyle).toBe("solid");
  expect(geometry.searchBorderRadius).toBeGreaterThan(0);
  expect(geometry.hero.left).toBeCloseTo(geometry.tools.left, 0);
  expect(geometry.hero.right).toBeCloseTo(geometry.tools.right, 0);
  expect(geometry.hero.left).toBeCloseTo(geometry.grid.left, 0);
  expect(geometry.hero.right).toBeCloseTo(geometry.grid.right, 0);
  expect(geometry.badge.top).toBeGreaterThanOrEqual(geometry.body.top);
  expect(geometry.badge.bottom).toBeLessThanOrEqual(geometry.body.bottom);
  expect(geometry.badge.top).toBeGreaterThanOrEqual(geometry.image.bottom);
  await assertSurface(page, state, { axe: true });
});

test("registration can be created and withdrawn through confirmation dialogs", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.goto("/groups/10/recruitments/20");
  await page.getByLabel("가입 신청 메시지").fill("함께 공부하고 싶어요.");
  await page.getByRole("button", { name: "가입 신청하기" }).click();
  await expect(page.getByRole("dialog", { name: "가입 신청을 보낼까요?" })).toBeVisible();
  await page.getByRole("button", { name: "신청 확정" }).click();
  await expect(page.getByText("신청을 보냈어요.")).toBeVisible();

  await page.goto("/my/registrations");
  const trigger = page.getByRole("button", { name: "신청 철회" });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "신청을 철회할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "철회하기" }).click();
  await expect(page.getByRole("heading", { name: "신청 목록" })).toBeFocused();
  await expect(page.getByText("신청을 철회했어요")).toBeVisible();
  await assertSurface(page, state);
});

test("group creation and edit lifecycle mutations use server contracts", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.goto("/groups/new");
  await page.getByLabel("모임 이름").fill("새 모임");
  await page.getByLabel("한 줄 소개").fill("새로운 배움의 자리");
  await page.getByLabel("상세 소개").fill("함께 오래 공부합니다.");
  await page.getByLabel("목요일").check();
  await page.getByRole("button", { name: "모임 만들기" }).click();
  await expect(page).toHaveURL(/\/groups\/10\/manage$/);

  await page.getByLabel("한 줄 소개").fill("수정한 소개입니다.");
  await page.getByRole("button", { name: "기본 정보 저장" }).click();
  await expect
    .poll(
      () =>
        state.requests.filter(
          (request) => request.method === "PUT" && request.path === "/groups/10"
        ).length
    )
    .toBe(1);
  await assertSurface(page, state);
});

test("leader transfers leadership, closes recruitment, and decides registration", async ({
  page
}) => {
  const state = await installApiFixture(page);

  await page.goto("/groups/10/manage/members");
  const transfer = page.getByRole("button", { name: "하나에게 모임장 넘기기" });
  await transfer.click();
  await page.getByRole("button", { name: "모임장 넘기기", exact: true }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (request) => request.method === "PUT" && request.path === "/groups/10/leader"
      )
    )
    .toBe(true);

  await page.goto("/groups/10/manage/recruitments");
  await page.getByRole("button", { name: "20번 모집 마감하기" }).click();
  await page.getByRole("button", { name: "모집 마감하기", exact: true }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (request) => request.method === "PATCH" && request.path === "/groups/10/recruitments/20"
      )
    )
    .toBe(true);

  await page.goto("/groups/10/manage/recruitments/20/registrations");
  await page.getByRole("button", { name: "하나 승인" }).click();
  await page.getByRole("button", { name: "신청 승인하기" }).click();
  const decision = state.requests.find(
    (request) => request.method === "PATCH" && request.path === "/recruitments/20/registrations/40"
  );
  expect(decision?.postData).toEqual({ status: "APPROVED" });
  await assertSurface(page, state);
});

test("mobile drawer traps keyboard focus, closes on Escape, and restores focus", async ({
  page
}) => {
  await page.setViewportSize({ height: 800, width: 360 });
  const state = await installApiFixture(page);
  await page.goto("/groups");

  const trigger = page.getByRole("button", { name: "메뉴 열기" });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "전체 메뉴" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await assertSurface(page, state);
});

for (const failure of [
  { expected: "권한", name: "403", status: 403 },
  { expected: "찾을 수 없어요", name: "404", status: 404 },
  { expected: "불러오지 못했어요", name: "network", status: 0 }
]) {
  test(`${failure.name} group failure exposes a recoverable state`, async ({ page }) => {
    const browserFailures = watchBrowserFailures(
      page,
      [403, 404].includes(failure.status)
        ? [{ path: "/api/groups/10", status: failure.status }]
        : []
    );
    const state = await installApiFixture(page, {
      errorPath: "/api/groups/10",
      errorStatus: failure.status
    });
    await page.goto("/groups/10/manage");
    await expect(page.getByText(failure.expected, { exact: false }).first()).toBeVisible();
    const retry = page.getByRole("button", { name: "다시 시도" });
    if (await retry.count()) await expect(retry).toBeEnabled();
    await expect(page.locator("main")).toHaveCount(1);
    if (failure.status !== 0) expect(browserFailures).toEqual([]);
    expect(state.unexpectedResponses).toEqual([]);
  });
}
