const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");
const { main } = require("./slack-review-notifications.cjs");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let fixtureDirectory;
let slackMessages;

beforeEach(() => {
  fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "slack-review-test-"));
  process.env.GITHUB_EVENT_PATH = path.join(fixtureDirectory, "event.json");
  process.env.SLACK_BOT_TOKEN = "fixture-token";
  process.env.SLACK_REVIEW_CHANNEL_ID = "C123";
  process.env.SLACK_REVIEW_USER_IDS = JSON.stringify({ Sauter001: "U123", choubung: "U456" });
  delete process.env.ASSIGNED_REVIEWER;
  slackMessages = [];
  global.fetch = async (url, options) => {
    if (url.startsWith("https://date.nager.at/api/v3/PublicHolidays/")) {
      const year = url.split("/").at(-2);
      return { ok: true, json: async () => [{ date: year + "-01-01", global: true, types: ["Public"] }] };
    }
    assert.equal(url, "https://slack.com/api/chat.postMessage");
    slackMessages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});

function event(requestedReviewer) {
  fs.writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify({
    pull_request: {
      number: 123,
      title: "이미지 보존 <정책>",
      html_url: "https://github.com/example/repo/pull/123",
      body: "- 위험도: high",
      user: { login: "choubung" },
      created_at: "2026-10-26T11:00:00+09:00",
    },
    ...(requestedReviewer ? { requested_reviewer: { login: requestedReviewer } } : {}),
  }));
}

test("an assignment output sends one mention without a review_requested event", async () => {
  event();
  process.env.ASSIGNED_REVIEWER = "Sauter001";
  await main("assigned");
  assert.equal(slackMessages.length, 1);
  assert.equal(slackMessages[0].channel, "C123");
  assert.match(slackMessages[0].text, /<@U123>/);
  assert.match(slackMessages[0].text, /2026-10-26 14:00 KST/);
  assert.match(slackMessages[0].text, /&lt;정책&gt;/);
});

test("manual review requests still send one mention", async () => {
  event("Sauter001");
  await main("requested");
  assert.equal(slackMessages.length, 1);
  assert.match(slackMessages[0].text, /<@U123>/);
});

test("direct mode rejects a missing reviewer rather than silently dropping the alert", async () => {
  event();
  await assert.rejects(main("assigned"), /ASSIGNED_REVIEWER is required/);
  assert.equal(slackMessages.length, 0);
});

test("direct mode rejects an unmapped reviewer", async () => {
  event();
  process.env.ASSIGNED_REVIEWER = "UnknownReviewer";
  await assert.rejects(main("assigned"), /No Slack user mapping/);
  assert.equal(slackMessages.length, 0);
});

test("the PR author is never mentioned as their own reviewer", async () => {
  event();
  process.env.ASSIGNED_REVIEWER = "choubung";
  await main("assigned");
  assert.equal(slackMessages.length, 0);
});
