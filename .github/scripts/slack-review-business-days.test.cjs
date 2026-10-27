const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");
const { main, calculateDeadlines } = require("./slack-review-notifications.cjs");

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
let pr;
let reviews;
let artifacts;
let timeline;
let changedPaths;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-business-day-test-"));
  now = RealDate.parse("2026-10-09T14:00:00+09:00");
  afterDelay = null;
  calendarUnavailable = false;
  githubCalls = [];
  slackMessages = [];
  reviews = [];
  artifacts = [];
  timeline = null;
  changedPaths = ["backend/src/main/java/com/project/jarihana/group/GroupService.java"];
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
      deadline_key: "20261008-1400",
      deadline_label: "2026-10-08 14:00 KST",
      reviewers: ["Sauter001"],
    }),
  });
  fs.writeFileSync(process.env.GITHUB_OUTPUT, "");
  pr = {
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
        data = { artifacts };
      } else if (url.pathname.endsWith("/pulls")) {
        data = url.searchParams.get("base") === "develop" ? [pr] : [];
      } else if (url.pathname.endsWith("/pulls/987")) {
        data = pr;
      } else if (url.pathname.endsWith("/timeline")) {
        data = timeline || [{ event: "review_requested", created_at: pr.created_at, requested_reviewer: { login: "Sauter001" } }];
      } else if (url.pathname.endsWith("/reviews")) {
        data = reviews;
      } else if (url.pathname.endsWith("/files")) {
        data = changedPaths.map((filename) => ({ filename }));
      } else if (url.pathname.endsWith("/collaborators/Sauter001/permission")) {
        data = { permission: "write" };
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

test("slot boundaries distinguish required and recommended deadlines and skip holidays", async () => {
  for (const [created, expected] of [
    ["2026-10-08T13:59:59+09:00", [["2026-10-08", "14:00", "required"]]],
    ["2026-10-08T14:00:00+09:00", [["2026-10-08", "22:00", "recommended"], ["2026-10-12", "14:00", "required"]]],
    ["2026-10-08T21:59:59+09:00", [["2026-10-08", "22:00", "recommended"], ["2026-10-12", "14:00", "required"]]],
    ["2026-10-08T22:00:00+09:00", [["2026-10-12", "14:00", "required"]]],
    ["2026-10-09T15:00:00+09:00", [["2026-10-12", "14:00", "required"]]],
  ]) {
    const deadlines = await calculateDeadlines(created);
    assert.deepEqual(deadlines.map(({ date, time, kind }) => [date, time, kind]), expected);
  }
});

test("an afternoon PR gets an optional 22:00 reminder and a distinct mandatory next-business-day reminder", async () => {
  pr.created_at = "2026-10-08T15:00:00+09:00";
  now = RealDate.parse("2026-10-08T22:00:00+09:00");
  await main("deadline-scan");
  assert.match(output(), /20261008-2200/);
  assert.doesNotMatch(output(), /20261012-1400/);
  process.env.REVIEW_REMINDER = JSON.stringify({ pr_number: 987, deadline_key: "20261008-2200", deadline_label: "2026-10-08 22:00 KST", reviewers: ["Sauter001"] });
  await main("deadline-notification");
  assert.match(slackMessages[0].text, /권장 리뷰 시각입니다 \(필수 아님\)/);

  fs.writeFileSync(process.env.GITHUB_OUTPUT, "");
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  await main("deadline-scan");
  assert.match(output(), /20261012-1400/);
  assert.doesNotMatch(output(), /20261008-2200/);
  process.env.REVIEW_REMINDER = JSON.stringify({ pr_number: 987, deadline_key: "20261012-1400", deadline_label: "2026-10-12 14:00 KST", reviewers: ["Sauter001"] });
  await main("deadline-notification");
  assert.match(slackMessages[1].text, /필수 리뷰 마감 시각입니다/);
});

test("an approval before the optional slot prevents the evening notification", async () => {
  pr.created_at = "2026-10-08T15:00:00+09:00";
  now = RealDate.parse("2026-10-08T22:00:00+09:00");
  reviews = [{ id: 1, state: "APPROVED", commit_id: pr.head.sha, submitted_at: "2026-10-08T12:00:00Z", user: { login: "Sauter001" } }];
  await main("deadline-scan");
  assert.match(output(), /has_reminders=false/);
  assert.equal(slackMessages.length, 0);
});

for (const [label, instant] of [
  ["holiday", "2026-10-09T14:00:00+09:00"],
  ["weekend", "2026-10-10T14:00:00+09:00"],
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

test("an invalid risk declaration alone requires a body correction rather than an approval reminder", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  pr.body = "- 위험도: low | medium | high";
  await main("deadline-scan");
  assert.match(output(), /has_reminders=false/);
  await main("deadline-notification");
  assert.match(output(), /sent=false/);
  assert.equal(slackMessages.length, 0);
});

test("a protected path still requires an approval reminder when the risk declaration is invalid", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  pr.body = "missing risk declaration";
  changedPaths = ["infra/review-policy.yml"];
  await main("deadline-scan");
  assert.match(output(), /has_reminders=true/);
});

test("an approval for the current head suppresses both scan and delivery", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  reviews = [{ id: 1, state: "APPROVED", commit_id: pr.head.sha, submitted_at: "2026-10-08T07:00:00Z", user: { login: "Sauter001" } }];
  await main("deadline-scan");
  assert.match(output(), /has_reminders=false/);
  await main("deadline-notification");
  assert.match(output(), /sent=false/);
  assert.equal(slackMessages.length, 0);
});

test("an approval for an older head does not suppress an overdue reminder", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  reviews = [{ id: 1, state: "APPROVED", commit_id: "older-head", submitted_at: "2026-10-08T07:00:00Z", user: { login: "Sauter001" } }];
  await main("deadline-scan");
  assert.match(output(), /has_reminders=true/);
});

test("a persisted reminder marker prevents another scan and delivery", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  artifacts = [{ name: "slack-review-reminder-pr-987-20261008-1400", expired: false, workflow_run: { head_branch: "main" } }];
  await main("deadline-scan");
  assert.match(output(), /has_reminders=false/);
  await main("deadline-notification");
  assert.match(output(), /sent=false/);
  assert.equal(slackMessages.length, 0);
});

test("a removed review request is not mentioned by a previously queued reminder", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  pr.requested_reviewers = [];
  timeline = [
    { event: "review_requested", created_at: pr.created_at, requested_reviewer: { login: "Sauter001" } },
    { event: "review_request_removed", created_at: "2026-10-08T08:00:00Z", requested_reviewer: { login: "Sauter001" } },
  ];
  await main("deadline-notification");
  assert.match(output(), /sent=false/);
  assert.equal(slackMessages.length, 0);
});

for (const state of ["closed", "draft", "low"]) {
  test("a queued reminder skips a PR that has become " + state, async () => {
    now = RealDate.parse("2026-10-12T14:00:00+09:00");
    if (state === "closed") pr.state = "closed";
    if (state === "draft") pr.draft = true;
    if (state === "low") pr.body = "- 위험도: low";
    await main("deadline-notification");
    assert.match(output(), /sent=false/);
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
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
  await main("deadline-scan");
  assert.match(output(), /has_reminders=true/);
  assert.match(output(), /"pr_number":987/);
  assert.equal(slackMessages.length, 0);
});

test("business-day delivery sends one mention and saves a marker", async () => {
  now = RealDate.parse("2026-10-12T14:00:00+09:00");
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
    now = RealDate.parse("2028-01-03T14:00:00+09:00");
    calendarUnavailable = true;
    await assert.rejects(main(mode), /Korean public-holiday calendar returned 503 for 2028/);
    assert.equal(githubCalls.length, 0);
    assert.equal(slackMessages.length, 0);
    assert.equal(markerExists(), false);
  });
}
