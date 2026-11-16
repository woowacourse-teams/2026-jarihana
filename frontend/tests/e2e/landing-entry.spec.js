import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

for (const width of [390, 1440]) {
  test(`public landing entry and browse at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installApiFixture(page, { auth: "anonymous" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/land$/);
    await expect(page.locator(".landing-page")).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator(".groups-page--home")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.goto("/groups");
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator(".landing-page")).toHaveCount(0);
    await page.getByRole("link", { name: "자리하나 홈" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator(".groups-page--home")).toBeVisible();
    await expect(page.locator(".landing-page")).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/groups$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/land$/);
    await expect(page.locator(".landing-page")).toBeVisible();
    await page.goto("/land");
    await expect(page.locator(".landing-page")).toBeVisible();
  });
}

test("members keep the current home and may explicitly open the landing", async ({ page }) => {
  await installApiFixture(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".groups-page--home")).toBeVisible();
  await expect(page.locator(".landing-page")).toHaveCount(0);
  await page.goto("/land");
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "GitHub로 시작하기" })).toHaveCount(0);
  const home = page.getByRole("banner").getByRole("link", { name: "홈으로 가기" });
  await expect(home).toHaveAttribute("href", "/home");
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator(".groups-page--home")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".landing-page")).toBeVisible();
  await page.getByRole("link", { name: /바로 참여를 신청해요/ }).click();
  await expect(page).toHaveURL(/\/land\/join$/);
  await expect(page.locator(".landing-page")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.goBack();
  await page.getByRole("link", { name: /오늘 바로 모임을 열 수 있어요/ }).click();
  await expect(page).toHaveURL(/\/land\/create$/);
  await expect(page.getByRole("link", { name: "모임 만들기", exact: true }).first()).toHaveAttribute("href", "/groups/new");
});

test("the demo-day landing has compact branding and an invitation after the credits", async ({ page }) => {
  const serviceHome = "https://jarihana.com/home";
  await installApiFixture(page, { auth: "anonymous" });

  await page.goto("/land", { waitUntil: "domcontentloaded" });
  await page.locator(".landing-page").waitFor();
  const regularLanding = await page.evaluate(() => ({
    header: Boolean(document.querySelector("header.landing-header")),
    footer: Boolean(document.querySelector("footer.landing-footer")),
    tech: Boolean(document.querySelector("#tech")),
    team: Boolean(document.querySelector(".landing-demoday")),
    heroActions: Boolean(document.querySelector(".landing-clubhouse__actions"))
  }));
  expect(regularLanding).toEqual({ header: true, footer: true, tech: true, team: false, heroActions: true });

  await page.goto("/land/demoday", { waitUntil: "domcontentloaded" });
  await page.locator(".landing-demoday").waitFor();
  const demodayLanding = await page.evaluate(() => {
    const team = document.querySelector(".landing-demoday");
    const invite = document.querySelector(".landing-demoday-invite");
    return {
      header: Boolean(document.querySelector("header.landing-header")),
      compactHeader: Boolean(document.querySelector("header.landing-demoday-header + main")),
      footer: Boolean(document.querySelector("footer.landing-footer")),
      compactFooter: Boolean(document.querySelector("main + footer.landing-demoday-footer")),
      tech: Boolean(document.querySelector("#tech")),
      heroActions: Boolean(document.querySelector(".landing-clubhouse__actions")),
      inviteFollowsTeam: invite.previousElementSibling === team,
      inviteIsLast: invite === document.querySelector("main#main-content > :last-child"),
      inviteLink: invite.querySelector("a")?.getAttribute("href"),
      links: Array.from(team.querySelectorAll("a"), (link) => link.href)
    };
  });
  expect(demodayLanding).toEqual({
    header: false,
    compactHeader: true,
    footer: false,
    compactFooter: true,
    tech: false,
    heroActions: false,
    inviteFollowsTeam: true,
    inviteIsLast: true,
    inviteLink: serviceHome,
    links: [
      "https://github.com/5jonyuk",
      "https://github.com/Sauter001",
      "https://github.com/choubung",
      "https://github.com/RealTake",
      "https://github.com/woowacourse-teams/2026-jarihana"
    ]
  });

  const shortcut = page.locator("#clubhouse").getByRole("link", { name: "자리하나? 바로가기", exact: true });
  await page.route(serviceHome, (route) => route.fulfill({ contentType: "text/plain", body: "자리하나 홈" }));
  await shortcut.click();
  await expect(page).toHaveURL(serviceHome);
});
