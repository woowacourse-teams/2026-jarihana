const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");
const { main } = require("./slack-review-notifications.cjs");

const RealDate = Date;
const originalFetch = global.fetch;
const originalSetTimeout = global.setTimeout;
const originalEnv = { ...process.env };
let directory;
let now;
let afterDelay;
let calendarUnavailable;
let githubCalls;
let slackMessages;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-business-day-test-"));
  now = RealDate.parse("2026-10-09T10:30:00+09:00");
  afterDelay = null;
  calendarUnavailable = false;
  githubCalls = [];
  slackMessages = [];
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  global.setTimeout = (callback) => {
    if (afterDelay) afterDelay();
    queueMicrotask(callback);
    return 0;
  };
  Object.assign(process.env, {
    GITHUB_REPOSITORY: "example/repo",
    GITHUB_TOKEN: "fixture-github-token",
    GITHUB_OUTPUT: path.join(directory, "output.txt"),
    RUNNER_TEMP: directory,
    DEFAULT_BRANCH: "main",
    SLACK_BOT_TOKEN: "fixture-slack-token",
    SLACK_REVIEW_CHANNEL_ID: "C123",
    SLACK_REVIEW_USER_IDS: JSON.stringify({ Sauter001: "U123" }),
    REVIEW_REMINDER: JSON.stringify({
      pr_number: 987,
      deadline_key: "20261008-1730",
      deadline_label: "2026-10-08 17:30 KST",
      reviewers: ["Sauter001"],
    }),
  });
  fs.writeFileSync(process.env.GITHUB_OUTPUT, "");
  const pr = {
    number: 987, state: "open", draft: false, body: "- 위험도: high",
    title: "이미지 정리 정책", html_url: "https://github.com/example/repo/pull/987",
    created_at: "2026-10-08T11:00:00+09:00",
    user: { login: "choubung" }, head: { sha: "current-head" },
    requested_reviewers: [{ login: "Sauter001" }],
  };
  global.fetch = async (raw, options = {}) => {
    const url = new URL(raw);
    let data;
    if (url.hostname === "date.nager.at") {
      if (calendarUnavailable) return { ok: false, status: 503 };
      const year = url.pathname.split("/").at(-2);
      data = [
        { date: year + "-01-01", global: true, types: ["Public"] },
        { date: year + "-10-09", global: true, types: ["Public"] },
      ];
    } else if (url.hostname === "slack.com") {
      slackMessages.push(JSON.parse(options.body));
      data = { ok: true };
    } else {
      assert.equal(url.hostname, "api.github.com");
      githubCalls.push(raw);
      if (url.pathname.endsWith("/actions/artifacts")) {
        data = { artifacts: [] };
      } else if (url.pathname.endsWith("/pulls")) {
        data = url.searchParams.get("base") === "develop" ? [pr] : [];
      } else if (url.pathname.endsWith("/pulls/987")) {
        data = pr;
      } else if (url.pathname.endsWith("/timeline")) {
        data = [{ event: "review_requested", created_at: pr.created_at, requested_reviewer: { login: "Sauter001" } }];
      } else if (url.pathname.endsWith("/reviews")) {
        data = [];
      } else if (url.pathname.endsWith("/files")) {
        data = [{ filename: "backend/src/main/java/com/project/jarihana/group/GroupService.java" }];
      } else {
        throw new Error("Unexpected business-day fixture request " + raw);
      }
    }
    return { ok: true, json: async () => data };
  };
});

afterEach(() => {
  global.Date = RealDate;
  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;
  process.env = { ...originalEnv };
  fs.rmSync(directory, { recursive: true, force: true });
});

const output = () => fs.readFileSync(process.env.GITHUB_OUTPUT, "utf8");
const markerExists = () => fs.existsSync(path.join(directory, "slack-review-reminder.json"));

for (const [label, instant] of [
  ["holiday", "2026-10-09T10:30:00+09:00"],
  ["weekend", "2026-10-10T10:30:00+09:00"],
]) {
  test("deadline scan skips overdue PRs on a " + label, async () => {
    now = RealDate.parse(instant);
    await main("deadline-scan");
    assert.match(output(), /has_reminders=false/);
    assert.match(output(), /matrix=\{"include":\[\]\}/);
    assert.equal(githubCalls.length, 0);
    assert.equal(slackMessages.length, 0);
  });

  test("deadline delivery skips a " + label + " without saving a sent marker", async () => {
    now = RealDate.parse(instant);
    await main("deadline-notification");
    assert.match(output(), /sent=false/);
    assert.equal(githubCalls.length, 0);
    assert.equal(slackMessages.length, 0);
    assert.equal(markerExists(), false);
  });
}

test("the business-day guard uses the KST date rather than the UTC date", async () => {
  now = RealDate.parse("2026-10-08T16:30:00Z");
  await main("deadline-scan");
  assert.match(output(), /has_reminders=false/);
  assert.equal(githubCalls.length, 0);
});

test("a missed overdue reminder can still be selected on the next business day", async () => {
  now = RealDate.parse("2026-10-12T10:30:00+09:00");
  await main("deadline-scan");
  assert.match(output(), /has_reminders=true/);
  assert.match(output(), /"pr_number":987/);
  assert.equal(slackMessages.length, 0);
});

test("business-day delivery sends one mention and saves a marker", async () => {
  now = RealDate.parse("2026-10-12T10:30:00+09:00");
  await main("deadline-notification");
  assert.match(output(), /sent=true/);
  assert.equal(slackMessages.length, 1);
  assert.match(slackMessages[0].text, /<@U123>/);
  assert.equal(markerExists(), true);
});

test("a job crossing midnight into a holiday rechecks before posting", async () => {
  now = RealDate.parse("2026-10-08T23:59:59+09:00");
  afterDelay = () => { now = RealDate.parse("2026-10-09T00:00:01+09:00"); };
  await main("deadline-notification");
  assert.match(output(), /sent=false/);
  assert.equal(slackMessages.length, 0);
  assert.equal(markerExists(), false);
});

for (const mode of ["deadline-scan", "deadline-notification"]) {
  test(mode + " does not guess a working day when the current calendar is unavailable", async () => {
    now = RealDate.parse("2028-01-03T10:30:00+09:00");
    calendarUnavailable = true;
    await assert.rejects(main(mode), /Korean public-holiday calendar returned 503 for 2028/);
    assert.equal(githubCalls.length, 0);
    assert.equal(slackMessages.length, 0);
    assert.equal(markerExists(), false);
  });
}
