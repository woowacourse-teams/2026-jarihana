import { gunzipSync } from "node:zlib";
import { expect, test } from "playwright/test";
import { installApiFixture } from "../e2e/api-fixture.js";

const token = "A".repeat(43);
const now = "2026-10-12T12:00:00";

for (const result of ["JOINED", "ALREADY_JOINED"]) {
  test(`공유 초대 ${result}의 실제 SDK 네트워크 payload가 회원 ID와 최소 이벤트만 담는다`, async ({ page }) => {
    const events = [];
    const analyticsRequests = [];
    const logs = [];
    page.on("console", message => logs.push(message.text()));
    page.on("pageerror", error => logs.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
    });
    await installApiFixture(page);
    await page.route("https://analytics.example.test/**", async route => {
      const request = route.request();
      const body = request.postDataBuffer();
      analyticsRequests.push(new URL(request.url()).pathname);
      if (body) {
        const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString() : body.toString();
        const data = raw.startsWith("data=") ? JSON.parse(Buffer.from(new URLSearchParams(raw).get("data"), "base64").toString()) : JSON.parse(raw);
        events.push(...(Array.isArray(data) ? data : data.batch || [data]));
      }
      await route.fulfill({ status: 200, json: { status: 1, featureFlags: {} } });
    });
    await page.route("**/api/invitations/**", route => {
      const acceptance = new URL(route.request().url()).pathname.endsWith("/acceptances");
      const data = acceptance
        ? { result, invitationId: 501, groupId: 10, groupMemberId: 30, joinedAt: now, ...(result === "JOINED" ? { registrationOrigin: "INVITATION" } : {}) }
        : { id: 501, type: "LINK", group: { id: 10, name: "함께하는 자바 스터디", introduction: "함께 공부해요" }, inviter: { id: 2, crewName: "하나" }, createdAt: now, expiresAt: "2026-10-15T12:00:00", status: "VALID", canAccept: true, canRevoke: false };
      return route.fulfill({ status: acceptance && result === "JOINED" ? 201 : 200, json: { success: true, data, error: null } });
    });
    await page.goto(`/invitations/link/${token}?__posthog_debug=true`);
    await expect(page.getByRole("button", { name: "수락", exact: true })).toBeVisible();
    try {
      await expect.poll(() => events.filter(event => event.event === "invitation_viewed").length).toBe(1);
    } catch (error) {
      await test.info().attach("analytics-diagnostics", { body: Buffer.from(JSON.stringify({ analyticsRequests, events, logs }, null, 2)), contentType: "application/json" });
      throw error;
    }
    await page.getByRole("button", { name: "수락", exact: true }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(result === "JOINED" ? "모임에 합류했어요" : "이미 참여 중");
    const completion = result === "JOINED" ? "invitation_joined" : "invitation_already_joined";
    await expect.poll(() => events.filter(event => event.event === completion).length).toBe(1);
    expect(events.map(event => event.event)).toEqual(["invitation_viewed", "invitation_accept_attempted", completion]);
    for (const event of events) {
      expect(event.properties).toMatchObject({ token: "phc_e2e", distinct_id: "1", $is_identified: true, $process_person_profile: true, invitation_id: 501, invitation_type: "LINK" });
      expect(Object.keys(event.properties).sort()).toEqual([
        "$is_identified", "$process_person_profile", "distinct_id", "invitation_id", "invitation_type", "token",
        ...(event.event !== "invitation_accept_attempted" ? ["group_id"] : []),
        ...(event.event === "invitation_viewed" ? ["status"] : [])
      ].sort());
    }
    expect(JSON.stringify(events)).not.toMatch(/A{43}|invitations\/link|\$current_url|\$referrer|crewName|\$set|\$snapshot/);
    expect(analyticsRequests.every(path => path === "/e/" || path.startsWith("/i/v0/e"))).toBe(true);
    await test.info().attach("invitation-events", { body: Buffer.from(JSON.stringify(events, null, 2)), contentType: "application/json" });
  });
}
