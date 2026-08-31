import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const heroViewports = [
  { artMinWidth: 375, fontSize: 40, fullBleed: true, height: 900, label: "mobile-375", width: 375 },
  { artMinWidth: 768, fontSize: 56, fullBleed: true, height: 980, label: "tablet-768", width: 768 },
  { artMinWidth: 434, fontSize: 56, fullBleed: false, height: 1000, label: "desktop-1024", width: 1024 },
  { artMinWidth: 690, fontSize: 56, fullBleed: false, height: 1000, label: "desktop-1280", width: 1280 },
  { artMinWidth: 835, fontSize: 56, fullBleed: false, height: 1000, label: "desktop-1440", width: 1440 },
  { artMinWidth: 835, fontSize: 56, fullBleed: false, height: 1080, label: "desktop-1920", width: 1920 }
];

const zeroLetterSpacingSelectors = [
  { path: "/groups", selectors: [":root", ".app-header__brand", ".app-footer__brand"] },
  {
    path: "/my",
    selectors: [
      ".account-heading h1",
      ".account-eyebrow",
      ".profile-card h2",
      ".activity-tag",
      ".activity-row h3"
    ]
  }
];

function expectZeroLetterSpacing(value) {
  expect(["normal", "0px"]).toContain(value);
}

for (const viewport of heroViewports) {
  test(`home hero headline and art stay readable at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const state = await installApiFixture(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "크루와 함께할 자리를 찾아보세요" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10;
      const rectOf = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) throw new Error(`Missing selector: ${selector}`);
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
      const titleStyle = getComputedStyle(document.querySelector(".groups-hero h1"));
      const artStyle = getComputedStyle(document.querySelector(".groups-hero__art"));
      const art = rectOf(".groups-hero__art");
      const hero = rectOf(".groups-hero");
      const title = rectOf(".groups-hero h1");
      return {
        art,
        artAspectRatio: artStyle.aspectRatio,
        artBackgroundImage: artStyle.backgroundImage,
        artBackgroundPosition: artStyle.backgroundPosition,
        artBackgroundSize: artStyle.backgroundSize,
        copy: rectOf(".groups-hero__copy"),
        cta: rectOf(".groups-hero__scroll-button"),
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        hero,
        paragraph: rectOf(".groups-hero__copy > p:last-child"),
        title,
        titleFontSize: Number.parseFloat(titleStyle.fontSize),
        titleLetterSpacing: titleStyle.letterSpacing,
        titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
        titleOuterGutter: title.left - hero.left,
        titleToArtGap: art.left - title.right
      };
    });
    const overlaps = (left, right) =>
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;

    expect(layout.titleFontSize).toBe(viewport.fontSize);
    expect(layout.titleLineHeight / layout.titleFontSize).toBeCloseTo(1.22, 1);
    expectZeroLetterSpacing(layout.titleLetterSpacing);
    expect(layout.artBackgroundImage).not.toBe("none");
    expect(layout.artBackgroundSize).toBe("contain");
    expect(layout.artBackgroundPosition).toBe("50% 50%");
    expect(layout.artAspectRatio).toBe("1672 / 941");
    expect(layout.art.width / layout.art.height).toBeCloseTo(1672 / 941, 1);
    expect(layout.art.width).toBeGreaterThanOrEqual(viewport.artMinWidth);
    if (viewport.fullBleed) {
      expect(layout.art.left).toBeCloseTo(0, 0);
      expect(layout.art.right).toBeCloseTo(viewport.width, 0);
      expect((layout.title.left + layout.title.right) / 2).toBeCloseTo(viewport.width / 2, 0);
    } else {
      expect(layout.art.left).toBeGreaterThanOrEqual(layout.hero.left);
      expect(layout.art.right).toBeLessThanOrEqual(layout.hero.right);
      expect(layout.titleOuterGutter).toBeGreaterThanOrEqual(64);
      expect(layout.titleToArtGap).toBeCloseTo(32, 0);
      expect(layout.paragraph.left).toBeCloseTo(layout.title.left, 0);
    }
    expect(layout.documentOverflow).toBe(0);
    expect(overlaps(layout.copy, layout.art)).toBe(false);
    expect(overlaps(layout.cta, layout.title)).toBe(false);
    expect(overlaps(layout.cta, layout.paragraph)).toBe(false);
    expect(overlaps(layout.cta, layout.art)).toBe(false);
    expect(state.unexpectedResponses).toEqual([]);
  });
}

test("global brand and account text keep readable letter spacing", async ({ page }) => {
  const state = await installApiFixture(page);

  for (const route of zeroLetterSpacingSelectors) {
    await page.goto(route.path);
    for (const selector of route.selectors) {
      await expect(page.locator(selector).first()).toBeVisible();
    }
    const spacing = await page.evaluate((selectors) =>
      selectors.map((selector) => ({
        selector,
        value: getComputedStyle(document.querySelector(selector)).letterSpacing
      })), route.selectors);
    for (const item of spacing) {
      expectZeroLetterSpacing(item.value);
    }
  }
  expect(state.unexpectedResponses).toEqual([]);
});
