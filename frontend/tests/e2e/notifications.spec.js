import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiFixture } from "./api-fixture.js";

const initialRows = [1, 2].map((id) => ({ id, eventType: "REGISTRATION_APPROVED", payloadVersion: 1,
  title: `모임 신청 승인 ${id}`, body: "모임 신청이 승인되었습니다. 자세한 내용은 내 신청에서 확인해 주세요.",
  createdAt: "2026-10-05T12:00:00", readAt: null,
  target: { kind: "MY_REGISTRATIONS", groupId: 10, recruitmentId: 20 } }));
async function fixture(page) {
  const shared = await installApiFixture(page);
  const state = { rows: structuredClone(initialRows), reads: 0, failDelete: false };
  const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    if (url.pathname.endsWith("/unread-count")) return reply(route, { unreadCount: state.rows.filter((row) => !row.readAt).length });
    if (url.pathname.endsWith("/read-all")) {
      state.reads += 1; state.rows.forEach((row) => { row.readAt = "2026-10-05T12:30:00"; });
      return reply(route, { updatedCount: state.rows.length, readAt: "2026-10-05T12:30:00" });
    }
    const id = Number(url.pathname.match(/\/notifications\/(\d+)/)?.[1]);
    if (method === "DELETE") {
      if (state.failDelete) return route.fulfill({ status: 500, json: { success: false, data: null, error: { code: "INTERNAL_ERROR" } } });
      state.rows = state.rows.filter((row) => row.id !== id); return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/read")) {
      state.reads += 1; return reply(route, { id, readAt: "2026-10-05T12:30:00" });
    }
    if (id) return reply(route, state.rows.find((row) => row.id === id));
    return reply(route, { items: state.rows, hasNext: false, nextCursor: null });
  });
  return { ...state, shared, state };
}
for (const width of [360, 768, 1440]) {
  test(`@core inbox read/delete and keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state } = await fixture(page);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "알림함", exact: true })).toBeVisible();
    await expect(page.getByText("모임 신청 승인 1", { exact: true })).toBeVisible();
    expect(state.reads).toBe(0);
    await page.getByRole("button", { name: "전체 읽음", exact: true }).click();
    await expect(page.getByText("읽음", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("list", { name: "받은 알림 목록" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "모임 신청 승인 1 알림 삭제" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("모임 신청 승인 1", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /모임 신청 승인 2/ })).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    const axe = await new AxeBuilder({ page }).include(".notification-page").analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: `test-results/notifications-${width}.png`, fullPage: true });
  });
}
test("@core bell opens without reading and Escape returns focus", async ({ page }) => {
  await fixture(page); await page.goto("/groups");
  const bell = page.getByRole("button", { name: /알림함, 안 읽은 알림/ }).filter({ visible: true });
  await bell.click();
  await expect(page.getByRole("dialog", { name: "알림함" })).toBeVisible();
  await expect(page.getByText("안 읽음", { exact: true })).toHaveCount(2);
  await page.getByRole("dialog", { name: "알림함" }).evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: "test-results/notification-drawer.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "알림함" })).toHaveCount(0);
  await expect(bell).toBeFocused();
});
test("@core delete failure keeps row; normal motion starts only after successful response", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { state } = await fixture(page); await page.goto("/notifications");
  state.failDelete = true;
  await page.getByRole("button", { name: "모임 신청 승인 1 알림 삭제" }).click();
  await expect(page.getByText("삭제하지 못했어요. 삭제 버튼으로 다시 시도해 주세요.")).toBeVisible();
  await expect(page.locator(".notification-row--exiting")).toHaveCount(0);
  state.failDelete = false;
  await page.getByRole("button", { name: "모임 신청 승인 1 알림 삭제" }).click();
  await expect(page.locator(".notification-row--exiting")).toHaveCount(1);
  await expect(page.getByText("모임 신청 승인 1", { exact: true })).toHaveCount(0);
});
test("@core notification click verifies and marks read before opening related screen", async ({ page }) => {
  const { state } = await fixture(page); await page.goto("/notifications/open/1");
  await expect(page).toHaveURL(/\/my\/registrations$/);
  expect(state.reads).toBeGreaterThan(0);
});
test("@core actual Service Worker stores binding in IndexedDB and shares disarm across tabs", async ({ page, context }) => {
  await installApiFixture(page); await page.goto("/groups");
  const command = async (target, type, extra = {}) => target.evaluate(async ({ type, extra }) => {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("timeout")), 5000);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); resolve(data); };
      registration.active.postMessage({ protocol: 1, type, ...extra }, [channel.port2]);
    });
  }, { type, extra });
  const initial = await command(page, "GET_STATE");
  const bound = await command(page, "BIND", { expectedRevision: initial.state.revision, binding: { id: 8, memberId: 1, generation: 1 } });
  expect(bound.ok).toBe(true);
  const other = await context.newPage(); await other.goto("/");
  const shared = await command(other, "GET_STATE"); expect(shared.state.armed).toBe(true);
  const stopped = await command(other, "DISARM"); expect(stopped.state.armed).toBe(false);
  await page.reload();
  const persisted = await command(page, "GET_STATE"); expect(persisted.state.armed).toBe(false);
  const late = await command(page, "BIND", { expectedRevision: bound.state.revision, binding: { id: 8, memberId: 1, generation: 1 } });
  expect(late.ok).toBe(false);
});

for (const status of [403, 404]) {
  test(`@core notification target ${status} keeps an inbox return without marking read`, async ({ page }) => {
    const { state } = await fixture(page);
    await page.route("**/api/groups/10", (route) => route.fulfill({ status, json: { success: false, data: null, error: { code: status === 403 ? "FORBIDDEN" : "GROUP_NOT_FOUND" } } }));
    await page.goto("/notifications/open/1");
    await expect(page.getByRole("alert")).toContainText("이 알림을 확인할 수 없어요");
    expect(state.reads).toBe(0);
    await page.getByRole("link", { name: "알림함으로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/notifications$/);
  });
}
test("@core signed-out notification click preserves the return route for login", async ({ page }) => {
  await installApiFixture(page, { auth: "anonymous" });
  await page.goto("/notifications/open/1");
  await expect(page.getByRole("button", { name: "GitHub로 로그인" })).toBeVisible();
  const target = await page.evaluate(() => Object.entries(sessionStorage).find(([, value]) => value === "/notifications/open/1"));
  expect(target).toBeDefined();
});
