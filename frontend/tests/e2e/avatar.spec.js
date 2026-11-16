import { existsSync } from "node:fs";
import { AVATAR_BASIC_APPEARANCE } from "../../public/sparring-arena/src/avatar-appearance.js";
import { expect as baseExpect, test } from "playwright/test";
import { installApiFixture, assertSurface } from "./api-fixture.js";

const editor = page => page.frameLocator('iframe[title="아바타 파츠 편집기"]');
const status = page => page.locator('.avatar-workspace-bar [role="status"]');
// Software WebGL initializes every part template and portrait on each fresh frame.
const expect = baseExpect.configure({ timeout: 20000 });
test.setTimeout(90000);

test("편집 중 로그인 계정이 바뀌면 이전 초안을 저장하지 않고 새 계정의 외형을 불러온다", async ({ page }) => {
  const state = await installApiFixture(page);
  await page.goto("/my/avatar");
  await editor(page).getByRole("button", { name: "머리 모양: 긴 웨이브", exact: true }).click();
  await expect(status(page)).toContainText("아직 저장하지 않은");
  const originalMemberId = state.activeMember.id;
  // The fixture now responds as a different authenticated member, like a cookie change in another tab.
  state.activeMember = { ...state.activeMember, id: 2, crewName: "하나" };
  const newAccountAvatar = { customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "bob" } };
  state.avatar = newAccountAvatar;

  await page.getByRole("button", { name: "저장하기", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText("로그인 계정이 바뀌었어요");
  await expect(editor(page).getByRole("button", { name: "머리 모양: 단발머리", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText("저장된 아바타");
  const saves = state.requests.filter(({ method, path }) => method === "PUT" && path === "/members/me/avatar");
  expect(saves).toHaveLength(1);
  expect(saves[0].postData.expectedMemberId).toBe(originalMemberId);
  expect(state.avatar).toEqual(newAccountAvatar);
  expect(state.unexpectedResponses).toEqual(["409 /api/members/me/avatar"]);
});

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
  await editor(page).getByRole("button", { name: "얼굴 확대", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "얼굴 확대", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor(page).getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "전체 보기", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  await editor(page).getByRole("button", { name: "머리 모양: 긴 웨이브", exact: true }).click();
  await editor(page).getByRole("tab", { name: "신발", exact: true }).click();
  await editor(page).getByRole("button", { name: "신발 모양: 하이탑", exact: true }).click();
  await editor(page).getByRole("button", { name: "신발 색: 검정", exact: true }).click();
  await editor(page).getByRole("tab", { name: "모자", exact: true }).click();
  await editor(page).getByRole("button", { name: "모자 모양: 캡", exact: true }).click();
  await editor(page).getByRole("button", { name: "모자 색: 민트", exact: true }).click();
  await editor(page).getByRole("tab", { name: "안경", exact: true }).click();
  await editor(page).getByRole("button", { name: "안경: 선글라스", exact: true }).click();
  await expect(status(page)).toContainText("아직 저장하지 않은");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.avatar.appearance.hair).toBe("flowing");
  expect(state.avatar.appearance.shoes).toBe("highTop");
  expect(state.avatar.appearance.shoeColor).toBe("ink");
  expect(state.avatar.appearance.hat).toBe("cap");
  expect(state.avatar.appearance.hatColor).toBe("mint");
  expect(state.avatar.appearance.glasses).toBe("sunglasses");
  await page.reload();
  await page.getByRole("link", { name: "아바타 수정하기", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "머리 모양: 긴 웨이브", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });
  await editor(page).getByRole("tab", { name: "신발", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "신발 모양: 하이탑", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page).getByRole("button", { name: "신발 색: 검정", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/avatar-shoes-desktop.png", fullPage: true });
  await editor(page).getByRole("tab", { name: "안경", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "안경: 선글라스", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor(page).getByRole("tab", { name: "모자", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "모자 모양: 캡", exact: true })).toHaveAttribute("aria-pressed", "true");
  const hatPreviews = [];
  for (const [name, key] of [['캡', 'cap'], ['버킷햇', 'bucket'], ['비니', 'beanie'], ['베레모', 'beret']]) {
    await editor(page).getByRole("button", { name: `모자 모양: ${name}`, exact: true }).click();
    // A preview above the scrolled selection panel resumes rendering when visible.
    await editor(page).locator('#preview').scrollIntoViewIfNeeded();
    await editor(page).locator('#preview').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    hatPreviews.push((await editor(page).locator('#preview').screenshot()).toString('base64'));
    await editor(page).locator('.studio-workbench').screenshot({ path: `test-results/avatar-hat-${key}.png` });
  }
  expect(new Set(hatPreviews).size).toBe(4);
  await editor(page).getByRole("button", { name: "모자 모양: 캡", exact: true }).click();
  await editor(page).getByRole("tab", { name: "머리", exact: true }).click();
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
  expect(state.avatar.appearance.shoes).toBe("sneakers");
  expect(state.avatar.appearance.shoeColor).toBe("white");
  expect(state.avatar.appearance.hat).toBe("none");
  expect(state.avatar.appearance.glasses).toBe("none");
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
  await editor(page).getByRole("tab", { name: "신발", exact: true }).click();
  await editor(page).getByRole("button", { name: "신발 모양: 슬립온", exact: true }).click();
  await editor(page).getByRole("button", { name: "신발 색: 코랄", exact: true }).click();
  await editor(page).getByRole("tab", { name: "모자", exact: true }).click();
  await editor(page).getByRole("button", { name: "모자 모양: 비니", exact: true }).click();
  await editor(page).getByRole("button", { name: "모자 색: 코랄", exact: true }).click();
  await page.route("**/api/members/me/avatar", route => route.request().method() === "PUT"
    ? route.abort("connectionfailed") : route.fallback());
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("선택한 모습은 그대로예요");
  await expect(editor(page).getByRole("button", { name: "모자 모양: 비니", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page).getByRole("button", { name: "모자 색: 코랄", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.avatar.customized).toBe(false);
  await page.unroute("**/api/members/me/avatar");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: "아바타 수정하기", exact: true }).click();
  await editor(page).getByRole("tab", { name: "모자", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "모자 모양: 비니", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator('.avatar-editor-page').screenshot({ path: "test-results/avatar-hat-mobile.png" });
  await editor(page).getByRole("tab", { name: "신발", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "신발 모양: 슬립온", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page).getByRole("button", { name: "신발 색: 코랄", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/avatar-shoes-mobile.png", fullPage: true });
  await editor(page).getByRole("tab", { name: "옷", exact: true }).click();
  await editor(page).getByRole("button", { name: "옷 색: 라일락", exact: true }).click();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/avatar-editor-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "← 마이페이지" }).click();
  await page.getByRole("button", { name: "저장하지 않고 나가기" }).click();
  await page.getByRole("link", { name: "아바타 수정하기" }).click();
  await editor(page).getByRole("tab", { name: "옷", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "옷 색: 크림", exact: true })).toHaveAttribute("aria-pressed", "true");
  await assertSurface(page, state, { axe: true });
});

test("가방과 소지품을 회전해 살펴보고 저장·재편집하며 삭제하면 빈손으로 돌아간다", async ({ page }) => {
  test.setTimeout(120000);
  const state = await installApiFixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/my/avatar');
  await editor(page).getByRole('button', { name: '머리 모양: 긴 웨이브', exact: true }).click();
  await editor(page).getByRole('tab', { name: '모자', exact: true }).click();
  await editor(page).getByRole('button', { name: '모자 모양: 버킷햇', exact: true }).click();
  await editor(page).getByRole('button', { name: '모자 색: 크림', exact: true }).click();
  const rotation = editor(page).locator('#rotation');
  const front = async () => {
    const box = await rotation.boundingBox();
    await rotation.click({ position: { x: box.width / 2, y: box.height / 2 } });
  };
  await editor(page).getByRole('tab', { name: '가방', exact: true }).click();
  await editor(page).getByRole('button', { name: '가방 색: 코랄', exact: true }).click();
  for (const [name, key] of [['백팩', 'backpack'], ['크로스백', 'crossbody'], ['숄더백', 'shoulder']]) {
    await editor(page).getByRole('button', { name: `가방 모양: ${name}`, exact: true }).click();
    if (key === 'backpack') await rotation.press('End'); else await front();
    await editor(page).locator('.studio-workbench').screenshot({ path: `test-results/avatar-bag-${key}.png` });
  }
  await front();
  await editor(page).getByRole('button', { name: '가방 모양: 크로스백', exact: true }).click();
  await editor(page).getByRole('tab', { name: '소지품', exact: true }).click();
  const objects = [];
  for (const [name, key] of [['따뜻한 커피', 'hotCoffee'], ['차가운 커피', 'icedCoffee'], ['책', 'book'], ['노트북', 'laptop'], ['휴대폰', 'phone']]) {
    await editor(page).getByRole('button', { name: `손에 드는 물건: ${name}`, exact: true }).click();
    objects.push((await editor(page).locator('#preview').screenshot()).toString('base64'));
    await editor(page).locator('.studio-workbench').screenshot({ path: `test-results/avatar-item-${key}.png` });
  }
  expect(new Set(objects).size).toBe(5);
  await editor(page).getByRole('button', { name: '손에 드는 물건: 차가운 커피', exact: true }).click();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  expect(state.avatar.appearance).toMatchObject({ hat: 'bucket', bag: 'crossbody', bagColor: 'coral', handheld: 'icedCoffee' });
  await page.getByRole('link', { name: '아바타 수정하기', exact: true }).click();
  await editor(page).getByRole('tab', { name: '소지품', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: '손에 드는 물건: 차가운 커피', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '아바타 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제하고 기본형으로', exact: true }).click();
  await expect(status(page)).toContainText('기본 모습으로 돌아왔어요');
  expect(state.avatar.appearance).toMatchObject({ hat: 'none', bag: 'none', handheld: 'none' });
  await assertSurface(page, state, { axe: true });
});


test("미래 파츠가 섞여도 카드와 편집기를 표시하고 운영 빌드에서 체험판을 제외한다", async ({ page }) => {
  const state = await installApiFixture(page);
  state.avatar = { customized: true, appearance: { ...AVATAR_BASIC_APPEARANCE, hair: "flowing", hat: "futureHat", handheld: "futureItem", newPart: "new" } };
  expect(existsSync("dist/sparring-arena/avatar-lab/index.html")).toBe(false);
  expect(existsSync("dist/sparring-arena/avatar-studio/avatar-editor.js")).toBe(true);
  await page.goto("/my");
  await page.locator(".my-avatar-card").scrollIntoViewIfNeeded();
  await expect(page.frameLocator('iframe[title="저장된 내 아바타"]').locator("#preview canvas")).toBeVisible();
  await page.getByRole("link", { name: "아바타 수정하기", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "머리 모양: 긴 웨이브", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor(page).getByRole("tab", { name: "모자", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "모자 모양: 모자 없음", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.avatar.appearance.hat).toBe("futureHat");
  await editor(page).getByRole("tab", { name: "소지품", exact: true }).click();
  await expect(editor(page).getByRole("button", { name: "손에 드는 물건: 빈손", exact: true })).toHaveAttribute("aria-pressed", "true");
  await editor(page).getByRole("button", { name: "손에 드는 물건: 휴대폰", exact: true }).click();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  expect(state.avatar.appearance).toEqual({ ...AVATAR_BASIC_APPEARANCE, hair: "flowing", handheld: "phone" });
  await assertSurface(page, state, { axe: true });
});
