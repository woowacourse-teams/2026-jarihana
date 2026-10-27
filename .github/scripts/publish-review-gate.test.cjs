const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { publishReviewGate, STATUS_CONTEXT } = require("./publish-review-gate.cjs");

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
    suiteId: 2, nextCheckId: 2, writes: [], statuses: [], statusWrites: [],
    errors: [], warnings: [], reads: 0, listReads: 0,
  };
  const github = {
    paginate: async (fn, args) => fn(args),
    rest: {
      pulls: {
        list: async () => {
          state.listReads++;
          if (state.beforeList) state.beforeList(state);
          if (state.listErrorAt === state.listReads) throw new Error("fixture list outage");
          return clone([state.pull, ...(state.otherPull ? [state.otherPull] : [])]);
        },
        get: async ({ pull_number }) => {
          state.reads++;
          if (state.beforePullRead) state.beforePullRead(state);
          return { data: clone(pull_number === 987 ? state.pull : state.otherPull) };
        },
        listFiles: async () => {
          if (state.legacyChecks !== false) assert.equal(state.checks.at(-1).conclusion, "failure", "invalidate before fetching dependencies");
          if (state.fileError) throw new Error("fixture API outage");
          return [{ filename: "frontend/src/Home.jsx" }];
        },
        listReviews: async ({ pull_number }) => clone(pull_number === 987 ? state.reviews : state.otherReviews || []),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission: "write" } }),
        getCombinedStatusForRef: async ({ ref }) => {
          if (state.statusReadError) throw new Error("fixture status outage");
          return { data: { statuses: [...new Map(state.statuses.filter((item) => item.sha === ref).map((item) => [item.context, item])).values()] } };
        },
        createCommitStatus: async (data) => {
          state.statusWrites.push(clone(data));
          state.statuses.push({ ...clone(data), creator: { login: "github-actions[bot]" } });
          return { data };
        },
      },
      checks: {
        update: async (data) => {
          state.writes.push(clone(data));
          Object.assign(state.checks.find((check) => check.id === data.check_run_id), clone(data));
          return { data: clone(data) };
        },
        create: async (data) => {
          // Observed GitHub behavior: creating a check does not select the new
          // Actions workflow suite. Keep it attached to the first suite.
          const check = { ...clone(data), id: state.nextCheckId++, check_suite: { id: 1 } };
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
  return { state, run: (payload, eventName = payload ? "pull_request_target" : "schedule") => publishReviewGate({ github, core, legacyChecks: state.legacyChecks !== false, context: {
    repo: { owner: "example", repo: "repo" }, runId: state.suiteId,
    eventName, payload: payload ? { pull_request: clone(state.pull), ...payload } : {},
  } }) };
}

test("a title-only edit reports the commit status even when checks attach to an old suite", async () => {
  const { state, run } = fixture();
  await run({ action: "edited", changes: { title: { from: "old title" } } });
  assert.equal(state.listReads, 4);
  assert.equal(state.reads, 3);
  assert.equal(state.writes.length, 2);
  assert.equal(state.checks.at(-1).conclusion, "success");
  assert.equal(state.checks.at(-1).check_suite.id, 1);
  assert.equal(state.statusWrites.at(-1).state, "success");
  assert.equal(state.statusWrites.at(-1).context, STATUS_CONTEXT);
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
  assert.equal(state.statusWrites.at(-1).state, "failure");
});

test("an API error after creating a blocked check keeps the gate blocked", async () => {
  const { state, run } = fixture();
  state.fileError = true;
  await run();
  assert.equal(state.checks.at(-1).conclusion, "failure");
  assert.equal(state.errors.length, 1);
  assert.equal(state.writes.some((write) => write.conclusion === "success"), false);
  assert.equal(state.statusWrites.at(-1).state, "failure");
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
    assert.equal(state.statusWrites.at(-1).state, "failure");
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
  test("a same-head " + action + " reports status without depending on the new workflow suite", async () => {
    const { state, run } = fixture();
    approval(state);
    await run();
    const previous = clone(state.checks.at(-1));
    state.suiteId++;
    await run({ action, changes: { body: { from: "previous body" } } });
    const current = state.checks.at(-1);
    assert.notEqual(current.id, previous.id);
    assert.equal(current.check_suite.id, 1, "legacy checks can remain in an older suite");
    const status = state.statusWrites.at(-1);
    assert.equal(status.sha, "same-head");
    assert.equal(status.context, "Review Approval Policy");
    assert.equal(status.state, "success");
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
  assert.equal(current.check_suite.id, 1);
  assert.equal(current.conclusion, "failure");
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.equal(state.errors.length, 1);
});

test("unchanged recovery scans reuse the status instead of consuming the per-SHA status quota", async () => {
  const { state, run } = fixture();
  await run();
  assert.equal(state.statusWrites.length, 2);
  for (let index = 0; index < 20; index++) {
    state.suiteId++;
    await run();
  }
  assert.equal(state.statusWrites.length, 2);
  assert.equal(state.statusWrites[1].state, "success");
});

test("a review signal blocks the affected head before querying approval dependencies", async () => {
  const { state, run } = fixture();
  approval(state);
  await run();
  state.reads = 0;
  state.fileError = true;
  state.beforePullRead = () => assert.equal(state.statuses.at(-1).state, "failure");
  await run({ workflow_run: { head_sha: "same-head" } }, "workflow_run");
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.equal(state.errors.length, 1);
});

test("a failed recovery scan replaces a previous successful status with failure", async () => {
  const { state, run } = fixture();
  await run();
  state.fileError = true;
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
});

test("status lookup failures leave a failed status and fail the workflow", async () => {
  const { state, run } = fixture();
  await run();
  state.statusReadError = true;
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.match(state.statusWrites.at(-1).description, /failed|previous/i);
  assert.equal(state.errors.length, 1);
});

test("an unrelated publisher cannot make the workflow skip its own successful status", async () => {
  const { state, run } = fixture();
  state.statuses = [{ sha: "same-head", context: STATUS_CONTEXT, state: "success", description: "#987: Self-merge allowed", creator: { login: "another-user" } }];
  await run();
  assert.equal(state.statusWrites.at(-1).state, "success");
  assert.equal(state.statusWrites.at(-1).context, STATUS_CONTEXT);
});

test("a second unapproved PR sharing the head cannot be overwritten by a low-risk PR's success", async () => {
  const { state, run } = fixture();
  state.otherPull = { ...clone(state.pull), number: 988, body: "- 위험도: high", base: { ref: "main", sha: "main-base" } };
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.match(state.statusWrites.at(-1).description, /#988: Approval required/);
  state.otherReviews = [{ id: 2, state: "APPROVED", commit_id: "same-head", user: { login: "Sauter001" }, submitted_at: "2026-10-27T01:00:00Z" }];
  await run();
  assert.equal(state.statusWrites.at(-1).state, "success");
});

test("a high-risk PR at a different SHA does not block a low-risk commit", async () => {
  const { state, run } = fixture();
  state.otherPull = { ...clone(state.pull), number: 988, body: "- 위험도: high", head: { sha: "another-head" } };
  await run();
  assert.equal(state.statusWrites.filter((item) => item.sha === "same-head").at(-1).state, "success");
  assert.equal(state.statusWrites.filter((item) => item.sha === "another-head").at(-1).state, "failure");
});

test("closing the unapproved PR re-evaluates the remaining PR sharing the SHA", async () => {
  const { state, run } = fixture();
  state.otherPull = { ...clone(state.pull), number: 988, body: "- 위험도: high" };
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
  state.otherPull = undefined;
  await run({ action: "closed" });
  assert.equal(state.statusWrites.at(-1).state, "success");
});

test("a new PR sharing the head during a scan prevents publication of success", async () => {
  const { state, run } = fixture();
  state.beforeList = () => {
    if (state.listReads === 3) state.otherPull = { ...clone(state.pull), number: 988, body: "- 위험도: high" };
  };
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.match(state.statusWrites.at(-1).description, /membership/);
});

test("a review change after legacy check publication still prevents the new status from passing", async () => {
  const { state, run } = fixture();
  approval(state);
  state.beforePullRead = () => {
    if (state.reads === 3) state.reviews[0].state = "DISMISSED";
  };
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
});

test("failure to recheck PR membership cannot leave a successful new status", async () => {
  const { state, run } = fixture();
  state.listErrorAt = 3;
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.equal(state.errors.length, 1);
});

test("a failed initial PR lookup invalidates the head identified by a change event", async () => {
  const { state, run } = fixture();
  state.listErrorAt = 1;
  await run({ action: "edited" });
  assert.equal(state.statusWrites.at(-1).sha, "same-head");
  assert.equal(state.statusWrites.at(-1).state, "failure");
  assert.equal(state.errors.length, 1);
});

test("after the ruleset migration the legacy checks can be disabled without disabling the policy", async () => {
  const { state, run } = fixture();
  state.legacyChecks = false;
  await run();
  assert.equal(state.writes.length, 0);
  assert.equal(state.statusWrites.at(-1).state, "success");
  state.pull.body = "- 위험도: high";
  await run();
  assert.equal(state.statusWrites.at(-1).state, "failure");
});

test("event configuration re-evaluates edits and review state using only trusted code", () => {
  const workflows = path.join(__dirname, "../workflows");
  const gate = fs.readFileSync(path.join(workflows, "conditional-review-gate.yml"), "utf8");
  const signal = fs.readFileSync(path.join(workflows, "review-policy-review-events.yml"), "utf8");
  assert.match(gate, /pull_request_target:\s+types: \[opened, reopened, synchronize, edited, ready_for_review, closed\]/);
  assert.match(gate, /workflow_run:\s+workflows: \[Review Policy Review Events\]/);
  assert.match(gate, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(gate, /group: conditional-review-gate/);
  assert.match(gate, /cancel-in-progress: false/);
  assert.match(gate, /statuses: write/);
  assert.match(gate, /REVIEW_GATE_LEGACY_CHECKS: \$\{\{ vars\.REVIEW_GATE_LEGACY_CHECKS \}\}/);
  assert.doesNotMatch(gate, /github\.event\.changes\.title/);
  assert.match(signal, /types: \[submitted, edited, dismissed\]/);
  assert.match(signal, /permissions: \{\}/);
  assert.doesNotMatch(signal, /actions\/checkout|secrets\.|upload-artifact|download-artifact/);
});
