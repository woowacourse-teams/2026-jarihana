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
      conclusion: "success", check_suite: { id: 1 },
    }],
    suiteId: 2, nextCheckId: 2, writes: [], errors: [], warnings: [], reads: 0, listReads: 0,
  };
  const github = {
    paginate: async (fn, args) => fn(args),
    rest: {
      pulls: {
        list: async () => { state.listReads++; return [{ number: 987 }]; },
        get: async () => {
          state.reads++;
          if (state.beforePullRead) state.beforePullRead(state);
          return { data: clone(state.pull) };
        },
        listFiles: async () => {
          assert.equal(state.checks.at(-1).conclusion, "failure", "invalidate before fetching dependencies");
          if (state.fileError) throw new Error("fixture API outage");
          return [{ filename: "frontend/src/Home.jsx" }];
        },
        listReviews: async () => clone(state.reviews),
      },
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: "write" } }) },
      checks: {
        update: async (data) => {
          state.writes.push(clone(data));
          Object.assign(state.checks.find((check) => check.id === data.check_run_id), clone(data));
          return { data: clone(data) };
        },
        create: async (data) => {
          const check = { ...clone(data), id: state.nextCheckId++, check_suite: { id: state.suiteId } };
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
  return { state, run: (payload) => publishReviewGate({ github, core, context: { repo: { owner: "example", repo: "repo" }, eventName: payload ? "pull_request_target" : undefined, payload } }) };
}

test("a title-only edit publishes a fresh gate check instead of hiding the prior result", async () => {
  const { state, run } = fixture();
  await run({ action: "edited", changes: { title: { from: "old title" } } });
  assert.equal(state.listReads, 2);
  assert.equal(state.reads, 2);
  assert.equal(state.writes.length, 2);
  assert.equal(state.checks.at(-1).conclusion, "success");
  assert.equal(state.checks.at(-1).check_suite.id, state.suiteId);
});

for (const field of ["body", "base"]) {
  test("a title edit accompanied by a " + field + " edit still re-evaluates the gate", async () => {
    const { state, run } = fixture();
    state.pull.body = "- 위험도: high";
    await run({ action: "edited", changes: { title: { from: "old title" }, [field]: { from: "old value" } } });
    assert.equal(state.checks.at(-1).conclusion, "failure");
    assert.equal(state.checks.at(-1).output.title, "Approval required");
  });
}
function approval(state) {
  state.pull.body = "- 위험도: high";
  state.reviews = [{
    id: 10, state: "APPROVED", commit_id: "same-head",
    submitted_at: "2026-10-26T01:00:00Z", user: { login: "Sauter001" },
  }];
}

test("publishes a blocked check before evaluating a stable low-risk PR", async () => {
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
  assert.equal(state.checks.at(-1).conclusion, "failure");
  assert.equal(state.checks.at(-1).output.title, "Approval required");
});

test("dismissed approval on the same head replaces prior success", async () => {
  const { state, run } = fixture();
  approval(state);
  await run();
  assert.equal(state.checks.at(-1).conclusion, "success");
  state.reviews[0].state = "DISMISSED";
  await run();
  assert.equal(state.checks.at(-1).conclusion, "failure");
});

test("an API error after creating a blocked check keeps the gate blocked", async () => {
  const { state, run } = fixture();
  state.fileError = true;
  await run();
  assert.equal(state.checks.at(-1).conclusion, "failure");
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
    assert.equal(state.checks.at(-1).conclusion, "failure");
    assert.equal(state.checks.at(-1).output.title, "Review policy inputs changed");
    assert.equal(state.writes.some((write) => write.conclusion === "success"), false);
  });
}

test("creates an initially blocked check when no previous result exists", async () => {
  const { state, run } = fixture();
  state.checks = [];
  await run();
  assert.equal(state.writes[0].conclusion, "failure");
  assert.equal(state.checks.at(-1).conclusion, "success");
});

for (const action of ["edited", "reopened"]) {
  test("a same-head " + action + " creates a check in the new workflow suite", async () => {
    const { state, run } = fixture();
    approval(state);
    await run();
    const previous = clone(state.checks.at(-1));
    state.suiteId++;
    await run({ action, changes: { body: { from: "previous body" } } });
    const current = state.checks.at(-1);
    assert.notEqual(current.id, previous.id);
    assert.equal(current.check_suite.id, state.suiteId);
    assert.equal(current.head_sha, "same-head");
    assert.equal(current.conclusion, "success");
    assert.equal(current.output.title, "Required approval found");
    assert.deepEqual(state.checks.at(-2), previous, "do not update a check in an older suite");
    assert.equal(state.errors.length, 0);
  });
}

test("a repeated scan publishes a new failed check after approval is dismissed", async () => {
  const { state, run } = fixture();
  approval(state);
  await run();
  const previous = clone(state.checks.at(-1));
  state.suiteId++;
  state.reviews[0].state = "DISMISSED";
  state.fileError = true;
  await run();
  const current = state.checks.at(-1);
  assert.notEqual(current.id, previous.id);
  assert.equal(current.check_suite.id, state.suiteId);
  assert.equal(current.conclusion, "failure");
  assert.equal(state.errors.length, 1);
});

test("event configuration re-evaluates edits and review state using only trusted code", () => {
  const workflows = path.join(__dirname, "../workflows");
  const gate = fs.readFileSync(path.join(workflows, "conditional-review-gate.yml"), "utf8");
  const signal = fs.readFileSync(path.join(workflows, "review-policy-review-events.yml"), "utf8");
  assert.match(gate, /pull_request_target:\s+types: \[opened, reopened, synchronize, edited, ready_for_review\]/);
  assert.match(gate, /workflow_run:\s+workflows: \[Review Policy Review Events\]/);
  assert.match(gate, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(gate, /group: conditional-review-gate/);
  assert.match(gate, /cancel-in-progress: false/);
  assert.doesNotMatch(gate, /github\.event\.changes\.title/);
  assert.match(signal, /types: \[submitted, edited, dismissed\]/);
  assert.match(signal, /permissions: \{\}/);
  assert.doesNotMatch(signal, /actions\/checkout|secrets\.|upload-artifact|download-artifact/);
});
