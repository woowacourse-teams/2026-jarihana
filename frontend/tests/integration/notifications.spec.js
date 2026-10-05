import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, chromium } from "playwright/test";

const origin = "http://127.0.0.1:4176";
const credentialsPath = process.env.WEB_PUSH_TEST_CREDENTIALS;
test.skip(!credentialsPath, "Requires isolated backend and local test member cookies.");
function credentials() { return JSON.parse(fs.readFileSync(credentialsPath, "utf8")); }
async function authenticate(context, name) {
  await context.addCookies([{ name: "accessToken", value: credentials()[name], url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function mutation(context, method, path, data) {
  await context.request.get("/api/groups");
  const csrf = (await context.cookies()).find((cookie) => cookie.name === "XSRF-TOKEN").value;
  const response = await context.request.fetch(`/api/${path}`, { method, data, headers: { "X-XSRF-TOKEN": csrf } });
  expect(response.ok(), `${method} ${path}: HTTP ${response.status()}`).toBe(true);
  return response.status() === 204 ? undefined : (await response.json()).data;
}
const seoulTime = (offset) => new Date(Date.now() + 9 * 3600000 + offset).toISOString().slice(0, 19);
async function businessFlow(browser) {
  const leader = await browser.newContext({ baseURL: origin });
  const applicant = await browser.newContext({ baseURL: origin });
  await authenticate(leader, "leader"); await authenticate(applicant, "applicant");
  const groupName = `웹푸시 검증 ${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const group = await mutation(leader, "POST", "groups", { type: "CLUB", name: groupName, introduction: "격리 DB의 테스트 모임", meetingType: "ONLINE" });
  const recruitment = await mutation(leader, "POST", `groups/${group.id}/recruitments`, {
    joinMethod: "APPROVAL", capacity: 5, startsAt: seoulTime(-3600000), endsAt: seoulTime(86400000)
  });
  const registration = await mutation(applicant, "POST", `recruitments/${recruitment.id}/registrations`, { message: "웹푸시 검증 신청" });
  return { leader, applicant, group, groupName, recruitment, registration };
}
test("real business APIs create inbox rows; click, read-all, delete and logout use real backend", async ({ browser }) => {
  const flow = await businessFlow(browser);
  try {
    const page = await flow.leader.newPage(); await page.goto(`${origin}/notifications`);
    await expect(page.getByRole("list", { name: "받은 알림 목록" }).getByRole("listitem")).not.toHaveCount(0);
    const notifications = (await (await flow.leader.request.get("/api/notifications?size=100")).json()).data.items;
    const submitted = notifications.find((item) => item.target.recruitmentId === flow.recruitment.id);
    expect(submitted.eventType).toBe("REGISTRATION_SUBMITTED");
    expect(submitted.body).toContain(flow.groupName);
    await page.goto(`${origin}/notifications/open/${submitted.id}`);
    await expect(page).toHaveURL(new RegExp(`/groups/${flow.group.id}$`));
    await mutation(flow.leader, "PATCH", `recruitments/${flow.recruitment.id}/registrations/${flow.registration.id}`, { status: "APPROVED" });
    const inbox = await flow.applicant.newPage(); await inbox.goto(`${origin}/notifications`);
    const rows = inbox.getByRole("list", { name: "받은 알림 목록" }).getByRole("listitem");
    await expect(rows).not.toHaveCount(0);
    const approved = (await (await flow.applicant.request.get("/api/notifications?size=100")).json()).data.items.find((item) => item.target.recruitmentId === flow.recruitment.id);
    expect(approved.eventType).toBe("REGISTRATION_APPROVED");
    expect(approved.body).toContain(flow.groupName);
    const before = await rows.count();
    await inbox.getByRole("button", { name: "전체 읽음", exact: true }).click();
    await expect(inbox.getByText("안 읽음", { exact: true })).toHaveCount(0); await expect(rows).toHaveCount(before);
    const row = rows.filter({ has: inbox.locator(`a[href='/notifications/open/${approved.id}']`) });
    await row.getByRole("button", { name: /알림 삭제/ }).click(); await expect(row).toHaveCount(0);
    expect((await flow.applicant.request.get(`/api/notifications/${approved.id}`)).status()).toBe(404);
    await inbox.getByRole("button", { name: "프로필 메뉴" }).click();
    await inbox.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(inbox.getByRole("button", { name: "GitHub로 로그인" }).first()).toBeVisible();
    expect((await flow.applicant.request.get("/api/notifications")).status()).toBe(401);
  } finally { await flow.leader.close(); await flow.applicant.close(); }
});
test("PWA files have correct MIME; missing SW files do not return the SPA shell", async ({ request }) => {
  for (const [path, contentType] of [["/sw.js", "javascript"], ["/manifest.webmanifest", "manifest+json"], ["/icons/pwa-192.png", "image/png"], ["/icons/pwa-512.png", "image/png"]]) {
    const response = await request.get(path); expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(contentType); expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect((await request.get("/missing-sw.js")).status()).toBe(404);
});

test("real Chrome receives an external provider push and current-browser logout disconnects it", async () => {
  test.skip(process.env.WEB_PUSH_REAL_PROVIDER !== "1", "Explicit real-provider run required.");
  test.setTimeout(150_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jarihana-push-chrome-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, baseURL: origin,
    permissions: ["notifications"], ignoreDefaultArgs: ["--disable-background-networking"] });
  const browser = context.browser();
  let flow;
  try {
    await authenticate(context, "leader");
    const page = await context.newPage(); await page.goto(`${origin}/notifications`);
    const registeredResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/push-subscriptions" && response.request().method() === "POST");
    await page.getByRole("button", { name: "켜기", exact: true }).click();
    const registered = (await (await registeredResponse).json()).data;
    await expect(page.getByRole("button", { name: "끄기", exact: true })).toBeVisible({ timeout: 60_000 });
    flow = await businessFlow(browser);
    const inbox = (await (await context.request.get("/api/notifications?size=100")).json()).data.items;
    const notification = inbox.find((item) => item.target.recruitmentId === flow.recruitment.id);
    await expect.poll(() => page.evaluate(async (id) => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const notices = await registration.getNotifications({ tag: `jarihana:${id}` });
      return notices.some((notice) => notice.data?.notificationId === id && notice.title === "새 신청");
    }, notification.id), { timeout: 60_000 }).toBe(true);
    await page.getByRole("button", { name: "프로필 메뉴" }).click();
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.getByRole("button", { name: "GitHub로 로그인" }).first()).toBeVisible();
    const subscriptions = (await (await flow.leader.request.get("/api/push-subscriptions?size=100")).json()).data.items;
    expect(subscriptions.find((item) => item.id === registered.id)?.enabled).toBe(false);
    expect(await page.evaluate(async () => Boolean(await (await navigator.serviceWorker.getRegistration("/")).pushManager.getSubscription()))).toBe(false);
  } finally {
    await flow?.leader.close(); await flow?.applicant.close(); await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
