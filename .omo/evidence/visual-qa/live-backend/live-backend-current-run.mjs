import { chromium } from "/Users/ohjonghyuk0717/Desktop/jarihana/frontend/node_modules/playwright/index.mjs";
import fs from "node:fs/promises";

const base = "http://127.0.0.1:4175";
const evidenceDir = "/Users/ohjonghyuk0717/Desktop/jarihana/.omo/evidence/visual-qa/live-backend";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
const observedResponses = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url });
});
page.on("requestfailed", (request) => {
  failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? "unknown" });
});
page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/") || url.includes("/images/")) observedResponses.push({ url, status: response.status(), ok: response.ok() });
});

async function metrics() {
  return page.evaluate(() => {
    const images = [...document.images].map((image) => ({ src: image.getAttribute("src"), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));
    return {
      route: location.pathname + location.search,
      viewport: { width: innerWidth, height: innerHeight },
      visibleCount: document.querySelectorAll(".groups-grid .ui-group-card").length,
      visibleNames: [...document.querySelectorAll(".groups-grid .ui-group-card__title")].map((element) => element.textContent?.trim()),
      heading: document.querySelector("#group-title")?.textContent?.trim() ?? null,
      emptyState: document.body.innerText.includes("조건에 맞는 모임이 아직 없어요"),
      errorState: Boolean(document.querySelector('[role="alert"]')),
      brokenImages: images.filter((image) => image.naturalWidth === 0),
      imageCount: images.length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
      scrollWidths: { document: document.documentElement.scrollWidth, body: document.body.scrollWidth }
    };
  });
}

const result = { capturedAt: new Date().toISOString(), scenarios: {}, observedResponses, consoleErrors, failedRequests };
await page.goto(`${base}/groups`);
await page.waitForSelector(".groups-grid .ui-group-card", { timeout: 10000 });
await page.waitForTimeout(1000);
result.scenarios.groups1440 = await metrics();
await page.screenshot({ path: `${evidenceDir}/groups-1440-clean.png`, fullPage: false });

await page.getByRole("searchbox", { name: "모임 검색" }).fill("Spring Boot");
await page.getByRole("button", { name: "검색", exact: true }).click();
await page.waitForURL(/keyword=Spring\+Boot/);
await page.waitForTimeout(800);
result.scenarios.search = await metrics();

await page.goto(`${base}/groups`);
await page.waitForSelector(".groups-grid .ui-group-card", { timeout: 10000 });
await page.getByRole("button", { name: "스터디", exact: true }).click();
await page.waitForURL(/type=STUDY/);
await page.waitForTimeout(800);
result.scenarios.typeFilter = await metrics();

await page.goto(`${base}/groups`);
await page.waitForSelector(".groups-grid .ui-group-card", { timeout: 10000 });
await page.locator(".groups-grid a").first().click();
await page.waitForURL(/\/groups\/1$/);
await page.waitForSelector("#group-title", { timeout: 10000 });
await page.waitForTimeout(800);
result.scenarios.detail = await metrics();
await page.reload();
await page.waitForSelector("#group-title", { timeout: 10000 });
await page.waitForTimeout(800);
result.scenarios.detailReload = await metrics();
await page.screenshot({ path: `${evidenceDir}/group-detail-1440-clean.png`, fullPage: false });

await page.getByRole("link", { name: /목록으로/ }).click();
await page.waitForURL(/\/groups$/);
await page.getByRole("searchbox", { name: "모임 검색" }).fill("___qa-no-match___");
await page.getByRole("button", { name: "검색", exact: true }).click();
await page.waitForURL(/qa-no-match/);
await page.waitForTimeout(800);
result.scenarios.noMatch = await metrics();

await page.setViewportSize({ width: 360, height: 1000 });
await page.goto(`${base}/groups`);
await page.waitForSelector(".groups-grid .ui-group-card", { timeout: 10000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
result.scenarios.groups360 = await metrics();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${evidenceDir}/groups-360-clean.png`, fullPage: false });

await page.goto(`${base}/groups/1`);
await page.waitForSelector("#group-title", { timeout: 10000 });
await page.waitForTimeout(1000);
result.scenarios.detail360 = await metrics();
await page.screenshot({ path: `${evidenceDir}/group-detail-360-clean.png`, fullPage: false });

result.observedResponses = observedResponses;
result.consoleErrors = consoleErrors;
result.failedRequests = failedRequests;
await fs.writeFile(`${evidenceDir}/current-run.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
