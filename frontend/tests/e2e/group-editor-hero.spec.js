import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

async function heroAppearance(page) {
  const hero = page.locator(".group-profile");
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.locator("img.group-profile__image").evaluate(
    (image) => image.complete && image.naturalWidth > 0
  )).toBe(true);
  return hero.evaluate((element) => {
    const image = getComputedStyle(element.querySelector(".group-profile__image"));
    const art = getComputedStyle(element.querySelector(".group-profile__art"));
    const shade = element.querySelector(".group-profile__shade");
    return {
      background: art.background,
      overlay: getComputedStyle(shade || element, shade ? null : "::after").backgroundImage,
      filter: image.filter,
      opacity: image.opacity,
      fit: image.objectFit,
      position: image.objectPosition,
      padding: image.padding,
      transform: image.transform
    };
  });
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
  )).toBe(true);
}

for (const width of [360, 390, 767, 768, 1024, 1440]) {
  test(`create and edit share detail image effects and editor width at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installApiFixture(page);

    await page.goto("/groups/10");
    const detail = await heroAppearance(page);
    const detailBounds = await page.locator(".group-profile").boundingBox();
    const detailTabsBounds = await page.locator(".group-detail-tabs").boundingBox();
    await page.screenshot({ path: testInfo.outputPath("detail.png"), fullPage: true });

    await page.goto("/groups/new");
    for (const type of ["CLUB", "SESSION", "STUDY"]) {
      await page.getByLabel("모임 종류").selectOption(type);
      await expect(page.locator(".group-profile__image")).toHaveAttribute(
        "src", `/assets/default-group-${type.toLowerCase()}-3d.png`
      );
    }
    await page.getByLabel("모임 이름", { exact: true }).fill(group.name);
    await page.getByLabel("한 줄 소개", { exact: true }).fill(group.introduction);
    expect(await heroAppearance(page)).toEqual(detail);
    const createBounds = await page.locator(".group-profile").boundingBox();
    if (width < 768) {
      expect(createBounds.x).toBeCloseTo(0, 1);
      expect(createBounds.width).toBeCloseTo(width, 1);
      expect(createBounds.x).toBeCloseTo(detailBounds.x, 1);
      expect(createBounds.width).toBeCloseTo(detailBounds.width, 1);
      const tabsBounds = await page.locator(".group-detail-tabs").boundingBox();
      expect(tabsBounds.x).toBeCloseTo(detailTabsBounds.x, 1);
      expect(tabsBounds.width).toBeCloseTo(detailTabsBounds.width, 1);
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("create.png"), fullPage: true });
    expect((await new AxeBuilder({ page }).include(".group-profile").analyze()).violations).toEqual([]);

    await page.goto("/groups/10/manage");
    await expect(page.getByLabel("모임 이름", { exact: true })).toHaveValue(group.name);
    await expect(page.locator(".group-profile__image")).toHaveAttribute(
      "src", "/assets/default-group-study-3d.png"
    );
    expect(await heroAppearance(page)).toEqual(detail);
    const editBounds = await page.locator(".group-profile").boundingBox();
    expect(editBounds.x).toBeCloseTo(createBounds.x, 1);
    expect(editBounds.width).toBeCloseTo(createBounds.width, 1);
    if (width < 768) {
      const tabsBounds = await page.locator(".group-detail-tabs").boundingBox();
      expect(tabsBounds.x).toBeCloseTo(detailTabsBounds.x, 1);
      expect(tabsBounds.width).toBeCloseTo(detailTabsBounds.width, 1);
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("edit.png"), fullPage: true });
    expect((await new AxeBuilder({ page }).include(".group-profile").analyze()).violations).toEqual([]);
  });
}

test("uploaded photos retain the detail effect through type changes and editing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installApiFixture(page);
  const imagePath = "/assets/default-group-club-3d.png";
  const photo = await (await page.request.get(imagePath)).body();
  await page.route("**/api/groups/10", (route) => route.fulfill({
    json: { success: true, error: null, data: {
      ...group, representativeImageUrl: imagePath, representativeImageKey: "groups/upload.png"
    } }
  }));
  await page.route("**/api/image-uploads", (route) => route.fulfill({
    json: { success: true, error: null, data: {
      id: "00000000-0000-4000-8000-000000000001",
      imageKey: "groups/upload.png",
      uploadUrl: new URL("/test-upload", page.url()).href,
      publicImageUrl: imagePath,
      expiresAt: "2099-01-01T00:00:00Z"
    } }
  }));
  await page.route("**/test-upload", (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/groups/10");
  const detail = await heroAppearance(page);
  await page.goto("/groups/new");
  await page.getByLabel("대표 이미지 파일").setInputFiles({
    name: "photo.png", mimeType: "image/png", buffer: photo
  });
  const image = page.locator(".group-profile__image");
  await expect(image).toHaveAttribute("src", /^blob:/);
  const uploadedSource = await image.getAttribute("src");
  await page.getByLabel("모임 종류").selectOption("CLUB");
  await expect(image).toHaveAttribute("src", uploadedSource);
  await expect(page.locator(".group-profile")).not.toHaveClass(/group-profile--default-image/);
  expect(await heroAppearance(page)).toEqual(detail);
  await page.screenshot({ path: testInfo.outputPath("create-upload.png"), fullPage: true });

  await page.goto("/groups/10/manage");
  await expect(page.getByLabel("모임 이름", { exact: true })).toHaveValue(group.name);
  await expect(image).toHaveAttribute("src", imagePath);
  expect(await heroAppearance(page)).toEqual(detail);
  await page.screenshot({ path: testInfo.outputPath("edit-upload.png"), fullPage: true });
});
