import { expect, test } from "playwright/test";

import { installApiFixture } from "./api-fixture.js";

const returnTargetStorageKey = "jarihana:auth:return-target";

function watchBrowserFailures(page, expectedFetchFailures = []) {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const locationUrl = message.location().url;
    const expectedFailure = expectedFetchFailures.some(({ path, status }) => {
      const responsePattern = new RegExp(`Failed to load resource.*status.*${status}`, "i");
      return (
        locationUrl &&
        new URL(locationUrl).pathname === path &&
        responsePattern.test(message.text())
      );
    });
    if (!expectedFailure) failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}


test(
  "anonymous deep link preserves continuation and stubs GitHub OAuth",
  { tag: "@core" },
  async ({ page }) => {
    const browserFailures = watchBrowserFailures(page, [
      { path: "/api/members/me", status: 401 },
      { path: "/api/auth/refresh", status: 401 }
    ]);
    const state = await installApiFixture(page, { auth: "anonymous" });

    await page.goto("/my/registrations?status=PENDING");
    await expect(page).toHaveURL(/\/groups$/);
    await expect(
      page.getByRole("heading", { name: "크루와 함께할 자리를 찾아보세요" })
    ).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), returnTargetStorageKey)).toBe(
      "/my/registrations?status=PENDING"
    );

    await page.getByRole("button", { name: "GitHub로 로그인" }).click();
    await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);
    await expect(page.getByRole("heading", { name: "Stub GitHub OAuth" })).toBeVisible();
    expect(browserFailures).toEqual([]);
    expect(state.unexpectedResponses).toEqual([]);
  }
);

test(
  "signup-required continuation submits exact member payload",
  { tag: "@core" },
  async ({ page }) => {
    const browserFailures = watchBrowserFailures(page);
    const state = await installApiFixture(page, { auth: "signup-required" });
    await page.addInitScript(
      ([key, value]) => {
        sessionStorage.setItem(key, value);
      },
      [returnTargetStorageKey, "/my/registrations"]
    );

    await page.goto("/signup");
    const crewOption = page.getByRole("radio", { name: "크루" });
    const coachOption = page.getByRole("radio", { name: "코치" });
    await expect(crewOption).toBeVisible();
    await expect(coachOption).toBeVisible();
    await expect(page.getByText("안녕하세요. 크루인가요? 코치인가요?")).toBeVisible();

    await coachOption.click();
    await expect(page.locator(".signup-form__profile-panel")).toBeVisible();
    await expect(page.getByText("안녕하세요 코치님 프로필을 입력해주세요")).toBeVisible();

    await page.getByRole("button", { name: "유형 변경" }).click();
    await expect(crewOption).toBeVisible();
    await crewOption.click();
    await expect(page.locator(".signup-form__profile-panel")).toBeVisible();
    await expect(page.getByText("안녕하세요 크루님 프로필을 작성해주세요")).toBeVisible();

    await page.getByLabel("크루 이름").fill("자리");
    await page.getByLabel("과정").selectOption("FRONTEND");
    await page.getByLabel("기수").selectOption("8");
    await page.getByRole("button", { name: "가입 완료하기" }).click();
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page).toHaveURL(/\/my$/);
    const signupRequest = state.requests.find(
      (request) => request.method === "POST" && request.path === "/members"
    );
    expect(signupRequest?.postData).toEqual({
      course: "FRONTEND",
      crewName: "자리",
      generation: 8,
      memberType: "CREW"
    });
    expect(browserFailures).toEqual([]);
    expect(state.unexpectedResponses).toEqual([]);
  }
);

test(
  "anonymous protected navigation gives login feedback without a silent round trip",
  { tag: "@core" },
  async ({ page }) => {
    const state = await installApiFixture(page, { auth: "anonymous" });
    await page.goto("/groups");

    await page.getByRole("button", { name: "모임 만들기", exact: true }).click();

    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByText("로그인이 필요한 기능이에요", { exact: true })).toBeVisible();
    await expect(page.getByText("로그인한 뒤 모임을 만들 수 있어요.", { exact: true })).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), returnTargetStorageKey)).toBe(
      "/groups/new"
    );
    expect(state.unexpectedResponses).toEqual([]);
  }
);

test(
  "registration can be created and withdrawn through confirmation dialogs",
  { tag: "@core" },
  async ({ page }) => {
    const state = await installApiFixture(page);
    await page.goto("/groups/10/recruitments/20");
    await page.getByLabel("가입 신청 메시지").fill("함께 공부하고 싶어요.");
    await page.getByRole("button", { name: "가입 신청하기" }).click();
    await expect(page.getByRole("dialog", { name: "가입 신청을 보낼까요?" })).toBeVisible();
    await page.getByRole("button", { name: "신청 확정" }).click();
    await expect(page.getByText("신청을 보냈어요.")).toBeVisible();

    await page.goto("/my/registrations");
    const trigger = page.getByRole("button", { name: "신청 철회" });
    await trigger.focus();
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "신청을 철회할까요?" })).toBeVisible();
    await page.getByRole("button", { name: "철회하기" }).click();
    await expect(page.getByRole("heading", { name: "신청 목록" })).toBeFocused();
    await expect(page.getByText("신청을 철회했어요")).toBeVisible();
    expect(state.unexpectedResponses).toEqual([]);
  }
);

test(
  "group creation and edit lifecycle mutations use server contracts",
  { tag: "@core" },
  async ({ page }) => {
    const state = await installApiFixture(page);
    await page.goto("/groups/new");
    await page.getByLabel("모임 이름").fill("새 모임");
    await page.getByLabel("한 줄 소개").fill("새로운 배움의 자리");
    await page.getByLabel("모임 소개").fill("함께 오래 공부합니다.");
    await page.getByRole("button", { name: "모임 만들기" }).click();
    await expect(page).toHaveURL(/\/groups\/10$/);

    await page.goto("/groups/10/manage");
    await page.getByLabel("한 줄 소개").fill("수정한 소개입니다.");
    await page.getByRole("button", { name: "모임 수정하기" }).click();
    await expect
      .poll(
        () =>
          state.requests.filter(
            (request) => request.method === "PUT" && request.path === "/groups/10"
          ).length
      )
      .toBe(1);
    expect(state.unexpectedResponses).toEqual([]);
  }
);

test(
  "leader transfers leadership, closes recruitment, and decides registration",
  { tag: "@core" },
  async ({ page }) => {
    const state = await installApiFixture(page);

    await page.goto("/groups/10/manage/members");
    await page.getByRole("button", { name: "하나 관리 메뉴" }).click();
    await page.getByRole("menuitem", { name: "모임장 넘기기" }).click();
    await page.getByRole("button", { name: "모임장 넘기기", exact: true }).click();
    await expect
      .poll(() =>
        state.requests.some(
          (request) => request.method === "PUT" && request.path === "/groups/10/leader"
        )
      )
      .toBe(true);

    await page.goto("/groups/10/manage/recruitments");
    await page.getByRole("button", { name: "모집 마감하기", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "예", exact: true }).click();
    await expect
      .poll(() =>
        state.requests.some(
          (request) => request.method === "PATCH" && request.path === "/groups/10/recruitments/20"
        )
      )
      .toBe(true);

    await page.goto("/groups/10/manage/recruitments/20/registrations");
    await page.getByRole("button", { name: "승인", exact: true }).first().click();
    await page.getByRole("button", { name: "신청 승인하기" }).click();
    const decision = state.requests.find(
      (request) =>
        request.method === "PATCH" && request.path === "/recruitments/20/registrations/40"
    );
    expect(decision?.postData).toEqual({ status: "APPROVED" });
    expect(state.unexpectedResponses).toEqual([]);
  }
);

for (const failure of [
  { expected: "권한", name: "403", status: 403 },
  { expected: "찾을 수 없어요", name: "404", status: 404 },
  { expected: "불러오지 못했어요", name: "network", status: 0 }
]) {
  test(
    `${failure.name} group failure exposes a recoverable state`,
    { tag: "@core" },
    async ({ page }) => {
      const browserFailures = watchBrowserFailures(
        page,
        [403, 404].includes(failure.status)
          ? [{ path: "/api/groups/10", status: failure.status }]
          : []
      );
      const state = await installApiFixture(page, {
        errorPath: "/api/groups/10",
        errorStatus: failure.status
      });
      await page.goto("/groups/10/manage");
      await expect(page.getByText(failure.expected, { exact: false }).first()).toBeVisible();
      const retry = page.getByRole("button", { name: "다시 시도" });
      if (await retry.count()) await expect(retry).toBeEnabled();
      await expect(page.locator("main")).toHaveCount(1);
      if (failure.status !== 0) expect(browserFailures).toEqual([]);
      expect(state.unexpectedResponses).toEqual([]);
    }
  );
}
