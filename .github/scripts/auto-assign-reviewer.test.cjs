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
let reviews;
let reviewerPermission;
let approvalReadFails;
let permissionReadFails;
let currentHead;

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
  reviews = [];
  reviewerPermission = "write";
  approvalReadFails = false;
  permissionReadFails = false;
  currentHead = "current-head";
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
    } else if (url.pathname.endsWith("/pulls/987")) {
      const pull = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).pull_request;
      data = { ...pull, state: "open", head: { sha: currentHead } };
    } else if (url.pathname.endsWith("/reviews")) {
      if (approvalReadFails) return { ok: false, status: 503, json: async () => ({ message: "review lookup failed" }) };
      data = reviews;
    } else if (url.pathname.endsWith("/permission")) {
      if (permissionReadFails) return { ok: false, status: 503, json: async () => ({ message: "permission lookup failed" }) };
      data = { permission: reviewerPermission };
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

function event(risk, recommendation, metadata = {}) {
  fs.writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify({
    ...metadata,
    pull_request: {
      number: 987,
      draft: false,
      body: "- 위험도: " + risk + (recommendation ? "\n- 자동 배정 리뷰어: @" + recommendation : ""),
      user: { login: "choubung" },
      head: { sha: "event-head" },
    },
  }));
}
const output = () => fs.readFileSync(process.env.GITHUB_OUTPUT, "utf8");

function submittedReview(overrides = {}) {
  return { id: 1, state: "APPROVED", commit_id: currentHead, submitted_at: "2026-10-26T01:00:00Z", user: { login: "Sauter001" }, ...overrides };
}

test("a valid approval on the live PR head prevents another request and Slack output", async () => {
  event("high", "RealTake", { action: "edited", changes: { body: { from: "old body" } } });
  reviews = [submittedReview()];
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

for (const scenario of ["stale", "author", "dismissed", "read-only", "superseded"]) {
  test("a " + scenario + " approval does not suppress a required reviewer request", async () => {
    event("high");
    reviews = [submittedReview()];
    if (scenario === "stale") reviews[0].commit_id = "event-head";
    if (scenario === "author") reviews[0].user.login = "choubung";
    if (scenario === "dismissed") reviews[0].state = "DISMISSED";
    if (scenario === "read-only") reviewerPermission = "read";
    if (scenario === "superseded") reviews.push(submittedReview({ id: 2, state: "CHANGES_REQUESTED", submitted_at: "2026-10-26T02:00:00Z" }));
    await main();
    assert.deepEqual(requests, [{ reviewers: ["Sauter001"] }]);
  });
}

test("another valid reviewer approval still suppresses a new request", async () => {
  event("high", "RealTake");
  reviews = [submittedReview({ state: "DISMISSED" }), submittedReview({ id: 2, user: { login: "5jonyuk" } })];
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

for (const lookup of ["review", "permission"]) {
  test("a failed " + lookup + " lookup cannot create an unnecessary request", async () => {
    event("high");
    reviews = [submittedReview()];
    approvalReadFails = lookup === "review";
    permissionReadFails = lookup === "permission";
    await assert.rejects(main(), /lookup failed/);
    assert.equal(requests.length, 0);
    assert.equal(output(), "");
  });
}

test("a title-only edit cannot request a reviewer or emit a Slack output", async () => {
  event("high", "Sauter001", { action: "edited", changes: { title: { from: "old title" } } });
  global.fetch = async () => { throw new Error("A title edit must not read or write GitHub data"); };
  await main();
  assert.equal(requests.length, 0);
  assert.equal(output(), "");
});

for (const field of ["body", "base"]) {
  test("a title edit accompanied by a " + field + " edit still evaluates assignment", async () => {
    event("high", "Sauter001", { action: "edited", changes: { title: { from: "old title" }, [field]: { from: "old value" } } });
    await main();
    assert.deepEqual(requests, [{ reviewers: ["Sauter001"] }]);
  });
}

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
