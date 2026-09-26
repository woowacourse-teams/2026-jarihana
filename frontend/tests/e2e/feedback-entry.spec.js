import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const loginPrompt = "로그인이 필요한 서비스예요";

for (const { surface, width } of [
  { surface: "desktop header", width: 1280 },
  { surface: "mobile menu", width: 390 },
  { surface: "footer", width: 1280 }
]) {
  test(`shows a login-required dialog without redirecting from the ${surface}`, async ({ page }) => {
    const state = await installApiFixture(page, { auth: "anonymous" });
    await page.setViewportSize({ height: 900, width });
    await page.goto("/groups");

    if (surface === "mobile menu") {
      await page.getByRole("button", { name: "메뉴 열기" }).click();
      await page
        .getByRole("navigation", { name: "모바일 메뉴" })
        .getByRole("button", { name: "피드백 남기기" })
        .click();
    } else if (surface === "footer") {
      const contact = page.getByRole("region", { name: "Contact us" });
      await contact.scrollIntoViewIfNeeded();
      await contact.getByRole("button", { name: "피드백 남기기" }).click();
    } else {
      await page
        .getByRole("navigation", { name: "주요 메뉴" })
        .getByRole("button", { name: "피드백 남기기" })
        .click();
    }

    await expect(page.getByRole("dialog", { name: loginPrompt })).toBeVisible();
    await expect(page.getByText("피드백을 남기려면 로그인해 주세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인하러 가기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toHaveCount(0);
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog", { name: loginPrompt })).toHaveCount(0);
    expect(state.unexpectedResponses).toEqual([]);
  });
}

test("returns from login and opens the feedback form automatically", async ({ page }) => {
  const state = await installApiFixture(page, { auth: "anonymous" });
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.route("https://github.com/login/oauth/authorize**", (route) =>
    route.fulfill({
      body: `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8"><title>Stub GitHub OAuth</title></head>
  <body><a href="http://127.0.0.1:4174/oauth/callback?code=mock">로그인 완료</a></body>
</html>`,
      contentType: "text/html"
    })
  );
  await page.goto("/groups");

  await page
    .getByRole("navigation", { name: "주요 메뉴" })
    .getByRole("button", { name: "피드백 남기기" })
    .click();
  await page.getByRole("button", { name: "로그인하러 가기" }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);

  state.auth = "authenticated";
  await page.getByRole("link", { name: "로그인 완료" }).click();

  await expect(page).toHaveURL(/\/groups\?feedback=open$/);
  await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page).not.toHaveURL(/feedback=open/);
  expect(state.unexpectedResponses).toEqual([]);
});
