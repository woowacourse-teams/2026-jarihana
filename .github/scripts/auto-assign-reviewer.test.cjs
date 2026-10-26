const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");
const { main } = require("./auto-assign-reviewer.cjs");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let directory;
let requests;
let currentRequests;
let failRequest;
let changedPaths;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-assignment-test-"));
  process.env.GITHUB_EVENT_PATH = path.join(directory, "event.json");
  process.env.GITHUB_OUTPUT = path.join(directory, "output.txt");
  process.env.REVIEW_OWNERS_PATH = path.join(__dirname, "../../docs/repository-conventions/review-owners.yml");
  process.env.GITHUB_REPOSITORY = "example/repo";
  process.env.GITHUB_TOKEN = "fixture-token";
  fs.writeFileSync(process.env.GITHUB_OUTPUT, "");
  requests = [];
  currentRequests = [];
  failRequest = false;
  changedPaths = ["backend/src/main/java/com/project/jarihana/group/command/GroupService.java"];
  global.fetch = async (raw, options) => {
    const url = new URL(raw);
    let data;
    if (options.method === "POST") {
      if (failRequest) return { ok: false, status: 422, json: async () => ({ message: "fixture failure" }) };
      requests.push(JSON.parse(options.body));
      data = {};
    } else if (url.pathname.endsWith("/files")) {
      data = changedPaths.map((filename) => ({ filename }));
    } else if (url.pathname.endsWith("/requested_reviewers")) {
      data = { users: currentRequests.map((login) => ({ login })), teams: [] };
    } else {
      throw new Error("Unexpected fixture request " + raw);
    }
    return { ok: true, json: async () => data };
  };
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  fs.rmSync(directory, { recursive: true, force: true });
});

function event(risk, recommendation) {
  fs.writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify({
    pull_request: {
      number: 987,
      draft: false,
      body: "- 위험도: " + risk + (recommendation ? "\n- 자동 배정 리뷰어: @" + recommendation : ""),
      user: { login: "choubung" },
    },
  }));
}
const output = () => fs.readFileSync(process.env.GITHUB_OUTPUT, "utf8");

test("successful high-risk assignment emits the actual backup reviewer for direct Slack delivery", async () => {
  event("high");
  await main();
  assert.deepEqual(requests, [{ reviewers: ["Sauter001"] }]);
  assert.equal(output(), "assigned_reviewer=Sauter001\n");
});

test("low and medium PRs do not emit an assignment notification", async () => {
  for (const risk of ["low", "medium"]) {
    event(risk);
    await main();
  }
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

test("an existing review request does not emit a duplicate assignment notification", async () => {
  event("high");
  currentRequests = ["Sauter001"];
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

test("failed review requests cannot emit a misleading assignment notification", async () => {
  event("high");
  failRequest = true;
  await assert.rejects(main(), /fixture failure/);
  assert.equal(output(), "");
});

test("a mapped module mixed with unowned backend code is not guessed", async () => {
  event("high");
  changedPaths.push("backend/src/main/java/com/project/jarihana/notificationdelivery/Worker.java");
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

test("an unowned path cannot be hidden by file ordering or a shared configuration file", async () => {
  event("high");
  changedPaths.unshift("backend/src/main/resources/application-prod.yaml");
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

test("a module and its corresponding Java tests still select the same backup", async () => {
  event("high");
  changedPaths.push("backend/src/test/java/com/project/jarihana/group/command/GroupServiceTest.java");
  await main();
  assert.deepEqual(requests, [{ reviewers: ["Sauter001"] }]);
});

test("tests from an unowned module cannot be ignored during fallback", async () => {
  event("high");
  changedPaths.push("backend/src/test/java/com/project/jarihana/notificationdelivery/WorkerTest.java");
  await main();
  assert.equal(requests.length, 0);
});

test("two mapped modules without an explicit recommendation remain unassigned", async () => {
  event("high");
  changedPaths.push("backend/src/main/java/com/project/jarihana/registration/RegistrationService.java");
  await main();
  assert.equal(requests.length, 0);
});

test("an explicit team recommendation can resolve mixed mapped and unowned code", async () => {
  event("high", "RealTake");
  changedPaths.push("backend/src/main/java/com/project/jarihana/notificationdelivery/Worker.java");
  await main();
  assert.deepEqual(requests, [{ reviewers: ["RealTake"] }]);
});

test("the workflow directly consumes assignment output rather than waiting for another event", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "../workflows/auto-assign-reviewer.yml"), "utf8");
  assert.match(workflow, /assigned_reviewer: \$\{\{ steps\.assign\.outputs\.assigned_reviewer \}\}/);
  assert.match(workflow, /needs: assign-reviewer/);
  assert.match(workflow, /if: needs\.assign-reviewer\.outputs\.assigned_reviewer != ''/);
  assert.match(workflow, /ASSIGNED_REVIEWER: \$\{\{ needs\.assign-reviewer\.outputs\.assigned_reviewer \}\}/);
  assert.match(workflow, /run: node \.github\/scripts\/slack-review-notifications\.cjs assigned/);
  assert.match(workflow, /cancel-in-progress: false/);
});
