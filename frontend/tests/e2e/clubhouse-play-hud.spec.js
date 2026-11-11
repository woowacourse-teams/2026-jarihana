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
  await page.getByRole("button", { name: "놀러가기" }).click();
  const firstPerson = page.getByRole("button", { name: "1인칭", exact: true });
  const thirdPerson = page.getByRole("button", { name: "3인칭", exact: true });
  await expect(firstPerson).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".room-canvas__reticle")).toBeVisible();
  await thirdPerson.click();
  await expect(thirdPerson).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".room-canvas__reticle")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "시점 도구 펼치기" })).toHaveCount(0);

  await page.getByRole("button", { name: /채팅, 읽지 않은 메시지 1개/ }).click();
  const chat = page.getByRole("dialog", { name: "모임 채팅" });
  const composer = chat.getByRole("textbox", { name: "메시지" });
  await composer.pressSequentially("wasd123er ");
  await expect(composer).toHaveValue("wasd123er ");
  await chat.getByRole("button", { name: "채팅 닫기" }).click();
  await expect(chat).toHaveCount(0);

  const more = page.getByRole("button", { name: "더보기", exact: true });
  for (const label of ["공지사항", "활동 기록"]) {
    await more.click();
    await page.getByRole("button", { name: label, exact: true }).click();
    const news = page.getByRole("dialog", { name: "모임 소식·추억" });
    await expect(news).toBeVisible();
    await news.getByRole("button", { name: "모임 소식·추억 닫기" }).click();
    await expect(news).toHaveCount(0);
  }
  await more.click();
  await page.getByRole("button", { name: "재생목록", exact: true }).click();
  await expect(page.getByRole("region", { name: "다음 곡" })).toBeVisible();
  await page.getByRole("button", { name: "음악 패널 접기" }).click();
  await expect(page.getByRole("region", { name: "다음 곡" })).toHaveCount(0);
  await more.click();
  await page.getByRole("button", { name: "조작 도움말", exact: true }).click();
  const help = page.getByRole("dialog", { name: "조작 도움말" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "닫기" }).click();

  await page.getByRole("button", { name: "꾸미기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "꾸미는 중" })).toBeVisible();
  await expect(firstPerson).toHaveCount(0);
  await expect(more).toHaveCount(0);
  await page.getByRole("navigation", { name: "꾸미기 도구" }).getByRole("button", { name: "가구", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "가구와 시설 검색" })).toBeVisible();
  await page.getByRole("button", { name: "시점 도구 펼치기" }).click();
  const camera = page.getByRole("toolbar", { name: "시점 조절" });
  const lens = camera.getByRole("slider", { name: "광각 시야" });
  await lens.press("End");
  await expect(lens).toHaveValue("100");
  await camera.getByRole("button", { name: "카메라 오른쪽 회전" }).click();
  await camera.getByRole("button", { name: "시점 초기화" }).click();
  await expect(lens).toHaveValue("0");
  await page.getByRole("button", { name: "완료", exact: true }).click();
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
    const firstPerson = page.getByRole("button", { name: "1인칭", exact: true });
    const thirdPerson = page.getByRole("button", { name: "3인칭", exact: true });
    await expect(visit).toBeVisible();
    await expect(rotationGuide).toHaveCount(0);
    await visit.tap();
    await expect(rotationGuide).toBeVisible();
    await expect(rotationGuide.locator("button")).toBeFocused();
    await expect(frontage).toHaveAttribute("inert", "");

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(rotationGuide).toHaveCount(0);
    await expect(firstPerson).toHaveAttribute("aria-pressed", "true", { timeout: 90_000 });
    await thirdPerson.tap();
    await expect(thirdPerson).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rotationGuide).toBeVisible();
    await expect(frontage).toHaveAttribute("inert", "");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(thirdPerson).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    await rotationGuide.getByRole("button", { name: "모임 상세로 돌아가기" }).tap();
    await expect(rotationGuide).toHaveCount(0);
    await expect(visit).toBeVisible();
  });
});
