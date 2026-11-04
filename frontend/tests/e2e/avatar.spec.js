import { expect as baseExpect, test } from "playwright/test";
import { installApiFixture, assertSurface } from "./api-fixture.js";

const editor = page => page.frameLocator('iframe[title="아바타 파츠 편집기"]');
const status = page => page.locator('.avatar-workspace-bar [role="status"]');
// Software WebGL initializes every part template and portrait on each fresh frame.
const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(90000);

test("뒤로가기 캐시 보관·복원 이벤트 뒤에도 입체 미리보기와 파츠 편집을 유지한다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.goto("/my/avatar");
  await expect(editor(page).getByRole("button", { name: "머리 모양: 민머리", exact: true })).toHaveAttribute("aria-pressed", "true");
  const studio = page.frames().find(frame => frame.url().includes("avatar-studio/index.html?mode=editor"));
  await studio.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(editor(page).locator("#preview canvas")).toHaveCount(1);
  await editor(page).getByRole("button", { name: "머리 모양: 단발머리", exact: true }).click();
  await expect(status(page)).toContainText("아직 저장하지 않은");
  expect(state.unexpectedResponses).toEqual([]);
});

test("내 아바타를 생성·저장·재편집하고 삭제하면 기본형으로 돌아간다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/my");
  await page.getByRole("link", { name: "아바타 만들기" }).click();
  await expect(editor(page).getByRole("group", { name: "추천 조합", exact: true }).getByRole("button")).toHaveCount(6);
  await expect(editor(page).getByRole("button", { name: "곱슬머리와 민트", exact: true })).toBeVisible();
  await editor(page).getByRole("button", { name: "머리 모양: 긴 생머리", exact: true }).click();
  await expect(status(page)).toContainText("아직 저장하지 않은");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.avatar.appearance.hair).toBe("flowing");
  await page.reload();
  await page.getByRole("link", { name: "아바타 수정하기", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "머리 모양: 긴 생머리", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });
  await editor(page).getByRole("button", { name: "머리 모양: 단발머리", exact: true }).click();
  await page.getByRole("link", { name: "← 마이페이지" }).click();
  await expect(page.getByRole("dialog", { name: "편집을 마치고 나갈까요?" })).toBeVisible();
  await page.getByRole("button", { name: "계속 머무르기" }).click();
  expect(state.avatar.appearance.hair).toBe("flowing");
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/avatar-editor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "아바타 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제하고 기본형으로" }).click();
  await expect(status(page)).toContainText("기본 모습으로 돌아왔어요");
  await expect(editor(page).getByRole("button", { name: "머리 모양: 민머리", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.avatar.customized).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "내 아바타", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(editor(page).getByRole("button", { name: "머리 모양: 민머리", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });
  await page.getByRole("link", { name: "← 마이페이지" }).click();
  await expect(page.getByRole("link", { name: "아바타 만들기" })).toBeVisible();
  await page.screenshot({ path: "test-results/avatar-mypage-desktop.png", fullPage: true });
  await assertSurface(page, state, { axe: true });
});

test("모바일에서 파츠를 고르고 저장 실패 후 재시도하며 취소 시 저장된 모습을 유지한다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/my/avatar");
  await editor(page).getByRole("button", { name: "가르마와 네이비", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "머리 모양: 가르마", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor(page).getByRole("button", { name: "되돌리기", exact: true }).click();
  await editor(page).getByRole("button", { name: "머리 모양: 단발머리", exact: true }).click();
  await page.route("**/api/members/me/avatar", route => route.request().method() === "PUT"
    ? route.abort("connectionfailed") : route.fallback());
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("선택한 모습은 그대로예요");
  await expect(editor(page).getByRole("button", { name: "머리 모양: 단발머리", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.avatar.customized).toBe(false);
  await page.unroute("**/api/members/me/avatar");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: "아바타 수정하기", exact: true }).click();
  await editor(page).getByRole("tab", { name: "안경·옷" }).click();
  await editor(page).getByRole("button", { name: "옷 색: 라일락", exact: true }).click();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/avatar-editor-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "← 마이페이지" }).click();
  await page.getByRole("button", { name: "저장하지 않고 나가기" }).click();
  await page.getByRole("link", { name: "아바타 수정하기" }).click();
  await editor(page).getByRole("tab", { name: "안경·옷" }).click();
  await expect(editor(page).getByRole("button", { name: "옷 색: 크림", exact: true })).toHaveAttribute("aria-pressed", "true");
  await assertSurface(page, state, { axe: true });
});
