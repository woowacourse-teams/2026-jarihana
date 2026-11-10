import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

const announcementOpenButton = (page) =>
  page.locator(".group-announcement-tab__header").getByRole("button", { name: "공지 추가", exact: true });

const announcementForm = (page) => page.getByRole("dialog", { name: "공지 등록" });

async function fillAnnouncement(form) {
  await form.getByLabel("공지 제목").fill("모임 공지");
  await form.getByLabel("공지 내용").fill("다음 일정 안내");
}

test("@core retries a lost announcement response automatically and uses a fresh ID after success", async ({ page }) => {
  const state = await installApiFixture(page);
  const submissions = [];
  await page.route("**/api/groups/10/announcements**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { items: [], hasNext: false, nextCursor: null }, error: null, success: true } });
    }
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) {
      return route.abort("connectionreset");
    }
    return route.fulfill({ status: 201, json: { data: { id: 101 }, error: null, success: true } });
  });

  await page.goto(`/groups/${group.id}?tab=announcements`);
  const open = announcementOpenButton(page);
  const form = announcementForm(page);
  const submit = form.getByRole("button", { name: "공지 등록", exact: true });

  await open.click();
  await fillAnnouncement(form);
  await submit.click();
  await expect(form).toBeHidden();
  expect(submissions).toHaveLength(2);
  expect(submissions[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(submissions[1]).toEqual(submissions[0]);

  await open.click();
  await fillAnnouncement(form);
  await submit.click();
  await expect(form).toBeHidden();
  expect(submissions).toHaveLength(3);
  expect(submissions[2].requestId).not.toEqual(submissions[0].requestId);
  expect(state.unexpectedResponses).toEqual([]);
});

async function submitUnconfirmedAnnouncement(page) {
  await installApiFixture(page);
  const submissions = [];
  await page.route("**/api/groups/10/announcements**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { items: [], hasNext: false, nextCursor: null }, error: null, success: true } });
    }
    submissions.push(route.request().postDataJSON());
    if (submissions.length <= 3) return route.abort("connectionreset");
    return route.fulfill({ status: 201, json: { data: { id: 101 }, error: null, success: true } });
  });

  await page.goto(`/groups/${group.id}?tab=announcements`);
  const form = announcementForm(page);
  await announcementOpenButton(page).click();
  await fillAnnouncement(form);
  await form.getByRole("radio", { name: "전체 공개" }).check();
  await form.getByRole("button", { name: "공지 등록", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("이전 공지의 등록 결과를 확인하지 못했어요");
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(form.getByLabel("공지 제목")).toHaveCount(0);
  expect(submissions).toHaveLength(3);
  expect(submissions).toEqual(Array(3).fill(submissions[0]));
  return submissions;
}

test("@core restores the original announcement without sending it until explicitly submitted", async ({ page }) => {
  const submissions = await submitUnconfirmedAnnouncement(page);
  const open = announcementOpenButton(page);
  const form = announcementForm(page);
  const restore = form.getByRole("button", { name: "이전 요청 불러오기", exact: true });

  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await restore.click();
  const title = form.getByLabel("공지 제목");
  await expect(title).toHaveValue("모임 공지");
  await expect(title).not.toBeEditable();
  await expect(title).toBeFocused();
  await expect(form.getByRole("radio", { name: "전체 공개" })).toBeChecked();
  await expect(form.getByRole("radio", { name: "전체 공개" })).toBeDisabled();
  expect(submissions).toHaveLength(3);

  await form.getByRole("button", { name: "취소", exact: true }).click();
  await page.reload();
  await open.click();
  await expect(form.getByLabel("공지 내용")).toHaveCount(0);
  await restore.click();
  await expect(form.getByLabel("공지 내용")).toHaveValue("다음 일정 안내");
  expect(submissions).toHaveLength(3);

  await form.getByRole("button", { name: "이전 요청 다시 보내기", exact: true }).click();
  await expect(form).toBeHidden();
  expect(submissions).toHaveLength(4);
  expect(submissions[3]).toEqual(submissions[0]);
});

test("@core discards an unconfirmed announcement and starts with a blank form and a fresh ID", async ({ page }) => {
  const submissions = await submitUnconfirmedAnnouncement(page);
  const open = announcementOpenButton(page);
  const form = announcementForm(page);
  const title = form.getByLabel("공지 제목");
  const content = form.getByLabel("공지 내용");
  const storageKey = `announcement:create:1:${group.id}`;

  expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), storageKey)).toEqual(submissions[0]);
  await form.getByRole("button", { name: "새 공지 쓰기", exact: true }).click();
  await expect(title).toHaveValue("");
  await expect(title).toBeFocused();
  await expect(content).toHaveValue("");
  await expect(form.getByRole("radio", { name: "모임원 공개" })).toBeChecked();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(submissions).toHaveLength(3);

  await page.reload();
  await open.click();
  await expect(title).toBeEditable();
  await expect(title).toHaveValue("");
  await title.fill("새 모임 공지");
  await content.fill("바뀐 일정 안내");
  await form.getByRole("button", { name: "공지 등록", exact: true }).click();
  await expect(form).toBeHidden();
  expect(submissions).toHaveLength(4);
  expect(submissions[3]).toEqual({
    title: "새 모임 공지",
    content: "바뀐 일정 안내",
    scope: "MEMBERS",
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/)
  });
  expect(submissions[3].requestId).not.toBe(submissions[0].requestId);
});

test("shows an announcement request conflict without retrying it", async ({ page }) => {
  await installApiFixture(page);
  let submissions = 0;
  await page.route("**/api/groups/10/announcements**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { items: [], hasNext: false, nextCursor: null }, error: null, success: true } });
    }
    submissions += 1;
    return route.fulfill({
      status: 409,
      json: { data: null, error: { code: "ANNOUNCEMENT_REQUEST_CONFLICT", message: "Conflict" }, success: false }
    });
  });

  await page.goto(`/groups/${group.id}?tab=announcements`);
  const form = announcementForm(page);
  await announcementOpenButton(page).click();
  await fillAnnouncement(form);
  await form.getByRole("button", { name: "공지 등록", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("이미 다른 내용으로 사용한 요청이에요. 공지 목록을 확인해 주세요.");
  expect(submissions).toBe(1);
  await expect(form.getByLabel("공지 제목")).toBeEditable();
});

test("@core refreshes an expired member session before loading group announcements", async ({ page }) => {
  const state = await installApiFixture(page, { expireMemberProfileAfterBootstrap: true });
  const announcementRequests = [];
  const announcement = {
    authorNickname: "자리",
    content: "토큰을 갱신한 모임원도 공지를 확인할 수 있어요.",
    createdAt: "2026-10-29T12:00:00",
    canManage: false,
    id: 101,
    scope: "MEMBERS",
    title: "모임원 공개 공지"
  };

  await page.route("**/api/groups/10/announcements**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.slice("/api".length);
    announcementRequests.push(path);
    state.requests.push({ method: "GET", path });
    const data = path.endsWith("/101")
      ? announcement
      : {
        hasNext: false,
        items: [{
          authorNickname: announcement.authorNickname,
          createdAt: announcement.createdAt,
          id: announcement.id,
          scope: announcement.scope,
          title: announcement.title
        }],
        nextCursor: null
      };
    return route.fulfill({ json: { data, error: null, success: true } });
  });

  await page.goto(`/groups/${group.id}`);
  await expect(page.getByRole("heading", { name: group.name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "공지" }).click();

  await expect(page.getByRole("link", { name: /모임원 공개 공지/ })).toBeVisible();
  expect(state.expiredMemberProfile).toBe(true);

  await page.getByRole("link", { name: /모임원 공개 공지/ }).click();
  await expect(page.getByRole("heading", { name: announcement.title, exact: true })).toBeVisible();
  await expect(page.getByText(announcement.content, { exact: true })).toBeVisible();

  const authAndAnnouncementRequests = state.requests
    .filter(({ method, path }) =>
      (method === "GET" && path === "/members/me") ||
      (method === "POST" && path === "/auth/refresh") ||
      path.startsWith(`/groups/${group.id}/announcements`)
    )
    .map(({ method, path }) => `${method} ${path}`);

  const listRequest = `GET /groups/${group.id}/announcements`;
  const detailRequest = `GET /groups/${group.id}/announcements/101`;
  const listRequestIndex = authAndAnnouncementRequests.indexOf(listRequest);
  const detailRequestIndex = authAndAnnouncementRequests.indexOf(detailRequest);
  const refreshRequestIndex = authAndAnnouncementRequests.indexOf("POST /auth/refresh");

  expect(refreshRequestIndex).toBeGreaterThanOrEqual(0);
  expect(refreshRequestIndex).toBeLessThan(listRequestIndex);
  expect(authAndAnnouncementRequests[listRequestIndex - 1]).toBe("GET /members/me");
  expect(authAndAnnouncementRequests[detailRequestIndex - 1]).toBe("GET /members/me");
  expect(detailRequestIndex).toBeGreaterThan(listRequestIndex);
  expect(announcementRequests).toEqual([
    `/groups/${group.id}/announcements`,
    `/groups/${group.id}/announcements/101`
  ]);
  expect(state.unexpectedResponses).toEqual([]);
});
