import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const count of [0, 1, 20]) {
  test(`mobile chat keeps ${count} messages visible and header fixed`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await installApiFixture(page);
    const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
    const message = (id) => ({ id: String(id), groupId: "10", sequence: String(id), senderId: "2", author: "하나", avatarUrl: "https://avatars.githubusercontent.com/u/2", clientMessageId: `key-${id}`, content: `메시지 ${id}`, createdAt: "2026-10-25T12:00:00" });
    const items = Array.from({ length: count }, (_, i) => message(i + 1));
    await page.route("**/api/chats**", (route) => reply(route, { items: [{ groupId: "10", name: "모임", type: "STUDY", description: null, memberCount: 2, status: "ACTIVE", latestSequence: String(items.length), lastReadSequence: "0", unreadCount: 0, lastMessage: items.at(-1) ?? null, updatedAt: "2026-10-25T12:00:00" }], nextCursor: null, hasNext: false }));
    await page.route("**/api/groups/10/chat/messages**", (route) => reply(route, { items, nextCursor: null, hasNext: false, latestSequence: String(items.length), lastReadSequence: "0", status: "ACTIVE" }));
    await page.route("**/api/groups/10/chat/read", (route) => reply(route, { groupId: "10", lastReadSequence: String(items.length), latestSequence: String(items.length), unreadCount: 0 }));
    await page.goto("/groups?chat=10");
    const dialog = page.getByRole("dialog", { name: "모임 채팅" });
    const header = dialog.locator(".chat-conversation__header");
    const history = dialog.getByRole("region", { name: "대화 스크롤 영역" });
    await expect(header).toBeVisible();
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    });
    if (count === 0) {
      const text = dialog.getByText("첫 이야기를 시작해 보세요");
      await expect(text).toBeInViewport();
    } else {
      await expect(history.getByText(`메시지 ${count}`, { exact: true })).toBeInViewport();
      const top = (await header.boundingBox()).y;
      await history.evaluate((el) => { el.scrollTop = 0; });
      await expect(history.getByText("메시지 1", { exact: true })).toBeInViewport();
      const bounds = await history.boundingBox();
      const first = await history.getByText("메시지 1", { exact: true }).boundingBox();
      expect(first.y).toBeGreaterThanOrEqual(bounds.y);
      expect(first.y + first.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect((await header.boundingBox()).y).toBeCloseTo(top, 0);
    }
    expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  });
}

test("active room hides its badge while read confirmation is pending", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await installApiFixture(page);
  const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
  const items = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), groupId: "10", sequence: String(i + 1), senderId: "2", author: "하나", clientMessageId: `key-${i}`, content: `메시지 ${i + 1}`, createdAt: "2026-10-25T12:00:00" }));
  const room = { groupId: "10", name: "모임", type: "STUDY", description: null, memberCount: 2, status: "ACTIVE", latestSequence: "20", lastReadSequence: "0", unreadCount: 1, lastMessage: items.at(-1), updatedAt: "2026-10-25T12:00:00" };
  await page.route("**/api/chats**", (route) => reply(route, { items: [room, { ...room, groupId: "11", name: "다른 모임", unreadCount: 3 }], nextCursor: null, hasNext: false }));
  await page.route("**/api/groups/10/chat/messages**", (route) => reply(route, { items, nextCursor: null, hasNext: false, latestSequence: "20", lastReadSequence: "0", status: "ACTIVE" }));
  await page.route("**/api/groups/10/chat/read", () => {});
  await page.goto("/groups?chat=10");
  const dialog = page.getByRole("dialog", { name: "모임 채팅" });
  const history = dialog.getByRole("region", { name: "대화 스크롤 영역" });
  await expect(history.getByText("메시지 20", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("안 읽은 메시지 1개")).toHaveCount(0);
  await expect(dialog.getByLabel("안 읽은 메시지 3개")).toBeVisible();
  await history.evaluate((element) => { element.scrollTop = 0; });
  await expect(dialog.getByLabel("안 읽은 메시지 1개")).toBeVisible();
});
