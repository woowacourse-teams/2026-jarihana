import { expect, test } from "playwright/test";
import { group, installApiFixture } from "./api-fixture.js";

const chatRoom = {
  groupId: String(group.id),
  name: group.name,
  type: group.type,
  description: group.description,
  memberCount: group.memberCount,
  status: "ACTIVE",
  latestSequence: "1",
  lastReadSequence: "0",
  unreadCount: 1,
  lastMessage: null,
  updatedAt: "2026-08-21T19:00:00"
};

async function expectHudLabelsToFit(buttons) {
  const overflow = await buttons.locator("span").evaluateAll((labels) => labels
    .filter((label) => {
      const text = label.getBoundingClientRect();
      const button = label.closest("button").getBoundingClientRect();
      return text.left < button.left + 2 || text.right > button.right - 2;
    })
    .map((label) => label.textContent));
  expect(overflow).toEqual([]);
}

test("a leader can walk, open chat and panels, and return to the same view from decorating", async ({ page }) => {
  test.setTimeout(150_000);
  await installApiFixture(page);
  await page.route("**/api/chats?*", (route) => route.fulfill({
    json: { success: true, data: { items: [chatRoom], nextCursor: null, hasNext: false }, error: null }
  }));
  await page.route(`**/api/groups/${group.id}/chat/**`, (route) => {
    const data = route.request().method() === "PUT"
      ? { groupId: chatRoom.groupId, lastReadSequence: "1", latestSequence: "1", unreadCount: 0 }
      : { items: [], hasNext: false, nextCursor: null, latestSequence: "1", lastReadSequence: "0", status: "ACTIVE" };
    return route.fulfill({ json: { success: true, data, error: null } });
  });
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(`/groups/${group.id}`);
  const header = page.locator(".app-header");
  const canvas = page.locator(".group-clubhouse .room-canvas");
  const visit = page.getByRole("button", { name: "놀러가기" });
  await expect(visit).toBeVisible({ timeout: 90_000 });
  const detailHeaderBackground = await header.evaluate((element) => getComputedStyle(element).backgroundColor);
  await visit.click();
  const firstPerson = page.getByRole("button", { name: "1인칭", exact: true });
  const thirdPerson = page.getByRole("button", { name: "3인칭", exact: true });
  const settings = page.getByRole("button", { name: "시점 설정", exact: true });
  const sound = page.getByRole("button", { name: "모임 음악 음소거", exact: true });
  const helpButton = page.getByRole("button", { name: "조작 도움말", exact: true });
  const menu = page.locator('.clubhouse-play-hud [data-ph-capture-attribute-action="group_playbar_toggle"]');
  const back = page.getByRole("button", { name: "웹 상세로 돌아가기" });
  const edit = page.getByRole("button", { name: "꾸미기", exact: true });
  await expect(settings).toBeVisible();
  await expect(header).toHaveCSS("backdrop-filter", /blur\(12px\)/);
  await expect(header).not.toHaveCSS("background-color", detailHeaderBackground);
  const immersiveCanvasBox = await canvas.boundingBox();
  expect(immersiveCanvasBox.y).toBe(0);
  await page.keyboard.press("Escape");
  await expect(header).toHaveCSS("backdrop-filter", "none");
  await expect(header).toHaveCSS("background-color", detailHeaderBackground);
  expect(await canvas.boundingBox()).toEqual(immersiveCanvasBox);
  await page.getByRole("button", { name: "마우스로 둘러보기" }).click();
  await expect(header).toHaveCSS("backdrop-filter", /blur\(12px\)/);
  await page.keyboard.press("Escape");
  await expect(header).toHaveCSS("background-color", detailHeaderBackground);
  await expect(firstPerson).toBeHidden();
  await expect(sound).toBeVisible();
  await expect(helpButton).toBeVisible();
  const initiallyMuted = await sound.getAttribute("aria-pressed");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", initiallyMuted === "true" ? "false" : "true");
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", initiallyMuted);
  const playSettingsBox = await settings.boundingBox();
  const playMenuBox = await menu.boundingBox();
  const backBox = await back.boundingBox();
  const editBox = await edit.boundingBox();
  expect(editBox.y).toBe(backBox.y);
  expect(editBox.height).toBe(backBox.height);
  expect(editBox.x - backBox.x - backBox.width).toBe(8);
  expect(playSettingsBox.width).toBe(playMenuBox.width);
  expect(playSettingsBox.height).toBe(playMenuBox.height);
  await expect(page.getByRole("button", { name: "인사", exact: true })).toHaveCount(0);
  await expect(page.locator(".room-canvas__reticle")).toBeVisible();
  await settings.click();
  await expect(firstPerson).toHaveAttribute("aria-pressed", "true");
  await expectHudLabelsToFit(menu.or(page.locator(".clubhouse-play-hud__view-tools button")));
  await expect(page.locator(".room-canvas__reticle")).toHaveCount(0);
  await thirdPerson.click();
  await expect(thirdPerson).toBeHidden();
  await expect(page.locator(".room-canvas__reticle")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "시점 도구 펼치기" })).toHaveCount(0);

  await page.getByRole("button", { name: /채팅, 읽지 않은 메시지 1개/ }).click();
  const chat = page.getByRole("dialog", { name: "모임 채팅" });
  const composer = chat.getByRole("textbox", { name: "메시지" });
  await composer.pressSequentially("wasd123er ");
  await expect(composer).toHaveValue("wasd123er ");
  await chat.getByRole("button", { name: "채팅 닫기" }).click();
  await expect(chat).toHaveCount(0);

  for (const label of ["공지사항", "활동 기록"]) {
    await menu.click();
    await expectHudLabelsToFit(page.getByRole("navigation", { name: "아지트 메뉴" }).getByRole("button"));
    await page.getByRole("button", { name: label, exact: true }).click();
    const news = page.getByRole("dialog", { name: "모임 소식·추억" });
    await expect(news).toBeVisible();
    await news.getByRole("button", { name: "모임 소식·추억 닫기" }).click();
    await expect(news).toHaveCount(0);
  }
  await menu.click();
  await page.getByRole("button", { name: "재생목록", exact: true }).click();
  await expect(page.getByRole("region", { name: "다음 곡" })).toBeVisible();
  await page.getByRole("button", { name: "음악 패널 접기" }).click();
  await expect(page.getByRole("region", { name: "다음 곡" })).toHaveCount(0);
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await helpButton.click();
  const help = page.getByRole("dialog", { name: "조작 도움말" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "닫기" }).click();
  await expect(helpButton).toBeFocused();

  await edit.click();
  await expect(page.getByRole("button", { name: "완료", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "아지트 꾸미기" })).toHaveCount(0);
  await expect(firstPerson).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  const editorMenu = page.getByRole("button", { name: "메뉴 펼치기" });
  const editorView = page.getByRole("button", { name: "시점 도구 펼치기" });
  expect(await editorMenu.boundingBox()).toEqual(playMenuBox);
  expect(await editorView.boundingBox()).toEqual(playSettingsBox);
  const building = page.getByRole("button", { name: "건물 변경", exact: true });
  const light = page.getByRole("button", { name: "전체 조명", exact: true });
  const exterior = page.getByRole("button", { name: "건물 외관", exact: true });
  for (const button of [editorMenu, editorView, building, light, exterior]) {
    await expect(button).toBeVisible();
    const { width, height } = await button.boundingBox();
    expect({ width, height }).toEqual({ width: backBox.width, height: backBox.height });
  }
  expect((await building.boundingBox()).x).toBe(playMenuBox.x);
  expect((await light.boundingBox()).x).toBe(playSettingsBox.x);
  expect((await exterior.boundingBox()).x).toBe(playSettingsBox.x);
  await exterior.click();
  await expect(exterior).toHaveAttribute("aria-pressed", "true");
  await exterior.click();
  await expect(exterior).toHaveAttribute("aria-pressed", "false");
  await building.click();
  await expect(page.getByRole("complementary", { name: "아지트 템플릿" })).toBeVisible();
  await expect(editorMenu).toHaveAttribute("aria-expanded", "false");
  await building.click();
  await expect(page.getByRole("complementary", { name: "아지트 템플릿" })).toHaveCount(0);
  await editorMenu.click();
  const editorTools = page.getByRole("navigation", { name: "꾸미기 도구" });
  await expectHudLabelsToFit(editorTools.getByRole("button").or(page.locator(".space-studio__edge-button")));
  await expect(editorTools.getByRole("button", { name: "아지트", exact: true })).toHaveCount(0);
  await editorTools.getByRole("button", { name: "내 자리", exact: true }).click();
  await page.getByRole("textbox", { name: "공간 이름" }).fill("꾸미기 테스트 공간");
  const save = page.getByRole("button", { name: "저장", exact: true });
  await expect(save).toHaveAttribute("title", "저장하지 않은 변경");
  for (const name of ["저장", "완료"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect({ width: box.width, height: box.height, y: box.y })
      .toEqual({ width: backBox.width, height: backBox.height, y: backBox.y });
  }
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(save).not.toHaveAttribute("data-unsaved", "true");
  await editorTools.getByRole("button", { name: "가구", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "가구와 시설 검색" })).toBeVisible();
  const dock = page.locator(".space-studio__dock");
  await expect(dock).toHaveCSS("scrollbar-gutter", "stable");
  await expect(dock).toHaveCSS("scrollbar-width", "thin");
  await expect(dock).toHaveCSS("scrollbar-color", /rgba\(0, 0, 0, 0\)$/);
  await editorView.click();
  const viewPanel = page.getByRole("group", { name: "층과 카메라 설정" });
  await expect(viewPanel).toHaveCSS("background-color", "rgb(246, 249, 250)");
  expect(await viewPanel.evaluate((panel) => panel.scrollWidth)).toBe(await viewPanel.evaluate((panel) => panel.clientWidth));
  const camera = viewPanel.getByRole("toolbar", { name: "시점 조절" });
  const lens = camera.getByRole("slider", { name: "광각 시야" });
  await lens.press("End");
  await expect(lens).toHaveValue("100");
  await camera.getByRole("button", { name: "카메라 오른쪽 회전" }).click();
  await camera.getByRole("button", { name: "시점 초기화" }).click();
  await expect(lens).toHaveValue("0");
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await settings.click();
  await expect(thirdPerson).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "꾸미기 도구" })).toHaveCount(0);
  await page.getByRole("button", { name: "웹 상세로 돌아가기" }).click();
  await expect(page.getByRole("button", { name: "놀러가기" })).toBeVisible();
});

test.describe("touch devices", () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test("visiting requires landscape even when the browser cannot lock rotation", async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(() => {
      Object.defineProperty(screen.orientation, "lock", { value: undefined });
    });
    await installApiFixture(page);
    await page.goto(`/groups/${group.id}`);
    const visit = page.getByRole("button", { name: "놀러가기" });
    const rotationGuide = page.getByRole("dialog", { name: "휴대폰을 가로로 돌려 주세요" });
    const frontage = page.locator(".group-clubhouse__frontage");
    const settings = page.getByRole("button", { name: "시점 설정", exact: true });
    const firstPerson = page.getByRole("button", { name: "1인칭", exact: true });
    const thirdPerson = page.getByRole("button", { name: "3인칭", exact: true });
    await expect(visit).toBeVisible({ timeout: 90_000 });
    await expect(rotationGuide).toHaveCount(0);
    await visit.tap();
    await expect(rotationGuide).toBeVisible();
    await expect(rotationGuide.locator("button")).toBeFocused();
    await expect(frontage).toHaveAttribute("inert", "");

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(rotationGuide).toHaveCount(0);
    await settings.tap();
    await expect(firstPerson).toHaveAttribute("aria-pressed", "true", { timeout: 90_000 });
    await thirdPerson.tap();
    await expect(thirdPerson).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rotationGuide).toBeVisible();
    await expect(frontage).toHaveAttribute("inert", "");
    await page.setViewportSize({ width: 844, height: 390 });
    await settings.tap();
    await expect(thirdPerson).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    await rotationGuide.getByRole("button", { name: "모임 상세로 돌아가기" }).tap();
    await expect(rotationGuide).toHaveCount(0);
    await expect(visit).toBeVisible();
  });
});
