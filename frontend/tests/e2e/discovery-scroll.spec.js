import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

// Expose classic scrollbar gutters so full-bleed backgrounds cannot hide horizontal overflow.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const discoveryViewports = [
  { height: 812, label: "mobile-375", width: 375 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 768, label: "desktop-1024", width: 1024 },
  { height: 900, label: "desktop-1280", width: 1280 },
  { height: 900, label: "desktop-1440", width: 1440 },
  { height: 1080, label: "desktop-1920", width: 1920 }
];

const compactViewport = { height: 568, label: "mobile-320", width: 320 };

const overflowViewports = [
  { height: 812, label: "mobile-375", width: 375 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 900, label: "desktop-1280", width: 1280 },
  { height: 1080, label: "wide-1920", width: 1920 }
];

const discoveryRoutes = [
  { label: "home", path: "/" },
  { label: "groups", path: "/groups" }
];

const groupNames = [
  "프론트엔드 한 자리",
  "주말 메이커 클럽",
  "웹 접근성 실전 세션",
  "알고리즘 리뷰 라운지",
  "오전 러닝 크루",
  "데이터 시각화 스터디",
  "타입스크립트 모임",
  "회고와 글쓰기 자리"
];

function discoveryGroups(count = groupNames.length) {
  return groupNames.slice(0, count).map((name, index) => ({
    ...group,
    activeRecruitment:
      index % 3 === 1
        ? null
        : {
            approvedCount: index + 1,
            capacity: 12,
            endsAt: "2026-09-21T19:00:00",
            id: 200 + index,
            joinMethod: index % 2 === 0 ? "APPROVAL" : "AUTO",
            startsAt: "2026-08-21T19:00:00"
          },
    id: 100 + index,
    introduction: `${name}에서 함께 배우고 실행합니다.`,
    leader: {
      crewName: ["자리", "하나", "두리", "보름"][index % 4],
      generation: 8 + (index % 2),
      memberId: 1000 + index
    },
    memberCount: 2 + index,
    name,
    representativeImageUrl: null,
    type: ["STUDY", "CLUB", "SESSION"][index % 3]
  }));
}

async function installDiscoveryFixture(page, groups = discoveryGroups()) {
  const state = await installApiFixture(page);
  await page.route("**/api/groups?**", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: { hasNext: false, items: groups, nextCursor: null },
        error: null,
        success: true
      }),
      contentType: "application/json",
      status: 200
    })
  );
  return state;
}

async function readDiscoveryControls(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10;
    const boundsOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: round(rect.bottom),
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top)
      };
    };
    const heading = document.querySelector("#recommended-groups");
    const search = document.querySelector(".groups-search__control");
    const filters = [...document.querySelectorAll(".groups-filter__field")];

    return {
      controls: [search, ...filters].map((element) =>
        element instanceof HTMLElement ? boundsOf(element) : null
      ),
      filterCount: filters.length,
      heading: heading instanceof HTMLElement ? boundsOf(heading) : null,
      scrollY: round(window.scrollY),
      viewportBottom: window.innerHeight,
      viewportHeight: window.innerHeight
    };
  });
}

async function clickDiscoveryButton(page) {
  await page.getByRole("button", { name: "자리 둘러보기로 이동" }).click();
  await expect
    .poll(() => readDiscoveryControls(page).then((layout) => layout.scrollY))
    .toBeGreaterThan(0);
}

async function expectDiscoveryControlsVisible(page) {
  await expect
    .poll(async () => {
      const layout = await readDiscoveryControls(page);
      const allControlsVisible = layout.controls.every(
        (control) =>
          control !== null && control.top >= 0 && control.bottom <= layout.viewportBottom
      );
      return (
        layout.heading !== null &&
        layout.heading.top >= 15 &&
        layout.heading.top <= 17 &&
        layout.filterCount === 3 &&
        allControlsVisible
      );
    })
    .toBe(true);
}

async function readHorizontalScrollState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;

    return {
      gutter: window.innerWidth - root.clientWidth,
      scrollWidthOverflow: root.scrollWidth - root.clientWidth,
      scrollX: window.scrollX
    };
  });
}

for (const viewport of discoveryViewports) {
  test(`places the discovery heading and controls in view when the hero CTA is clicked at ${viewport.label}`, async ({
    page
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const state = await installDiscoveryFixture(page);

    await page.goto("/");
    await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();
    await clickDiscoveryButton(page);

    await expectDiscoveryControlsVisible(page);
    const layout = await readDiscoveryControls(page);
    expect(layout.heading.top).toBeGreaterThanOrEqual(15);
    expect(layout.heading.top).toBeLessThanOrEqual(17);
    expect(layout.controls).toHaveLength(4);
    expect(state.unexpectedResponses).toEqual([]);
  });
}

test(`places the discovery heading and controls in view at ${compactViewport.label}`, async ({
  page
}) => {
  await page.setViewportSize({ height: compactViewport.height, width: compactViewport.width });
  const state = await installDiscoveryFixture(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();
  await clickDiscoveryButton(page);

  await expectDiscoveryControlsVisible(page);
  const layout = await readDiscoveryControls(page);
  expect(layout.heading.top).toBeGreaterThanOrEqual(15);
  expect(layout.heading.top).toBeLessThanOrEqual(17);
  expect(state.unexpectedResponses).toEqual([]);
});

test("places the discovery heading and controls in view when the hero CTA is activated from the keyboard", async ({
  page
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const state = await installDiscoveryFixture(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();
  await page.getByRole("button", { name: "자리 둘러보기로 이동" }).focus();
  await page.keyboard.press("Enter");

  await expect
    .poll(() => readDiscoveryControls(page).then((layout) => layout.scrollY))
    .toBeGreaterThan(0);
  await expectDiscoveryControlsVisible(page);
  expect(state.unexpectedResponses).toEqual([]);
});

test("returns the discovery heading and controls into view when the hero CTA is activated again", async ({
  page
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const state = await installDiscoveryFixture(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();
  await clickDiscoveryButton(page);
  await expectDiscoveryControlsVisible(page);
  await page.getByRole("button", { name: "맨 위로 이동" }).click();
  await expect
    .poll(() => readDiscoveryControls(page).then((layout) => layout.scrollY))
    .toBeLessThanOrEqual(2);
  await clickDiscoveryButton(page);

  await expectDiscoveryControlsVisible(page);
  expect(state.unexpectedResponses).toEqual([]);
});

test("keeps search and filter controls usable after the hero CTA scroll", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const state = await installDiscoveryFixture(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();
  await clickDiscoveryButton(page);
  await expectDiscoveryControlsVisible(page);
  await page.getByRole("searchbox", { name: "모임 검색" }).fill("러닝");
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("combobox", { name: "모임 유형", exact: true }).selectOption("CLUB");
  await page.getByRole("combobox", { name: "모집 상태", exact: true }).selectOption("true");

  await expect(page).toHaveURL(/keyword=%EB%9F%AC%EB%8B%9D/);
  await expect(page).toHaveURL(/type=CLUB/);
  await expect(page).toHaveURL(/recruiting=true/);
  expect(state.unexpectedResponses).toEqual([]);
});

test("places the discovery heading and controls in view when there is one card", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const state = await installDiscoveryFixture(page, discoveryGroups(1));

  await page.goto("/");
  await expect(page.getByRole("link", { name: /프론트엔드 한 자리/ })).toBeVisible();
  await clickDiscoveryButton(page);

  await expectDiscoveryControlsVisible(page);
  const layout = await readDiscoveryControls(page);
  expect(layout.heading.top).toBeGreaterThanOrEqual(15);
  expect(layout.heading.top).toBeLessThanOrEqual(17);
  expect(state.unexpectedResponses).toEqual([]);
});

test("places the discovery heading and controls in view when the list is empty", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  const state = await installDiscoveryFixture(page, []);

  await page.goto("/");
  await expect(page.getByText("자리 없음!")).toBeVisible();
  await clickDiscoveryButton(page);

  await expectDiscoveryControlsVisible(page);
  const layout = await readDiscoveryControls(page);
  expect(layout.heading.top).toBeGreaterThanOrEqual(15);
  expect(layout.heading.top).toBeLessThanOrEqual(17);
  expect(state.unexpectedResponses).toEqual([]);
});

test.describe("classic scrollbar horizontal overflow", () => {
  for (const viewport of overflowViewports) {
    for (const route of discoveryRoutes) {
      test(`keeps the root from overflowing horizontally with classic scrollbars on ${route.label} at ${viewport.label}`, async ({
        page
      }) => {
        await page.setViewportSize({ height: viewport.height, width: viewport.width });
        const state = await installDiscoveryFixture(page);

        await page.goto(route.path);
        await expect(page.getByRole("link", { name: /타입스크립트 모임/ })).toBeVisible();

        const before = await readHorizontalScrollState(page);
        expect(before.gutter).toBeGreaterThan(0);
        expect(before.scrollX).toBe(0);
        expect(before.scrollWidthOverflow).toBeLessThanOrEqual(0);

        await clickDiscoveryButton(page);
        await expectDiscoveryControlsVisible(page);

        const after = await readHorizontalScrollState(page);
        expect(after.gutter).toBeGreaterThan(0);
        expect(after.scrollX).toBe(0);
        expect(after.scrollWidthOverflow).toBeLessThanOrEqual(0);
        expect(state.unexpectedResponses).toEqual([]);
      });
    }
  }
});
