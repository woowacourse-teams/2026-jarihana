import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const width of [390, 1200]) {
  test(`chat notification opens the correct conversation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await installApiFixture(page);
    const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
    const message = { id: "1", groupId: "10", sequence: "1", senderId: "2", author: "하나",
      clientMessageId: "chat-push-1", content: "알림으로 연 대화", createdAt: "2026-11-05T12:00:00" };
    let accessChecked = false;
    let notificationRead = false;
    await page.route("**/api/notifications/5?**", (route) => {
      expect(new URL(route.request().url()).searchParams.get("clientVersion")).toBe("3");
      return reply(route, { id: 5, eventType: "CHAT_MESSAGE_RECEIVED", payloadVersion: 1,
        title: "새 메시지", body: "모임에 새 채팅 메시지가 도착했습니다.", createdAt: message.createdAt,
        readAt: null, target: { kind: "GROUP_CHAT", groupId: 10 } });
    });
    await page.route("**/api/notifications/5/read", (route) => {
      expect(accessChecked).toBe(true);
      notificationRead = true;
      return reply(route, { id: 5, readAt: message.createdAt });
    });
    await page.route("**/api/chats?**", (route) => reply(route, { items: [{ groupId: "10", name: "알림 모임",
      type: "STUDY", description: null, memberCount: 2, status: "ACTIVE", latestSequence: "1",
      lastReadSequence: "0", unreadCount: 1, lastMessage: message, updatedAt: message.createdAt }],
    nextCursor: null, hasNext: false }));
    await page.route("**/api/groups/10/chat/messages**", (route) => {
      if (new URL(route.request().url()).searchParams.get("size") === "1") accessChecked = true;
      return reply(route, { items: [message], nextCursor: null, hasNext: false,
        latestSequence: "1", lastReadSequence: "0", status: "ACTIVE" });
    });
    await page.route("**/api/groups/10/chat/read", (route) => reply(route, {
      groupId: "10", lastReadSequence: "1", latestSequence: "1", unreadCount: 0
    }));
    await page.goto("/notifications/open/5");
    await expect(page).toHaveURL((url) => url.pathname === "/home" && url.searchParams.get("chat") === "10");
    const dialog = page.getByRole("dialog", { name: "모임 채팅" });
    await expect(dialog.getByRole("region", { name: "대화 스크롤 영역" }).getByText(message.content)).toBeVisible();
    expect(notificationRead).toBe(true);
  });
}
