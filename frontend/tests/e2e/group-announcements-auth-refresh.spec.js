import { expect, test } from "playwright/test";

import { group, installApiFixture } from "./api-fixture.js";

test("refreshes an expired member session before loading group announcements", async ({ page }) => {
  const state = await installApiFixture(page, { expireMemberProfileAfterBootstrap: true });
  const announcementRequests = [];
  const announcement = {
    authorNickname: "자리",
    content: "토큰을 갱신한 모임원도 공지를 확인할 수 있어요.",
    createdAt: "2026-10-29T12:00:00",
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
