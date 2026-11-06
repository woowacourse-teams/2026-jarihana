import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

test("@core reuses the announcement request ID on retry and replaces it for a new submission", async ({ page }) => {
  const state = await installApiFixture(page);
  const submissions = [];
  await page.route("**/api/groups/10/announcements**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { items: [], hasNext: false, nextCursor: null }, error: null, success: true } });
    }
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) {
      return route.fulfill({
        status: 503,
        json: { data: null, error: { code: "TEMPORARILY_UNAVAILABLE", message: "Retry fixture" }, success: false }
      });
    }
    return route.fulfill({ status: 201, json: { data: { id: 101 }, error: null, success: true } });
  });

  await page.goto(`/groups/${group.id}?tab=announcements`);
  const open = page.locator(".group-announcement-tab__header").getByRole("button", { name: "공지 추가", exact: true });
  const form = page.getByRole("dialog", { name: "공지 등록" });
  const submit = form.getByRole("button", { name: "공지 등록", exact: true });
  const fill = async () => {
    await form.getByLabel("공지 제목").fill("모임 공지");
    await form.getByLabel("공지 내용").fill("다음 일정 안내");
  };

  await open.click();
  await fill();
  await submit.click();
  await expect(form.getByRole("alert")).toBeVisible();
  await submit.click();
  await expect(form).toBeHidden();
  expect(submissions[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(submissions[1]).toEqual(submissions[0]);

  await open.click();
  await fill();
  await submit.click();
  await expect(form).toBeHidden();
  expect(submissions[2].requestId).not.toEqual(submissions[0].requestId);
  expect(state.unexpectedResponses).toEqual(["503 /api/groups/10/announcements"]);
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
