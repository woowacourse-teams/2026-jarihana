import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const signInPrompt = "피드백은 로그인 후 남길 수 있어요.";

for (const { surface, width } of [
  { surface: "desktop header", width: 1280 },
  { surface: "mobile menu", width: 390 },
  { surface: "footer", width: 1280 }
]) {
  test(`shows a sign-in prompt without redirecting from the ${surface}`, async ({ page }) => {
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

    await expect(page.getByText(signInPrompt)).toBeVisible();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole("dialog", { name: "피드백 남기기" })).toHaveCount(0);
    expect(state.unexpectedResponses).toEqual([]);
  });
}
