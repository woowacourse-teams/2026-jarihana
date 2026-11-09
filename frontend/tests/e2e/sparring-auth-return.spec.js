import { expect, test } from "playwright/test";
import { installApiFixture } from "./api-fixture.js";

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(90_000);

async function discussionFixture(page, auth = "anonymous") {
  const session = await installApiFixture(page, { auth });
  const topic = {
    id: 91, title: "복귀한 토론", a: "기다린다", b: "다른 곳으로 간다", description: "점심 토론",
    votesA: 0, votesB: 0, postCount: 0, revision: 1, mySide: null,
    createdAt: "2026-11-01T12:00:00", closesAt: null
  };
  const posts = [];
  const votes = [];
  const reply = (route, data) => route.fulfill({ json: { success: true, data, error: null } });
  await page.route("**/api/sparrings/91**", async route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname.endsWith("/events")) {
      return route.fulfill({
        contentType: "text/event-stream",
        body: `retry: 60000\nevent: snapshot\ndata: ${JSON.stringify({
          revision: topic.revision, votesA: topic.votesA, votesB: topic.votesB,
          postCount: posts.length, posts
        })}\n\n`
      });
    }
    if (pathname.endsWith("/votes")) {
      const { side } = request.postDataJSON();
      votes.push(side);
      topic.mySide = side;
      topic.votesA = side === "MINT" ? 1 : 0;
      topic.votesB = side === "CORAL" ? 1 : 0;
      topic.revision += 1;
      return route.fulfill({ status: 204 });
    }
    if (pathname.endsWith("/posts")) {
      if (request.method() === "POST") {
        const { text } = request.postDataJSON();
        const post = {
          id: posts.length + 1, authorId: 1, name: "자리", memberType: "CREW",
          side: topic.mySide, text, createdAt: "2026-11-05T12:00:00", replyTo: null
        };
        posts.push(post);
        return reply(route, { id: post.id });
      }
      return reply(route, {
        items: posts.filter(post => post.id > Number(searchParams.get("afterId") ?? 0)),
        nextCursor: null, hasNext: false
      });
    }
    return reply(route, { ...topic, mySide: session.auth === "authenticated" ? topic.mySide : null });
  });
  return { session, votes, posts };
}

async function expectArena(page) {
  await expect(page.locator(".sparring-detail__viewport")).toHaveAttribute("data-ready", "true", { timeout: 25_000 });
  const watch = page.getByRole("button", { name: "먼저 구경하기" });
  if (await watch.isVisible()) await watch.click();
  await expect(page.locator(".sparring-arena-frame")).not.toHaveAttribute("inert");
  const arena = page.frameLocator(".sparring-arena-frame");
  await expect(arena.locator("#scene canvas")).toBeVisible();
  await expect(arena.locator("#scene .fallback")).toHaveCount(0);
  return arena;
}

async function participate(page, state) {
  const arena = await expectArena(page);
  await arena.locator(".vote-flag[data-side=a]").click();
  await expect.poll(() => state.votes).toEqual(["MINT"]);
  await arena.getByRole("textbox", { name: /기다린다.*한마디/ }).fill("돌아와서 이어 쓰는 의견");
  await arena.locator("#send").click();
  await expect.poll(() => state.posts.map(post => post.text)).toEqual(["돌아와서 이어 쓰는 의견"]);
  await expect(arena.locator("#post-text")).toHaveText("돌아와서 이어 쓰는 의견");
}

test("shared discussion returns after new signup and remains usable after browser Back", async ({ page }) => {
  const state = await discussionFixture(page);
  const path = "/sparring/91?view=compact#discussion";
  await page.goto(path);
  await expectArena(page);
  await page.getByRole("banner").getByRole("button", { name: "GitHub로 로그인" }).click();
  await expect(page).toHaveURL(/github.com\/login\/oauth\/authorize/);
  state.session.auth = "signup-required";
  await page.evaluate(() => window.location.replace("http://127.0.0.1:4174/oauth/callback"));
  await expect(page).toHaveURL(/\/signup$/);
  expect(await page.evaluate(() => sessionStorage.getItem("jarihana:auth:return-target"))).toBe(path);
  await page.getByRole("radio", { name: /부트캠프/ }).click();
  await page.getByRole("radio", { name: "우아한테크코스" }).click();
  await page.getByRole("button", { name: "우테코 크루 인증" }).click();
  await page.getByRole("textbox", { name: "크루 이름" }).fill("자리");
  await page.getByRole("combobox", { name: "과정" }).selectOption("FRONTEND");
  await page.getByRole("combobox", { name: "기수" }).selectOption("3");
  await page.getByRole("button", { name: "가입 완료하기" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/sparring/91\\?view=compact#discussion$"));
  await expect(page.getByRole("banner").getByRole("button", { name: "프로필 메뉴" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("jarihana:auth:return-target"))).toBeNull();
  await expectArena(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/sparring/91\\?view=compact#discussion$"));
  await expect(page.getByRole("banner").getByRole("button", { name: "프로필 메뉴" })).toBeVisible();
  expect(state.votes).toEqual([]);
  expect(state.posts).toEqual([]);
  await participate(page, state);
});

for (const auth of ["anonymous", "authenticated"]) {
  test(`BFCache restoration rechecks ${auth} session and replaces the disposed WebGL arena`, async ({ page }) => {
    const state = await discussionFixture(page, auth);
    await page.goto("/sparring/91");
    const arena = await expectArena(page);
    const reads = state.session.memberProfileReads;
    await page.locator("iframe").evaluate(frame => { frame.dataset.beforeRestore = "true"; });
    await arena.locator("body").evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    state.session.auth = "authenticated";
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(() => state.session.memberProfileReads).toBeGreaterThan(reads);
    await expect(page.locator("iframe[data-before-restore]")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("button", { name: "프로필 메뉴" })).toBeVisible();
    await participate(page, state);
  });
}
