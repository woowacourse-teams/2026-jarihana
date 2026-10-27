import { test, expect } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const width of [390, 1200]) {
  test(`header chat badge sums rooms and keeps read state after closing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await installApiFixture(page);
    const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
    let unread = 100;
    const message = { id: "100", groupId: "10", sequence: "100", senderId: "2", author: "하나", clientMessageId: "header-badge", content: "마지막 메시지", createdAt: "2026-10-27T12:00:00" };
    const room = (groupId, name, unreadCount) => ({ groupId, name, unreadCount, type: "STUDY", description: null, memberCount: 2, status: "ACTIVE", latestSequence: "100", lastReadSequence: unreadCount ? "0" : "100", lastMessage: message, updatedAt: message.createdAt });
    await page.route("**/api/chats**", (route) => reply(route, { items: [room("10", "읽을 모임", unread), room("11", "다른 모임", 5)], nextCursor: null, hasNext: false }));
    await page.route("**/api/groups/10/chat/messages**", (route) => reply(route, { items: [message], nextCursor: null, hasNext: false, latestSequence: "100", lastReadSequence: "0", status: "ACTIVE" }));
    await page.route("**/api/groups/10/chat/read", (route) => {
      unread = 0;
      return reply(route, { groupId: "10", lastReadSequence: "100", latestSequence: "100", unreadCount: 0 });
    });
    await page.goto("/groups");
    await page.bringToFront();
    const trigger = page.getByRole("link", { name: "채팅, 안 읽은 메시지 105개", exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger.locator(".app-header__chat-count")).toHaveText("99+");
    await page.screenshot({ path: `../.omo/evidence/chat-header-badge-${width}.png` });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "모임 채팅" });
    await dialog.locator('[data-room-id="10"]').click();
    await expect(dialog.getByText("마지막 메시지", { exact: true }).last()).toBeVisible();
    await expect.poll(() => unread).toBe(0);
    await dialog.getByRole("button", { name: "채팅 닫기" }).click();
    const updated = page.getByRole("link", { name: "채팅, 안 읽은 메시지 5개", exact: true });
    await expect(updated).toBeVisible();
    await expect(updated.locator(".app-header__chat-count")).toHaveText("5");
  });
}

test("header chat badge is absent when every room is read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await installApiFixture(page);
  await page.route("**/api/chats**", (route) => route.fulfill({ json: { success: true, data: { items: [], nextCursor: null, hasNext: false }, error: null } }));
  await page.goto("/groups");
  await expect(page.getByRole("link", { name: "채팅", exact: true })).toBeVisible();
  await expect(page.locator(".app-header__chat-count")).toHaveCount(0);
});

for (const width of [390, 1200]) {
  test(`websocket updates closed chat badge immediately and survives modal changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await installApiFixture(page);
    const sockets = [];
    let subscription;
    let unread = 0;
    let sequence = 10;
    let roomRequests = 0;
    const message = () => ({ id: String(sequence), groupId: "10", sequence: String(sequence), senderId: "2", author: "하나", clientMessageId: `live-${sequence}`, content: `실시간 메시지 ${sequence}`, createdAt: "2026-10-27T12:00:00" });
    const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
    await page.routeWebSocket("**/api/ws/chat", (socket) => {
      sockets.push(socket);
      socket.onMessage((frame) => {
        const text = String(frame);
        if (text.startsWith("CONNECT")) socket.send("CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\u0000");
        if (text.startsWith("SUBSCRIBE")) subscription = text.match(/\nid:([^\n]+)/)[1];
      });
    });
    await page.route("**/api/chats**", (route) => {
      roomRequests += 1;
      return reply(route, { items: [{ groupId: "10", name: "실시간 모임", type: "STUDY", description: null, memberCount: 2, status: "ACTIVE", latestSequence: String(sequence), lastReadSequence: String(sequence - unread), unreadCount: unread, lastMessage: message(), updatedAt: message().createdAt }], nextCursor: null, hasNext: false });
    });
    await page.route("**/api/groups/10/chat/messages**", (route) => reply(route, { items: [message()], nextCursor: null, hasNext: false, latestSequence: String(sequence), lastReadSequence: String(sequence - unread), status: "ACTIVE" }));
    await page.route("**/api/groups/10/chat/read", (route) => {
      unread = 0;
      return reply(route, { groupId: "10", lastReadSequence: String(sequence), latestSequence: String(sequence), unreadCount: 0 });
    });
    const publish = () => sockets.at(-1).send(`MESSAGE\nsubscription:${subscription}\nmessage-id:${sequence}\ndestination:/user/queue/chat-events\n\n${JSON.stringify({ version: 1, type: "MESSAGE_CREATED", groupId: "10", message: message() })}\u0000`);
    await page.goto("/groups");
    await page.bringToFront();
    await expect.poll(() => Boolean(subscription) && roomRequests >= 2).toBe(true);
    await expect(page.getByRole("link", { name: "채팅", exact: true })).toBeVisible();
    const requestsBeforeEvent = roomRequests;
    sequence = 11;
    unread = 1;
    publish();
    publish();
    const trigger = page.getByRole("link", { name: "채팅, 안 읽은 메시지 1개", exact: true });
    await expect(trigger).toBeVisible({ timeout: 2000 });
    expect(roomRequests).toBe(requestsBeforeEvent);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "모임 채팅" });
    await dialog.locator('[data-room-id="10"]').click();
    await expect.poll(() => unread).toBe(0);
    await dialog.getByRole("button", { name: "채팅 닫기" }).click();
    await expect(page.getByRole("link", { name: "채팅", exact: true })).toBeVisible();
    expect(sockets).toHaveLength(1);
    sequence = 12;
    unread = 1;
    publish();
    await expect(trigger).toBeVisible({ timeout: 2000 });
    await page.screenshot({ path: `../.omo/evidence/chat-header-live-${width}.png` });
    expect(sockets).toHaveLength(1);
    await sockets[0].close();
    sequence = 13;
    unread = 2;
    await expect(page.getByRole("link", { name: "채팅, 안 읽은 메시지 2개", exact: true })).toBeVisible();
    expect(sockets).toHaveLength(2);
  });
}
