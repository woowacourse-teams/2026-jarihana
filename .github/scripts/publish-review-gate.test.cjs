const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { publishReviewGate } = require("./publish-review-gate.cjs");

const clone = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = {
    pull: {
      number: 987, state: "open", draft: false,
      body: "- 위험도: low", user: { login: "choubung" },
      head: { sha: "same-head" }, base: { ref: "develop", sha: "base" },
      html_url: "https://github.com/example/repo/pull/987",
    },
    reviews: [],
    checks: [{
      id: 1, name: "Conditional Review Gate",
      external_id: "conditional-review-gate:987:same-head",
      conclusion: "success",
    }],
    writes: [], errors: [], warnings: [], reads: 0,
  };
  const github = {
    paginate: async (fn, args) => fn(args),
    rest: {
      pulls: {
        list: async () => [{ number: 987 }],
        get: async () => {
          state.reads++;
          if (state.beforePullRead) state.beforePullRead(state);
          return { data: clone(state.pull) };
        },
        listFiles: async () => {
          assert.equal(state.checks[0].conclusion, "failure", "invalidate before fetching dependencies");
          if (state.fileError) throw new Error("fixture API outage");
          return [{ filename: "frontend/src/Home.jsx" }];
        },
        listReviews: async () => clone(state.reviews),
      },
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: "write" } }) },
      checks: {
        listForRef: async () => clone(state.checks),
        update: async (data) => {
          state.writes.push(clone(data));
          Object.assign(state.checks.find((check) => check.id === data.check_run_id), clone(data));
          return { data: clone(data) };
        },
        create: async (data) => {
          const check = { ...clone(data), id: 2 };
          state.checks.push(check);
          state.writes.push(clone(data));
          return { data: check };
        },
      },
    },
  };
  const core = {
    info() {},
    warning: (message) => state.warnings.push(message),
    setFailed: (message) => state.errors.push(message),
  };
  return { state, run: () => publishReviewGate({ github, core, context: { repo: { owner: "example", repo: "repo" } } }) };
}
function approval(state) {
  state.pull.body = "- 위험도: high";
  state.reviews = [{
    id: 10, state: "APPROVED", commit_id: "same-head",
    submitted_at: "2026-10-26T01:00:00Z", user: { login: "Sauter001" },
  }];
}

test("invalidates old success before evaluating a stable low-risk PR", async () => {
  const { state, run } = fixture();
  await run();
  assert.equal(state.writes[0].conclusion, "failure");
  assert.equal(state.writes.at(-1).conclusion, "success");
  assert.equal(state.writes.length, 2, "deduplicate PRs returned by both base lists");
});

test("a low-to-high body edit on the same head replaces success with failure", async () => {
  const { state, run } = fixture();
  await run();
  state.pull.body = "- 위험도: high";
  await run();
  assert.equal(state.checks[0].conclusion, "failure");
  assert.equal(state.checks[0].output.title, "Approval required");
});

test("dismissed approval on the same head replaces prior success", async () => {
  const { state, run } = fixture();
  approval(state);
  await run();
  assert.equal(state.checks[0].conclusion, "success");
  state.reviews[0].state = "DISMISSED";
  await run();
  assert.equal(state.checks[0].conclusion, "failure");
});

test("an API error after invalidation keeps the gate blocked", async () => {
  const { state, run } = fixture();
  state.fileError = true;
  await run();
  assert.equal(state.checks[0].conclusion, "failure");
  assert.equal(state.errors.length, 1);
  assert.equal(state.writes.some((write) => write.conclusion === "success"), false);
});

for (const mutation of ["body", "head", "review"]) {
  test("a " + mutation + " change during evaluation cannot publish stale success", async () => {
    const { state, run } = fixture();
    if (mutation === "review") approval(state);
    state.beforePullRead = (current) => {
      if (current.reads !== 2) return;
      if (mutation === "body") current.pull.body = "- 위험도: high";
      if (mutation === "head") current.pull.head.sha = "new-head";
      if (mutation === "review") current.reviews[0].state = "DISMISSED";
    };
    await run();
    assert.equal(state.checks[0].conclusion, "failure");
    assert.equal(state.checks[0].output.title, "Review policy inputs changed");
    assert.equal(state.writes.some((write) => write.conclusion === "success"), false);
  });
}

test("creates an initially blocked check when no previous result exists", async () => {
  const { state, run } = fixture();
  state.checks = [];
  await run();
  assert.equal(state.writes[0].conclusion, "failure");
  assert.equal(state.checks[0].conclusion, "success");
});

test("event configuration re-evaluates edits and review state using only trusted code", () => {
  const workflows = path.join(__dirname, "../workflows");
  const gate = fs.readFileSync(path.join(workflows, "conditional-review-gate.yml"), "utf8");
  const signal = fs.readFileSync(path.join(workflows, "review-policy-review-events.yml"), "utf8");
  assert.match(gate, /pull_request_target:\s+types: \[opened, reopened, synchronize, edited, ready_for_review\]/);
  assert.match(gate, /workflow_run:\s+workflows: \[Review Policy Review Events\]/);
  assert.match(gate, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(gate, /cancel-in-progress: false/);
  assert.match(signal, /types: \[submitted, edited, dismissed\]/);
  assert.match(signal, /permissions: \{\}/);
  assert.doesNotMatch(signal, /actions\/checkout|secrets\.|upload-artifact|download-artifact/);
});
