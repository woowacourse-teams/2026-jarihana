import { expect, test } from "playwright/test";

import { assertSurface, installApiFixture, prepareVisualCapture } from "./api-fixture.js";

const evidenceDirectory = "../.omo/evidence/date-range-picker";
const viewports = [
  { height: 900, label: "mobile-375", width: 375 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 1044, label: "wide-tablet-962", width: 962 },
  { height: 1000, label: "desktop-1280", width: 1280 }
];

async function captureStep(page, viewportLabel, stepLabel) {
  await prepareVisualCapture(page);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `${evidenceDirectory}/${viewportLabel}-${stepLabel}.png`,
    style: ".app-scroll-top { visibility: hidden !important; }"
  });
}

async function assertWizardLayout(page, { desktop }) {
  const metrics = await page.evaluate(() => {
    const formPanel = document.querySelector(".manage-recruitment-focus");
    const previewPanel = document.querySelector(".manage-recruitment-public-status");
    const step = document.querySelector(".manage-create-step");
    const question = document.querySelector(".manage-create-step__heading");
    if (!formPanel || !previewPanel || !step || !question) return null;
    const formBounds = formPanel.getBoundingClientRect();
    const previewBounds = previewPanel.getBoundingClientRect();
    const stepBounds = step.getBoundingClientRect();
    const questionBounds = question.getBoundingClientRect();
    return {
      centerDelta: Math.abs(
        stepBounds.left + stepBounds.width / 2 -
          (formBounds.left + formBounds.width / 2)
      ),
      heightDelta: Math.abs(formBounds.height - previewBounds.height),
      previewBelowForm: previewBounds.top >= formBounds.bottom,
      questionTextAlign: getComputedStyle(question).textAlign,
      stepWidthDelta: Math.abs(stepBounds.width - questionBounds.width)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics.centerDelta).toBeLessThanOrEqual(1);
  expect(metrics.stepWidthDelta).toBeLessThanOrEqual(1);
  expect(["left", "start"]).toContain(metrics.questionTextAlign);
  if (desktop) {
    expect(metrics.heightDelta).toBeLessThanOrEqual(1);
    expect(metrics.previewBelowForm).toBe(false);
  } else {
    expect(metrics.previewBelowForm).toBe(true);
  }
}

async function assertQuestionAndFieldAlignment(page, fieldSelector) {
  const leftDelta = await page.evaluate((selector) => {
    const heading = document.querySelector(".manage-create-step__heading");
    const field = document.querySelector(selector);
    if (!heading || !field) return null;

    return Math.abs(
      heading.getBoundingClientRect().left - field.getBoundingClientRect().left
    );
  }, fieldSelector);

  expect(leftDelta).not.toBeNull();
  expect(leftDelta).toBeLessThanOrEqual(1);
}

async function assertControlRailWidth(page, label, railRem) {
  const expectedWidth = await page.locator(".manage-create-wizard__steps")
    .evaluate((element, rem) => Math.min(
      element.getBoundingClientRect().width,
      rem * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    ), railRem);
  await expect(page.getByLabel(label)).toHaveCSS("width", `${expectedWidth}px`);
}

async function assertSelectFrameMatchesControl(page) {
  const widthDelta = await page.evaluate(() => {
    const frame = document.querySelector(".manage-create-step--joinMethod .ui-select");
    const control = document.querySelector(
      ".manage-create-step--joinMethod .ui-select__control"
    );
    if (!frame || !control) return null;

    return Math.abs(
      frame.getBoundingClientRect().width - control.getBoundingClientRect().width
    );
  });

  expect(widthDelta).not.toBeNull();
  expect(widthDelta).toBeLessThanOrEqual(1);
}

async function assertPeriodFieldAlignment(page) {
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector(".manage-create-step__heading");
    const endpoints = document.querySelector(".ui-date-range__endpoints");
    const controls = [
      ...document.querySelectorAll(
        ".ui-date-range__endpoint-button, .ui-date-range__static-control"
      )
    ];
    if (!heading || !endpoints || controls.length !== 4) return null;

    const headingBounds = heading.getBoundingClientRect();
    const endpointBounds = endpoints.getBoundingClientRect();
    const controlBounds = controls.map((control) => control.getBoundingClientRect());

    return {
      controlHeights: controlBounds.map((bounds) => bounds.height),
      controlWidths: controlBounds.map((bounds) => bounds.width),
      leftDelta: Math.abs(headingBounds.left - endpointBounds.left),
      rightDelta: Math.abs(headingBounds.right - endpointBounds.right)
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.leftDelta).toBeLessThanOrEqual(1);
  expect(geometry.rightDelta).toBeLessThanOrEqual(1);
  expect(
    Math.max(...geometry.controlWidths) - Math.min(...geometry.controlWidths)
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...geometry.controlHeights) - Math.min(...geometry.controlHeights)
  ).toBeLessThanOrEqual(1);
}

async function assertPopoverVisibleWithinContent(page, selector) {
  const popover = page.locator(selector);
  await popover.scrollIntoViewIfNeeded();
  const geometry = await popover.evaluate((element) => {
    const content = document.querySelector("#main-content").getBoundingClientRect();
    const obscuredControls = [...element.querySelectorAll("button:not(:disabled)")]
      .filter((control) => {
        const bounds = control.getBoundingClientRect();
        return !control.contains(document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        ));
      })
      .map((control) => control.getAttribute("aria-label") || control.textContent);
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      contentBottom: content.bottom,
      contentTop: content.top,
      left: bounds.left,
      obscuredControls,
      right: bounds.right,
      top: bounds.top,
      viewportWidth: window.innerWidth
    };
  });

  expect(geometry.top).toBeGreaterThanOrEqual(geometry.contentTop);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.contentBottom);
  expect(geometry.obscuredControls).toEqual([]);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function assertTimeOptionListsVisible(page, timeLabel = "모집 마감 시간") {
  for (const [trigger, label] of [
    ["오전 오후", "오전 오후 선택"],
    ["시 목록 열기", "시 선택"],
    ["분 목록 열기", "분 선택"]
  ]) {
    await page.getByRole("button", { name: trigger, exact: true }).click();
    const list = page.getByRole("listbox", { name: label, exact: true });
    const geometry = await list.evaluate((element) => {
      const container = element.closest(".ui-dialog, #main-content");
      const bounds = element.getBoundingClientRect();
      const frame = container.getBoundingClientRect();
      const headerBottom = container.id === "main-content"
        ? document.querySelector(".app-header").getBoundingClientRect().bottom
        : 0;
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        visibleBottom: Math.min(window.innerHeight, frame.top + container.clientTop + container.clientHeight),
        visibleTop: Math.max(headerBottom, frame.top + container.clientTop, 0),
        viewportWidth: window.innerWidth
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.visibleTop - 1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.visibleBottom + 1);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);

    await page.keyboard.press("End");
    const lastOption = list.locator('[role="option"]:not(:disabled)').last();
    await expect(lastOption).toBeFocused();
    await lastOption.click({ trial: true });
    await page.keyboard.press("Home");
    const firstOption = list.locator('[role="option"]:not(:disabled)').first();
    await expect(firstOption).toBeFocused();
    await firstOption.click({ trial: true });
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(page.getByRole("dialog", { name: timeLabel, exact: true })).toBeVisible();
  }
}

for (const viewport of viewports) {
  test(`recruitment period works at ${viewport.label}`, async ({ page }) => {
    const browserFailures = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserFailures.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserFailures.push(`pageerror: ${error.message}`));

    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-09-02T03:34:45Z"));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const state = await installApiFixture(page, { recruitments: [] });

    await page.goto("/groups/10/manage/recruitments");
    await page.getByRole("button", { name: "새 모집 만들기" }).click();
    await expect(page.getByRole("heading", { name: "새 모집 생성" })).toBeVisible();
    await expect(page.locator(".manage-create-step")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "몇 명까지 모집할까요?" })).toBeVisible();
    await expect(page.locator(".manage-create-wizard__status strong")).toHaveText("모집 인원");
    await expect(page.locator(".manage-create-step__heading > span")).toHaveCount(0);
    await expect(page.locator(".manage-create-step--capacity .manage-create-step__heading > p"))
      .toHaveCount(0);
    await expect(page.getByLabel("모집 인원")).toHaveValue("10");
    await assertControlRailWidth(page, "모집 인원", 18);
    await expect(page.getByRole("heading", { name: "공개 상태 미리보기" })).toBeVisible();
    await assertWizardLayout(page, { desktop: viewport.width >= 1024 });
    await assertQuestionAndFieldAlignment(page, ".manage-field--underline");
    await captureStep(page, viewport.label, "step-1");

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.locator(".manage-create-step")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "신청은 어떻게 승인할까요?" })).toBeVisible();
    await expect(page.locator(".manage-create-wizard__status strong")).toHaveText("승인 방식");
    await expect(page.getByLabel("모집 인원")).toHaveCount(0);
    await expect(page.getByLabel("승인 방식")).toHaveValue("AUTO");
    await assertControlRailWidth(page, "승인 방식", 20);
    await assertWizardLayout(page, { desktop: viewport.width >= 1024 });
    await assertQuestionAndFieldAlignment(page, ".manage-create-step > .ui-field");
    await assertSelectFrameMatchesControl(page);
    await captureStep(page, viewport.label, "step-2");

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.locator(".manage-create-step")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "모집 기간을 정해 주세요." })).toBeVisible();
    await expect(page.locator(".manage-create-wizard__status strong")).toHaveText("모집 기간");
    await expect(page.getByLabel("승인 방식")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "모집 시작일 선택" })).toContainText(
      "2026. 9. 2."
    );
    await expect(page.getByRole("button", { name: "모집 시작 시간 선택" }))
      .toHaveText("오후 12:34");
    await expect(page.getByRole("button", { name: "상시 모집" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await assertWizardLayout(page, { desktop: viewport.width >= 1024 });
    await assertPeriodFieldAlignment(page);
    await captureStep(page, viewport.label, "step-3");

    const endEndpoint = page.getByRole("button", { name: "모집 마감일 선택" });
    await page.getByRole("button", { name: "3일 뒤" }).click();
    await expect(endEndpoint).toContainText("2026. 9. 5.");
    await page.getByRole("button", { name: "2주 뒤" }).click();
    await expect(endEndpoint).toContainText("2026. 9. 16.");
    await page.getByRole("button", { name: "상시 모집" }).click();
    await expect(endEndpoint).toContainText("상시 모집");
    await expect(page.getByText("없음")).toBeVisible();
    await page.getByRole("button", { name: "지금 시작" }).click();
    await page.getByRole("button", { name: "1주 뒤" }).click();
    await expect(endEndpoint).toContainText("2026. 9. 9.");
    await assertPeriodFieldAlignment(page);

    if (viewport.label === "desktop-1280") {
      await prepareVisualCapture(page);
      await page.screenshot({
        animations: "disabled",
        path: `${evidenceDirectory}/${viewport.label}-rest.png`
      });
    }

    await endEndpoint.click();
    await expect(page.getByRole("region", { name: "모집 마감일 달력" })).toBeVisible();
    await assertPopoverVisibleWithinContent(page, ".ui-date-range__calendar-popover");
    if (viewport.width >= 1024) {
      const calendar = await page.locator(".ui-date-range__calendar-popover").boundingBox();
      const trigger = await endEndpoint.boundingBox();
      expect(calendar.y + calendar.height).toBeLessThan(trigger.y);
    }
    await expect(page.getByRole("button", { name: "2026년 9월 1일" })).toBeDisabled();
    await page.getByRole("button", { name: "다음 달" }).click();
    await assertPopoverVisibleWithinContent(page, ".ui-date-range__calendar-popover");
    await page.getByRole("button", { name: "이전 달" }).click();
    await page.getByRole("button", { name: "2026년 9월 30일" }).click({ trial: true });

    if (viewport.label === "desktop-1280") {
      const calendar = page.getByRole("region", { name: "모집 마감일 달력" });
      await calendar.evaluate((element) => {
        const animation = element.getAnimations()[0];
        if (!animation) return;
        const duration = Number(animation.effect?.getTiming().duration) || 0;
        animation.pause();
        animation.currentTime = duration / 2;
      });
      await calendar.screenshot({
        animations: "allow",
        path: `${evidenceDirectory}/${viewport.label}-mid.png`
      });
      await calendar.evaluate(async (element) => {
        const animations = element.getAnimations();
        animations.forEach((animation) => animation.play());
        await Promise.all(animations.map((animation) => animation.finished));
      });
      await prepareVisualCapture(page);
      await calendar.screenshot({
        animations: "allow",
        path: `${evidenceDirectory}/${viewport.label}-settled.png`
      });
    }

    const calendarGeometry = await page.locator(".ui-date-range__day:not(:disabled)").first()
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { height: bounds.height, width: bounds.width };
      });
    expect(Math.abs(calendarGeometry.width - calendarGeometry.height)).toBeLessThanOrEqual(1);

    const startDay = page.getByRole("button", { name: "2026년 9월 2일" });
    await startDay.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "2026년 9월 3일" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "모집 마감일 달력" })).toBeHidden();
    await expect(endEndpoint).toBeFocused();
    await endEndpoint.click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const animationDuration = await page
      .getByRole("region", { name: "모집 마감일 달력" })
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.00001);

    await assertSurface(page, state, { axe: viewport.label === "desktop-1280" });
    expect(browserFailures).toEqual([]);
    await prepareVisualCapture(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: `${evidenceDirectory}/${viewport.label}-full.png`
    });
    await page.locator(".ui-date-range").screenshot({
      animations: "disabled",
      path: `${evidenceDirectory}/${viewport.label}-component.png`,
      style: ".app-scroll-top { visibility: hidden !important; }"
    });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "모집 마감일 달력" })).toBeHidden();
    await expect(endEndpoint).toBeFocused();
    await page.getByRole("button", { name: "모집 마감 시간 선택" }).click();
    await assertPopoverVisibleWithinContent(page, ".ui-date-range__time-popover");
    await assertTimeOptionListsVisible(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "모집 시작 시간 선택" }).click();
    await assertTimeOptionListsVisible(page, "모집 시작 시간");
    await page.keyboard.press("Escape");
    await expect(page.locator("#main-content")).toHaveCSS("overflow", "clip");
    await page.getByRole("button", { name: "모집 생성" }).click();
    const request = state.requests.find(
      (entry) => entry.method === "POST" && entry.path === "/groups/10/recruitments"
    );
    expect(request?.postData).toEqual({
      capacity: 10,
      endsAt: "2026-09-09T12:34",
      joinMethod: "AUTO",
      startsAt: "2026-09-02T12:34"
    });
  });
}

for (const width of [375, 1280]) {
  test(`recruitment edit time options remain visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await installApiFixture(page);
    await page.goto("/groups/10/manage/recruitments");
    await page.getByRole("button", { name: "모집 수정하기" }).click();
    await page.getByRole("button", { name: "모집 마감 시간 선택" }).click();
    await assertTimeOptionListsVisible(page);
  });
}

test("time options fit between the sticky header and a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await page.clock.setFixedTime(new Date("2026-09-02T03:34:00Z"));
  await installApiFixture(page, { recruitments: [] });
  await page.goto("/groups/10/manage/recruitments");
  await page.getByRole("button", { name: "새 모집 만들기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "1주 뒤" }).click();
  await page.getByRole("button", { name: "모집 마감 시간 선택" }).click();
  await assertTimeOptionListsVisible(page);
});
