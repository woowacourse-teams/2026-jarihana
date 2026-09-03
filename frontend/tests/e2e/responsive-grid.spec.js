import { expect, test } from "playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { group, installApiFixture, prepareVisualCapture } from "./api-fixture.js";

const defaultGroupImagePath = resolve(process.cwd(), "public/images/default-group.png");
const evidenceDirectory = "../.omo/evidence/responsive-grid";

const discoveryViewports = [
  { columns: 1, height: 900, label: "mobile-360", width: 360 },
  { columns: 1, height: 900, label: "mobile-375", width: 375 },
  { columns: 1, height: 900, label: "mobile-767", width: 767 },
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

test("mobile discovery filter selections fit in a single row", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const state = await installResponsiveDiscoveryFixture(page);
  await page.goto("/groups");
  await page.getByRole("combobox", { name: "모임 유형", exact: true }).selectOption("STUDY");
  await page.getByRole("combobox", { name: "모임 상태", exact: true }).selectOption("ENDED");
  await page.getByRole("combobox", { name: "모집 상태", exact: true }).selectOption("false");

  await expect(page).toHaveURL(/type=STUDY.*status=ENDED.*recruiting=false/);
  const widths = await page.locator(".groups-filter select").evaluateAll((selects) => {
    const context = document.createElement("canvas").getContext("2d");
    return selects.map((select) => {
      const style = getComputedStyle(select);
      context.font = style.font;
      return {
        available: select.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
        longestOption: Math.max(...[...select.options].map((option) => context.measureText(option.text).width))
      };
    });
  });
  for (const width of widths) {
    expect(width.longestOption).toBeLessThanOrEqual(width.available);
  }
  expect(state.unexpectedResponses).toEqual([]);
  await page.locator(".groups-tools").screenshot({
    path: "../.omo/evidence/card-top-meta/mobile-filters-long-options.png"
  });
});

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

test("mobile discovery uses the My Page activity row with a left thumbnail and desktop card metadata", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 375 });
  const state = await installResponsiveDiscoveryFixture(page);

  await page.goto("/my");
  const myPageRow = page.locator(".activity-row").first();
  await expect(myPageRow).toBeVisible();
  const myPageGeometry = await myPageRow.evaluate((element) => {
    const thumbnail = element.querySelector(".activity-row__visual");
    if (!(thumbnail instanceof HTMLElement)) throw new Error("Missing My Page thumbnail");
    return {
      rowWidth: element.getBoundingClientRect().width,
      thumbnailWidth: thumbnail.getBoundingClientRect().width
    };
  });
  mkdirSync(resolve(process.cwd(), evidenceDirectory), { recursive: true });
  await myPageRow.screenshot({
    animations: "disabled",
    path: `${evidenceDirectory}/my-activity-row-mobile-375.png`
  });

  await page.goto("/groups");

  const cards = page.locator(".groups-grid .ui-group-card--mobile-activity");
  await expect(cards).toHaveCount(groupNames.length);
  await expect(cards.first().locator(".ui-group-card__visual")).toBeVisible();
  await expect(cards.first().locator(".ui-group-card__image")).toBeVisible();
  const scheduleMeta = cards.first().locator(".ui-group-card__detail-meta");
  await expect(scheduleMeta).toBeVisible();
  await expect(scheduleMeta).toHaveText("주 1회 · 11자리 남음");
  await expect(cards.first().locator(".ui-group-card__activity-members")).toHaveCount(0);

  const metaAlignment = await scheduleMeta.evaluate((element) => {
    const body = element.closest(".ui-group-card__body");
    if (!(body instanceof HTMLElement)) throw new Error("Missing card body");

    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    const bodyBounds = body.getBoundingClientRect();
    const bodyStyle = getComputedStyle(body);
    const textBounds = textRange.getBoundingClientRect();
    return {
      contentRight: bodyBounds.right - Number.parseFloat(bodyStyle.paddingRight),
      textRight: textBounds.right
    };
  });
  expect(Math.abs(metaAlignment.contentRight - metaAlignment.textRight)).toBeLessThanOrEqual(1);

  const mobileBounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })
  );
  expect(countFirstRowColumns(mobileBounds)).toBe(1);

  const mobileCard = await cards.first().evaluate((element) => {
    const bounds = (selector) => {
      const target = element.querySelector(selector);
      if (!(target instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = target.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    };
    const rect = element.getBoundingClientRect();
    return {
      body: bounds(".ui-group-card__body"),
      bottom: rect.bottom,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      visual: bounds(".ui-group-card__visual")
    };
  });
  expect(mobileCard.visual.width).toBeCloseTo(144, 0);
  expect(mobileCard.visual.left - mobileCard.left).toBeLessThanOrEqual(1);
  expect(mobileCard.visual.right).toBeCloseTo(mobileCard.body.left, 0);
  expect(mobileCard.visual.top - mobileCard.top).toBeLessThanOrEqual(1);
  expect(mobileCard.bottom - mobileCard.visual.bottom).toBeLessThanOrEqual(1);
  expect(
    mobileCard.visual.width / mobileCard.width -
      myPageGeometry.thumbnailWidth / myPageGeometry.rowWidth
  ).toBeGreaterThanOrEqual(0.13);

  const longCard = cards.filter({ hasText: "긴 이름도 들어가는 타입스크립트 모임" });
  const longCardTruncation = await longCard.evaluate((element) => {
    const title = element.querySelector(".ui-group-card__title");
    const introduction = element.querySelector(".ui-group-card__intro");
    if (!(title instanceof HTMLElement) || !(introduction instanceof HTMLElement)) {
      throw new Error("Missing long card copy");
    }
    const titleStyle = getComputedStyle(title);
    const introductionStyle = getComputedStyle(introduction);
    return {
      introductionClamped: introduction.scrollHeight > introduction.clientHeight,
      introductionLineClamp: introductionStyle.webkitLineClamp,
      introductionTextOverflow: introductionStyle.textOverflow,
      titleClamped: title.scrollWidth > title.clientWidth,
      titleTextOverflow: titleStyle.textOverflow
    };
  });
  expect(longCardTruncation).toEqual(
    expect.objectContaining({
      introductionClamped: true,
      introductionLineClamp: "2",
      introductionTextOverflow: "ellipsis",
      titleClamped: true,
      titleTextOverflow: "ellipsis"
    })
  );
  await longCard.screenshot({
    animations: "disabled",
    path: `${evidenceDirectory}/groups-activity-row-long-copy-mobile-375.png`
  });
  await cards.first().screenshot({
    animations: "disabled",
    path: `${evidenceDirectory}/groups-activity-row-mobile-375.png`
  });

  await page.setViewportSize({ height: 1000, width: 1024 });
  await expect(cards.first().locator(".ui-group-card__visual")).toBeVisible();
  await expect(scheduleMeta).toBeVisible();
  await expect(scheduleMeta).toHaveText("주 1회 · 11자리 남음");

  const desktopCard = await cards.first().evaluate((element) => {
    const visual = element.querySelector(".ui-group-card__visual");
    const body = element.querySelector(".ui-group-card__body");
    if (!(visual instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error("Missing desktop card regions");
    }
    return {
      bodyTop: body.getBoundingClientRect().top,
      visualBottom: visual.getBoundingClientRect().bottom
    };
  });
  expect(desktopCard.bodyTop).toBeCloseTo(desktopCard.visualBottom, 0);

  const desktopBounds = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })
  );
  expect(countFirstRowColumns(desktopBounds)).toBe(4);
  expect(state.unexpectedResponses).toEqual([]);
});

for (const viewport of [
  { height: 980, label: "tablet-768", width: 768 },
  { height: 1000, label: "desktop-1280", width: 1280 }
]) {
  test(`discovery keeps long group names to one line at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const state = await installResponsiveDiscoveryFixture(page);

    await page.goto("/groups");
    const longTitle = page.locator(".ui-group-card__title", {
      hasText: "긴 이름도 들어가는 타입스크립트 모임"
    });
    const regularTitle = page.locator(".ui-group-card__title").first();
    await expect(longTitle).toBeVisible();

    const metrics = await longTitle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        height: rect.height,
        lineHeight: Number.parseFloat(style.lineHeight),
        overflowX: style.overflowX,
        scrollWidth: element.scrollWidth,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace
      };
    });
    const regularTitleHeight = await regularTitle.evaluate(
      (element) => element.getBoundingClientRect().height
    );

    expect(metrics).toEqual(
      expect.objectContaining({
        overflowX: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      })
    );
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.height).toBeCloseTo(metrics.lineHeight, 0);
    expect(metrics.height).toBeCloseTo(regularTitleHeight, 0);
    expect(state.unexpectedResponses).toEqual([]);

    mkdirSync(resolve(process.cwd(), evidenceDirectory), { recursive: true });
    await page
      .locator(".groups-card-frame", {
        hasText: "긴 이름도 들어가는 타입스크립트 모임"
      })
      .screenshot({
        animations: "disabled",
        path: `${evidenceDirectory}/groups-long-title-${viewport.label}.png`
      });
  });
}

function countFirstRowColumns(cards) {
  const firstTop = cards[0]?.top;
  if (firstTop === undefined) return 0;
  return cards.filter((card) => Math.abs(card.top - firstTop) <= 2).length;
}

function groupCardsByRow(cards) {
  return cards.reduce((rows, card) => {
    const row = rows.find((candidate) => Math.abs(candidate[0].top - card.top) <= 2);
    if (row) {
      row.push(card);
    } else {
      rows.push([card]);
    }
    return rows;
  }, []);
}

function gridGaps(cards) {
  const rows = groupCardsByRow(cards)
    .map((row) => [...row].sort((leftCard, rightCard) => leftCard.left - rightCard.left))
    .sort((topRow, bottomRow) => topRow[0].top - bottomRow[0].top);
  const columnGaps = rows.flatMap((row) =>
    row.slice(1).map((card, index) => card.left - row[index].right)
  );
  const rowGaps = rows
    .slice(1)
    .map((row, index) => row[0].top - Math.max(...rows[index].map((card) => card.bottom)));
  return { columnGaps, rowGaps };
}

function expectedDiscoveryGaps(viewportWidth) {
  if (viewportWidth >= 1024) return { column: 24, row: 40 };
  if (viewportWidth >= 768) return { column: 24, row: 24 };
  return { column: 12, row: 12 };
}

function expectedContentRail(viewportWidth) {
  const containerWidth = Math.min(viewportWidth, 1440);
  const gutter = viewportWidth >= 1024 ? 32 : viewportWidth >= 768 ? 24 : 16;
  const left = (viewportWidth - containerWidth) / 2 + gutter;
  return { left, right: viewportWidth - left };
}

function parseRgbChannel(color, index) {
  const channels = color.match(/\d+(\.\d+)?/g)?.map(Number);
  if (!channels || channels.length < 3) {
    throw new Error(`Unable to parse color: ${color}`);
  }
  return channels[index];
}

function relativeLuminance(color) {
  const components = [0, 1, 2].map((index) => {
    const channel = parseRgbChannel(color, index) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const compactLabelViewports = [
  { height: 900, label: "mobile-360", width: 360 },
  { height: 980, label: "tablet-768", width: 768 },
  { height: 1000, label: "desktop-1280", width: 1280 }
];
const groupTypeColors = {
  동아리: { background: "rgb(236, 233, 251)", text: "rgb(69, 58, 149)" },
  세션: { background: "rgb(253, 240, 218)", text: "rgb(122, 84, 5)" },
  스터디: { background: "rgb(231, 238, 252)", text: "rgb(36, 69, 127)" }
};

async function readBodyLabels(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".groups-grid .ui-group-card__body > .ui-card__meta:first-child")]
      .flatMap((meta) => {
        const category = meta.querySelector("span:first-child");
        const status = meta.querySelector(".ui-badge");
        return [
          { element: category, kind: "category" },
          { element: status, kind: "status" }
        ];
      })
      .filter(({ element }) => element instanceof HTMLElement)
      .map(({ element, kind }) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: Number.parseFloat(style.borderRadius),
          className: element.className,
          color: style.color,
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          height: Math.round(rect.height * 10) / 10,
          kind,
          lineHeight: style.lineHeight,
          paddingLeft: Number.parseFloat(style.paddingLeft),
          paddingRight: Number.parseFloat(style.paddingRight),
          text: element.textContent.trim()
        };
      })
  );
}

for (const viewport of compactLabelViewports) {
  test(`group types and open recruitment use compact accessible badges at ${viewport.label}`, async ({
    page
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const state = await installResponsiveDiscoveryFixture(page);

    await page.goto("/groups");
    await expect(
      page.getByRole("link", { name: /긴 이름도 들어가는 타입스크립트 모임/ })
    ).toBeVisible();

    const labels = await readBodyLabels(page);
    expect(labels).toHaveLength(groupNames.length + 5);
    expect(new Set(labels.map((label) => label.text))).toEqual(
      new Set(["스터디", "동아리", "세션", "모집 중"])
    );
    await expect(page.locator(".groups-grid")).not.toContainText("모집 마감");

    for (const label of labels.filter((item) => item.kind === "category")) {
      const expectedColors = groupTypeColors[label.text];
      expect(label.fontSize).toBe(13);
      expect(label.height).toBeCloseTo(28, 0);
      expect(Number.parseInt(label.fontWeight, 10)).toBe(700);
      expect(label.paddingLeft).toBe(12);
      expect(label.paddingRight).toBe(12);
      expect(label.borderRadius).toBeGreaterThanOrEqual(14);
      expect(label.backgroundColor).toBe(expectedColors.background);
      expect(label.color).toBe(expectedColors.text);
      expect(contrastRatio(label.color, label.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
    for (const label of labels.filter((item) => item.kind === "status")) {
      expect(label.text).toBe("모집 중");
      expect(label.height).toBeCloseTo(28, 0);
      expect(label.fontSize).toBe(13);
      expect(Number.parseInt(label.fontWeight, 10)).toBe(700);
      expect(label.paddingLeft).toBe(12);
      expect(label.paddingRight).toBe(12);
      expect(label.borderRadius).toBeGreaterThanOrEqual(14);
      expect(label.backgroundColor).toBe("rgb(223, 248, 243)");
      expect(label.color).toBe("rgb(8, 115, 111)");
      expect(contrastRatio(label.color, label.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
    expect(state.unexpectedResponses).toEqual([]);
  });
}

async function readDiscoveryLayout(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10;
    const elementBounds = (element, label) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing layout target: ${label}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: round(rect.bottom),
        height: round(rect.height),
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        width: round(rect.width)
      };
    };
    const bounds = (selector) => elementBounds(document.querySelector(selector), selector);
    const textTargets = [
      ...document.querySelectorAll(
        ".groups-grid .ui-badge, .groups-grid .ui-group-card__title, .groups-grid .ui-card__meta"
      )
    ].filter((element) => element instanceof HTMLElement);
    const overflowingText = textTargets
      .filter((element) => {
        const style = getComputedStyle(element);
        const intentionallyTruncated =
          style.textOverflow === "ellipsis" && style.overflowX === "hidden";
        return !intentionallyTruncated && element.scrollWidth - element.clientWidth > 1;
      })
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
        const visual = element.querySelector(".ui-group-card__visual");
        const image = element.querySelector(".ui-group-card__image");
        const body = element.querySelector(".ui-group-card__body");
        const topMeta = element.querySelector(".ui-group-card__body > .ui-card__meta:first-child");
        const category = topMeta?.querySelector("span:first-child");
        const status = topMeta?.querySelector(".ui-badge");
        const title = element.querySelector(".ui-group-card__title");
        if (
          !(visual instanceof HTMLElement) ||
          !(image instanceof HTMLImageElement) ||
          !(body instanceof HTMLElement) ||
          !(topMeta instanceof HTMLElement) ||
          !(category instanceof HTMLElement) ||
          !(title instanceof HTMLElement)
        ) {
          throw new Error("Missing group card image, body, or top metadata");
        }
        const imageStyle = getComputedStyle(image);
        return {
          body: elementBounds(body, "group card body"),
          bodyBackgroundColor: getComputedStyle(body).backgroundColor,
          bodyPaddingTop: Number.parseFloat(getComputedStyle(body).paddingTop),
          bottom: round(rect.bottom),
          category: elementBounds(category, "group card category"),
          image: elementBounds(image, "group card image"),
          imageFadeDisplay: getComputedStyle(visual, "::after").display,
          imageFilter: imageStyle.filter,
          imageMask: imageStyle.maskImage,
          introFontSize: Number.parseFloat(getComputedStyle(element.querySelector(".ui-group-card__intro")).fontSize),
          left: round(rect.left),
          right: round(rect.right),
          status:
            status instanceof HTMLElement
              ? elementBounds(status, "group card recruiting status")
              : null,
          statusFontSize:
            status instanceof HTMLElement ? Number.parseFloat(getComputedStyle(status).fontSize) : null,
          titleFontSize: Number.parseFloat(getComputedStyle(element.querySelector(".ui-group-card__title")).fontSize),
          title: elementBounds(title, "group card title"),
          topMeta: elementBounds(topMeta, "group card top metadata"),
          top: round(rect.top),
          visual: elementBounds(visual, "group card visual"),
          width: round(rect.width)
        };
      }),
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      footerActions: bounds(".app-footer__actions"),
      footerCopy: bounds(".app-footer__copy"),
      filters: [...document.querySelectorAll(".groups-filter__field")].map((field) =>
        elementBounds(field, "discovery filter")
      ),
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
      const expectedGaps = expectedDiscoveryGaps(viewport.width);
      const usesMobileActivityRow = viewport.width < 768;
      expect(layout.cards).toHaveLength(groupNames.length);
      expect(countFirstRowColumns(layout.cards)).toBe(viewport.columns);
      expect(layout.filters).toHaveLength(3);
      for (const filter of layout.filters) {
        expect(filter.top).toBeCloseTo(layout.filters[0].top, 0);
      }
      const gaps = gridGaps(layout.cards);
      for (const columnGap of gaps.columnGaps) {
        expect(columnGap).toBeCloseTo(expectedGaps.column, 0);
      }
      for (const rowGap of gaps.rowGaps) {
        expect(rowGap).toBeCloseTo(expectedGaps.row, 0);
      }
      for (const [index, card] of layout.cards.entries()) {
        const isRecruiting = index % 3 !== 1;
        expect(card.bodyBackgroundColor).toBe("rgb(255, 255, 255)");
        expect(card.bodyPaddingTop).toBe(16);
        expect(card.titleFontSize).toBe(usesMobileActivityRow ? 18 : 20);
        expect(card.introFontSize).toBe(14);
        expect(card.statusFontSize).toBe(isRecruiting ? 13 : null);
        if (usesMobileActivityRow) {
          expect(card.visual.width).toBeCloseTo(144, 0);
          expect(card.visual.left - card.left).toBeLessThanOrEqual(1);
          expect(card.visual.right).toBeCloseTo(card.body.left, 0);
          expect(card.visual.top).toBeCloseTo(card.body.top, 0);
          expect(card.image.width).toBeCloseTo(card.visual.width, 1);
          expect(card.image.height).toBeCloseTo(card.visual.height, 1);
          expect(card.bottom - card.visual.bottom).toBeLessThanOrEqual(1);
        } else {
          expect(card.body.top).toBeCloseTo(card.image.bottom, 0);
          expect(Math.abs(card.image.height - card.image.width * 0.625)).toBeLessThanOrEqual(1);
          expect(card.visual.height).toBeCloseTo(card.image.height, 1);
        }
        expect(card.imageFadeDisplay).toBe("none");
        expect(card.imageFilter).toBe("none");
        expect(card.imageMask).toBe("none");
        expect(card.topMeta.top).toBeCloseTo(card.body.top + card.bodyPaddingTop, 0);
        expect(card.topMeta.left).toBeGreaterThanOrEqual(card.body.left);
        expect(card.topMeta.right).toBeLessThanOrEqual(card.body.right);
        expect(card.topMeta.bottom).toBeLessThanOrEqual(card.title.top);
        expect(card.category.left).toBeCloseTo(card.topMeta.left, 0);
        expect(card.category.top).toBeGreaterThanOrEqual(card.topMeta.top - 1);
        expect(card.category.bottom).toBeLessThanOrEqual(card.topMeta.bottom + 1);
        if (isRecruiting) {
          expect(card.status.right).toBeCloseTo(card.topMeta.right, 0);
          expect(card.status.top).toBeGreaterThanOrEqual(card.topMeta.top - 1);
          expect(card.status.bottom).toBeLessThanOrEqual(card.topMeta.bottom + 1);
          expect(card.category.right).toBeLessThanOrEqual(card.status.left);
        } else {
          expect(card.status).toBeNull();
        }
      }
      expect(layout.documentOverflow).toBe(0);
      expect(layout.grid.left).toBeCloseTo(expectedRail.left, 0);
      expect(layout.grid.right).toBeCloseTo(expectedRail.right, 0);
      expect(layout.hero.left).toBeCloseTo(layout.grid.left, 0);
      expect(layout.hero.right).toBeCloseTo(layout.grid.right, 0);
      expect(layout.heroArt.backgroundSize).toBe("contain");
      expect(layout.heroArt.aspectRatio).toBe("1672 / 941");
      expect(layout.heroArt.backgroundPosition).toBe("50% 50%");
      if (viewport.width < 1024) {
        expect(layout.heroArt.left).toBeCloseTo(0, 0);
        expect(layout.heroArt.right).toBeCloseTo(viewport.width, 0);
      } else {
        expect(layout.heroArt.left).toBeGreaterThanOrEqual(layout.hero.left);
        expect(layout.heroArt.right).toBeLessThanOrEqual(layout.hero.right);
      }
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
