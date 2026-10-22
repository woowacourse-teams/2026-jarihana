import { expect, test } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { group, installApiFixture } from "./api-fixture.js";

const time = "2026-10-12T12:00:00";
const token = "A".repeat(43);
const candidate = (memberId, crewName) => ({ memberId, crewName, generation: 8, memberType: "CREW", course: "BACKEND" });
const people = [candidate(21, "노을"), candidate(22, "하늘")];
async function selectCandidate(page, dialog, name) {
  const checkbox = dialog.getByRole("checkbox", { name: new RegExp(name) });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
}
async function fixture(page, { role = "LEADER", ended = false, auth = "authenticated", failSecond = false } = {}) {
  await installApiFixture(page, { auth });
  const row = (id, type, canRevoke) => ({ id, type, group: { id: 10, name: group.name }, inviter: { id: 2, crewName: "하늘" },
    targetMember: type === "DIRECT" ? { id: 21, crewName: "노을" } : null,
    createdAt: time, expiresAt: type === "LINK" ? "2026-10-15T12:00:00" : null, status: "VALID", canRevoke });
  const state = { creates: [], candidates: [], revokes: [], failSecond,
    issued: [row(601, "DIRECT", true)], links: [row(501, "LINK", role === "LEADER")] };
  const reply = (route, data, status = 200) => route.fulfill({ status, json: { success: true, data, error: null } });
  await page.route("**/api/groups/10", route => reply(route, { ...group, currentMemberRole: role,
    leader: { ...group.leader, memberId: role === "LEADER" ? 1 : 2 }, status: ended ? "ENDED" : "ACTIVE" }));
  await page.route("**/api/groups/10/invitation-candidates**", route => {
    const keyword = new URL(route.request().url()).searchParams.get("keyword");
    state.candidates.push(keyword);
    return reply(route, { items: people.filter(person => person.crewName.includes(keyword)), nextCursor: null, hasNext: false });
  });
  await page.route("**/api/groups/10/invitations**", route => {
    if (route.request().method() === "GET") return reply(route, { items: new URL(route.request().url()).searchParams.get("scope") === "MANAGED_LINKS" ? state.links : state.issued, nextCursor: null, hasNext: false });
    const body = route.request().postDataJSON(); state.creates.push(body);
    if (body.targetMemberId === 22 && state.failSecond) return route.fulfill({ status: 503, json: { success: false, data: null, error: { code: "INVITATION_UNAVAILABLE" } } });
    return reply(route, { id: body.type === "LINK" ? 501 : body.targetMemberId, groupId: 10, type: body.type,
      targetMemberId: body.targetMemberId ?? null, createdAt: time, expiresAt: body.type === "LINK" ? "2026-10-15T12:00:00" : null,
      status: "VALID", sharePath: body.type === "LINK" ? `/invitations/link/${token}` : `/invitations/${body.targetMemberId}`, reused: body.type === "LINK" }, body.type === "LINK" ? 200 : 201);
  });
  await page.route("**/api/invitations/*", route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    return reply(route, { id, type: "LINK", group: { id: 10, name: group.name, introduction: group.introduction }, inviter: { id: 2, crewName: "하늘" }, createdAt: time, expiresAt: "2026-10-15T12:00:00", status: "VALID", canAccept: false, canRevoke: role === "LEADER", sharePath: `/invitations/link/${token}` });
  });
  await page.route("**/api/invitations/*/revoke", route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-2)); state.revokes.push(id);
    [state.issued, state.links].forEach(rows => rows.forEach(item => { if (item.id === id) { item.status = "CANCELED"; item.canRevoke = false; } }));
    return reply(route, { id, status: "CANCELED", revokedAt: time });
  });
  return state;
}

for (const width of [360, 768, 1440]) {
  test(`후보 프로필·대체 아바타·검색·추가 페이지·초대 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await fixture(page);
    const photo = { ...candidate(21, "노을"), avatarUrl: "https://avatars.githubusercontent.com/u/21" };
    const broken = { ...candidate(22, "하늘"), avatarUrl: "https://avatars.githubusercontent.com/u/22" };
    const missing = { ...candidate(23, "바다"), avatarUrl: null };
    const longName = { ...candidate(24, "아주긴회원이름".repeat(8)), avatarUrl: null };
    await page.route("https://avatars.githubusercontent.com/u/21", route => route.fulfill({
      contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="#80cbb4"/><circle cx="22" cy="17" r="8" fill="#222"/><path d="M8 44a14 17 0 0 1 28 0" fill="#222"/></svg>'
    }));
    await page.route("https://avatars.githubusercontent.com/u/22", route => route.abort());
    await page.route("**/api/groups/10/invitation-candidates**", route => {
      const params = new URL(route.request().url()).searchParams;
      const data = params.get("keyword") ? { items: [broken], nextCursor: null, hasNext: false }
        : params.get("cursor") ? { items: [broken, missing, longName], nextCursor: null, hasNext: false }
          : { items: [photo], nextCursor: "avatar-page-2", hasNext: true };
      return route.fulfill({ json: { success: true, data, error: null } });
    });
    await page.goto("/groups/10?tab=members");
    await page.locator(".invitation-member-trigger").click();
    const dialog = page.getByRole("dialog", { name: "멤버 초대" });
    const avatar = dialog.getByRole("img", { name: "노을 프로필" });
    await expect(avatar).toBeVisible();
    await expect.poll(() => avatar.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await selectCandidate(page, dialog, "노을");
    await dialog.getByRole("button", { name: "더 보기" }).click();
    await expect(dialog.locator('[aria-label="하늘 프로필"]')).toHaveText("하");
    await expect(dialog.locator('[aria-label="바다 프로필"]')).toHaveText("바");
    const search = dialog.getByRole("textbox", { name: "회원 이름 검색" });
    await search.fill("하늘");
    await expect(dialog.getByRole("checkbox", { name: /노을/ })).toHaveCount(0);
    await selectCandidate(page, dialog, "하늘");
    await search.fill("");
    await expect(dialog.getByRole("checkbox", { name: /노을/ })).toBeChecked();
    await dialog.getByRole("button", { name: "더 보기" }).click();
    await expect(dialog.getByRole("checkbox", { name: /하늘/ })).toBeChecked();
    await selectCandidate(page, dialog, "바다");
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      for (const row of await dialog.locator(".invitation-candidate__label").all()) {
        const checkbox = await row.locator(".invitation-candidate__check").boundingBox();
        const image = await row.locator(".ui-avatar").boundingBox();
        const name = await row.locator(".invitation-candidate__name").boundingBox();
        expect(checkbox.x + checkbox.width).toBeLessThanOrEqual(image.x);
        expect(image.x + image.width).toBeLessThanOrEqual(name.x);
        expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      await page.screenshot({ path: `test-results/invitation-avatars-${width}-${scheme}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: /3명.*초대/ }).click();
    await expect.poll(() => state.creates.filter(item => item.type === "DIRECT").length).toBe(3);
    expect(state.creates.map(item => item.targetMemberId)).toEqual([21, 22, 23]);
  });
  test(`보낸 초대 수신자 표시·긴 이름 줄바꿈·접근성 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    const longName = "LongRecipientName".repeat(8);
    state.issued.push({ ...state.issued[0], id: 602, targetMember: { id: 22, crewName: longName }, status: "ACCEPTED" });
    await page.goto("/groups/10?tab=members");
    await page.locator(".invitation-member-trigger").click();
    await page.getByRole("tab", { name: "보낸 초대" }).click();
    const dialog = page.getByRole("dialog", { name: "멤버 초대" });
    await expect(dialog.getByText("수신자: 노을")).toBeVisible();
    await expect(dialog.getByText(`수신자: ${longName}`)).toBeVisible();
    await expect(dialog.getByText(/하늘/)).toHaveCount(0);
    await expect(dialog.locator(".invitation-issued__recipient").first()).toHaveCSS("overflow-wrap", "anywhere");
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/invitation-recipients-${width}.png` });
  });
  test(`다수 선택·검색 유지·참여자 버튼 위치와 키보드 접근 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await fixture(page);
    await page.goto("/groups/10?tab=members");
    const trigger = page.getByRole("button", { name: /초대$/, exact: false });
    await expect(trigger).toBeVisible();
    const bounds = await page.locator(".group-members-list-panel").boundingBox();
    const buttonBounds = await trigger.boundingBox();
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    expect(buttonBounds.height).toBeLessThanOrEqual(33);
    await trigger.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: /노을/ })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /하늘/ })).toBeVisible();
    await expect(dialog.getByText("회원에게 직접 초대하거나 보낸 초대와 공유 링크를 관리할 수 있어요.")).toHaveCount(0);
    await expect(dialog.getByText("초대할 회원을 검색하고 선택해 주세요. 한 번에 여러 명에게 보낼 수 있어요.")).toHaveCount(0);
    const search = dialog.getByRole("textbox").or(dialog.getByRole("searchbox")).first();
    await expect(dialog.getByRole("button", { name: "회원 검색", exact: true })).toHaveCount(0);
    const searchWidths = await dialog.locator(".invitation-search").evaluate(form => ({
      input: form.querySelector("input").getBoundingClientRect().width,
      area: form.getBoundingClientRect().width
    }));
    expect(searchWidths.input).toBeCloseTo(searchWidths.area, 0);
    await expect(search).toHaveAttribute("data-ph-capture-attribute-action", "invitation_search");
    await search.fill("노을");
    await search.press("Enter");
    await expect(dialog).toBeVisible();
    expect(state.creates).toHaveLength(0);
    await selectCandidate(page, dialog, "노을");
    await search.fill("하늘");
    await selectCandidate(page, dialog, "하늘");
    await search.fill("");
    await expect(dialog.getByRole("checkbox", { name: /노을/ })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /하늘/ })).toBeChecked();
    const send = dialog.getByRole("button", { name: /2명.*초대/ });
    await expect(send).toBeEnabled();
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/invitation-issuance-${width}.png` });
    await send.click();
    await expect.poll(() => state.creates.filter(item => item.type === "DIRECT").length).toBe(2);
    expect(state.creates.filter(item => item.type === "DIRECT").map(item => item.targetMemberId)).toEqual([21, 22]);
    expect(state.creates.every(item => !Object.hasOwn(item, "message"))).toBe(true);
    expect(state.candidates).toContain("");
  });
}

test("일반 모임원도 링크 복사를 누르며 실패하면 직접 복사할 같은 주소를 보여준다", async ({ page }) => {
  const state = await fixture(page, { role: "MEMBER" });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.goto("/groups/10?tab=members");
  await expect(page.getByRole("link", { name: "모임 수정" })).toHaveCount(0);
  await page.getByRole("button", { name: "초대 링크 복사" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue(new RegExp(`/invitations/link/${token}$`));
  expect(state.creates).toHaveLength(1);
  expect(state.creates[0].type).toBe("LINK");
});

for (const options of [{ role: null }, { ended: true }, { auth: "anonymous", role: null }]) {
test(`외부 사용자·종료 모임·비회원에게 초대 액션을 열지 않는다: ${JSON.stringify(options)}`, async ({ page }) => {
  const state = await fixture(page, options);
  await page.goto("/groups/10?tab=members");
  await expect(page.getByRole("tab", { name: "참여자" })).toBeVisible();
  await expect(page.getByRole("button", { name: "초대 링크 복사" })).toHaveCount(0);
  await expect(page.locator(".invitation-member-trigger")).toHaveCount(0);
  expect(state.creates).toHaveLength(0);
});
}

test("부분 실패 재시도는 성공한 회원을 다시 발급하지 않고 실패 회원의 requestId를 재사용한다", async ({ page }) => {
  const state = await fixture(page, { failSecond: true });
  await page.goto("/groups/10?tab=members");
  await page.locator(".invitation-member-trigger").click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("textbox").or(dialog.getByRole("searchbox")).first();
  await search.fill("노을"); await selectCandidate(page, dialog, "노을");
  await search.fill("하늘"); await selectCandidate(page, dialog, "하늘");
  await dialog.getByRole("button", { name: /2명.*초대/ }).click();
  await expect.poll(() => state.creates.length).toBe(2);
  const retry = dialog.getByRole("button", { name: /1명.*초대/ });
  await expect(retry).toBeEnabled(); state.failSecond = false; await retry.click();
  await expect.poll(() => state.creates.length).toBe(3);
  expect(state.creates.map(item => item.targetMemberId)).toEqual([21, 22, 22]);
  expect(state.creates[1].requestId).toBe(state.creates[2].requestId);
});

test("보낸 초대 취소는 확인 후 저장하고 다시 조회하며 별도 받은 초대 화면을 만들지 않는다", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/groups/10?tab=members"); await page.locator(".invitation-member-trigger").click();
  await page.getByRole("tab", { name: "보낸 초대" }).click();
  await page.getByRole("button", { name: /취소/ }).last().click();
  const confirm = page.getByRole("dialog").last();
  await confirm.getByRole("button", { name: /취소/, exact: false }).last().click();
  await expect.poll(() => state.revokes).toEqual([601]);
  await expect(page.getByText("취소됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "받은 초대" })).toHaveCount(0);
});

test("내가 만든 공유 링크도 공유 링크 탭에서만 표시하고 내가 보낸 초대에는 섞지 않는다", async ({ page }) => {
  const state = await fixture(page);
  state.issued = [];
  state.links[0].inviter = { id: 1, crewName: "자리" };
  await page.goto("/groups/10?tab=members");
  await page.locator(".invitation-member-trigger").click();
  await page.getByRole("tab", { name: "보낸 초대" }).click();
  const dialog = page.getByRole("dialog", { name: "멤버 초대" });
  await expect(dialog.getByText("아직 보낸 초대가 없어요.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /공유 링크 복사/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "공유 링크", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /공유 링크 복사/ })).toBeVisible();
  await dialog.getByRole("button", { name: "내가 보낸 초대", exact: true }).click();
  await expect(dialog.getByText("아직 보낸 초대가 없어요.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /공유 링크 복사/ })).toHaveCount(0);
});

test("일반 모임원은 다른 사람의 공유 링크를 복사하지만 취소 버튼은 없다", async ({ page }) => {
  const state = await fixture(page, { role: "MEMBER" });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await page.goto("/groups/10?tab=members"); await page.locator(".invitation-member-trigger").click();
  await page.getByRole("tab", { name: "보낸 초대" }).click();
  await page.getByRole("button", { name: "공유 링크", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "멤버 초대" });
  await expect(dialog.getByRole("button", { name: /복사/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /취소/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /복사/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "복사" })).toBeVisible();
  expect(state.revokes).toHaveLength(0);
});
