import { expect, test } from "playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { group, installApiFixture, prepareVisualCapture } from "./api-fixture.js";

const defaultGroupImagePath = resolve(process.cwd(), "public/images/default-group.png");
const evidenceDirectory = "../.omo/evidence/responsive-grid";

const discoveryViewports = [
  { columns: 2, height: 900, label: "mobile-360", width: 360 },
  { columns: 2, height: 900, label: "mobile-375", width: 375 },
  { columns: 2, height: 900, label: "mobile-767", width: 767 },
  { columns: 3, height: 980, label: "tablet-768", width: 768 },
  { columns: 3, height: 980, label: "tablet-1023", width: 1023 },
  { columns: 4, height: 1000, label: "desktop-1024", width: 1024 },
  { columns: 4, height: 1000, label: "desktop-1280", width: 1280 },
  { columns: 4, height: 1000, label: "desktop-1440", width: 1440 },
  { columns: 4, height: 1000, label: "desktop-1920", width: 1920 }
];

const evidenceViewportLabels = new Set([
  "mobile-375",
  "tablet-768",
  "desktop-1280",
  "desktop-1440"
]);
const discoveryRoutes = [
  { label: "root", path: "/" },
  { label: "groups", path: "/groups" }
];

const groupNames = [
  "프론트엔드 한 자리",
  "주말 메이커 클럽",
  "웹 접근성 실전 세션",
  "알고리즘 리뷰 라운지",
  "오전 러닝 크루",
  "데이터 시각화 스터디",
  "긴 이름도 들어가는 타입스크립트 모임",
  "회고와 글쓰기 자리"
];

function responsiveGroups() {
  return groupNames.map((name, index) => ({
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
    introduction:
      index === 6
        ? "긴 단어와 한글 설명이 함께 있어도 카드 폭 안에서 자연스럽게 줄바꿈됩니다."
        : `${name}에서 함께 배우고 실행합니다.`,
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

async function installResponsiveDiscoveryFixture(page) {
  const state = await installApiFixture(page);
  await page.route("**/images/**", (route) =>
    route.fulfill({ contentType: "image/png", path: defaultGroupImagePath })
  );
  await page.route("**/api/groups?**", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: { hasNext: false, items: responsiveGroups(), nextCursor: null },
        error: null,
        success: true
      }),
      contentType: "application/json",
      status: 200
    })
  );
  return state;
}

function countFirstRowColumns(cards) {
  const firstTop = cards[0]?.top;
  if (firstTop === undefined) return 0;
  return cards.filter((card) => Math.abs(card.top - firstTop) <= 2).length;
}

function expectedContentRail(viewportWidth) {
  const containerWidth = Math.min(viewportWidth, 1440);
  const gutter = viewportWidth >= 1024 ? 32 : viewportWidth >= 768 ? 24 : 16;
  const left = (viewportWidth - containerWidth) / 2 + gutter;
  return { left, right: viewportWidth - left };
}

async function readDiscoveryLayout(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10;
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing layout target: ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: round(rect.bottom),
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        width: round(rect.width)
      };
    };
    const textTargets = [
      ...document.querySelectorAll(
        ".groups-grid .ui-badge, .groups-grid .ui-group-card__title, .groups-grid .ui-card__meta"
      )
    ].filter((element) => element instanceof HTMLElement);
    const overflowingText = textTargets
      .filter((element) => element.scrollWidth - element.clientWidth > 1)
      .map((element) => ({
        className: element.className,
        text: element.textContent.trim()
      }));
    const headerMenu = document.querySelector(".app-header__menu-button");
    const headerEnd =
      headerMenu instanceof HTMLElement && headerMenu.getBoundingClientRect().width > 0
        ? bounds(".app-header__menu-button")
        : bounds(".app-header__desktop-action");
    const heroArtStyle = getComputedStyle(document.querySelector(".groups-hero__art"));

    return {
      cards: [...document.querySelectorAll(".groups-card-frame")].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: round(rect.left),
          right: round(rect.right),
          top: round(rect.top),
          width: round(rect.width)
        };
      }),
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      footerActions: bounds(".app-footer__actions"),
      footerCopy: bounds(".app-footer__copy"),
      grid: bounds(".groups-grid"),
      headerEnd,
      headerStart: bounds(".app-header__brand"),
      hero: bounds(".groups-hero"),
      heroArt: {
        ...bounds(".groups-hero__art"),
        aspectRatio: heroArtStyle.aspectRatio,
        backgroundPosition: heroArtStyle.backgroundPosition,
        backgroundSize: heroArtStyle.backgroundSize
      },
      main: bounds(".groups-page"),
      overflowingText
    };
  });
}

for (const viewport of discoveryViewports) {
  for (const routeEntry of discoveryRoutes) {
    test(`${routeEntry.label} discovery uses ${viewport.columns} columns and shared rails at ${viewport.label}`, async ({
      page
    }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      const state = await installResponsiveDiscoveryFixture(page);

      await page.goto(routeEntry.path);
      await expect(
        page.getByRole("link", { name: /긴 이름도 들어가는 타입스크립트 모임/ })
      ).toBeVisible();

      const layout = await readDiscoveryLayout(page);
      const expectedRail = expectedContentRail(viewport.width);
      expect(layout.cards).toHaveLength(groupNames.length);
      expect(countFirstRowColumns(layout.cards)).toBe(viewport.columns);
      expect(layout.documentOverflow).toBe(0);
      expect(layout.grid.left).toBeCloseTo(expectedRail.left, 0);
      expect(layout.grid.right).toBeCloseTo(expectedRail.right, 0);
      expect(layout.hero.left).toBeCloseTo(layout.grid.left, 0);
      expect(layout.hero.right).toBeCloseTo(layout.grid.right, 0);
      expect(layout.heroArt.backgroundSize).toBe("contain");
      expect(layout.heroArt.aspectRatio).toBe("1672 / 941");
      expect(layout.heroArt.backgroundPosition).toBe("50% 50%");
      expect(layout.heroArt.left).toBeGreaterThanOrEqual(layout.hero.left);
      expect(layout.heroArt.right).toBeLessThanOrEqual(layout.hero.right);
      expect(layout.headerStart.left).toBeCloseTo(layout.grid.left, 0);
      expect(layout.headerEnd.right).toBeCloseTo(layout.grid.right, 0);
      expect(layout.footerCopy.left).toBeCloseTo(layout.grid.left, 0);
      expect(layout.footerActions.right).toBeCloseTo(layout.grid.right, 0);
      expect(layout.overflowingText).toEqual([]);
      expect(state.unexpectedResponses).toEqual([]);

      if (evidenceViewportLabels.has(viewport.label)) {
        await prepareVisualCapture(page);
        mkdirSync(resolve(process.cwd(), evidenceDirectory), { recursive: true });
        await page.screenshot({
          animations: "disabled",
          fullPage: true,
          path: `${evidenceDirectory}/${routeEntry.label === "root" ? "root-" : ""}${viewport.label}.png`
        });
      }
    });
  }
}
