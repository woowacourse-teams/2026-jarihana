const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateReviewGate,
  findHighRiskPaths,
  parseDeclaredRisk,
} = require("./review-gate.cjs");

const validBody = (risk) => "- 위험도: " + risk + "\n- 위험도 판단 근거: 테스트";

function evaluate(overrides = {}) {
  return evaluateReviewGate({
    body: validBody("low"),
    changedPaths: ["backend/src/main/java/example/Feature.java"],
    filesTruncated: false,
    headSha: "head-2",
    author: "author",
    reviews: [],
    reviewersWithWriteAccess: new Set(),
    ...overrides,
  });
}

test("low-risk feature in the author's module can be self-merged", () => {
  const result = evaluate();
  assert.equal(result.approvalRequired, false);
  assert.equal(result.passed, true);
});

test("a high-risk declaration requires an approval", () => {
  const result = evaluate({ body: validBody("high") });
  assert.equal(result.approvalRequired, true);
  assert.equal(result.passed, false);
});

test("a high-risk path overrides a low-risk declaration", () => {
  const result = evaluate({
    body: validBody("low"),
    changedPaths: ["backend/src/main/resources/db/migration/V7__change.sql"],
  });
  assert.equal(result.approvalRequired, true);
  assert.equal(result.passed, false);
  assert.equal(result.highRiskPaths.length, 1);
});

test("a non-author write-permission approval for the current head passes", () => {
  const result = evaluate({
    body: validBody("high"),
    reviews: [
      {
        id: 1,
        state: "APPROVED",
        commit_id: "head-2",
        submitted_at: "2026-10-23T10:00:00Z",
        user: { login: "reviewer" },
      },
    ],
    reviewersWithWriteAccess: new Set(["reviewer"]),
  });
  assert.equal(result.approvalRequired, true);
  assert.equal(result.hasApproval, true);
  assert.equal(result.passed, true);
});

test("author, stale, dismissed, and non-write approvals do not pass the gate", () => {
  const reviews = [
    { state: "APPROVED", commit_id: "head-2", user: { login: "author" } },
    { state: "APPROVED", commit_id: "head-1", user: { login: "reviewer" } },
    { state: "DISMISSED", commit_id: "head-2", user: { login: "reviewer" } },
    { state: "APPROVED", commit_id: "head-2", user: { login: "read-only" } },
  ];
  const result = evaluate({
    body: validBody("high"),
    reviews,
    reviewersWithWriteAccess: new Set(["reviewer"]),
  });
  assert.equal(result.hasApproval, false);
  assert.equal(result.passed, false);
});

test("a later non-approval review on the same commit supersedes an earlier approval", () => {
  const result = evaluate({
    body: validBody("high"),
    reviews: [
      {
        id: 1,
        state: "APPROVED",
        commit_id: "head-2",
        submitted_at: "2026-10-23T10:00:00Z",
        user: { login: "reviewer" },
      },
      {
        id: 2,
        state: "COMMENTED",
        commit_id: "head-2",
        submitted_at: "2026-10-23T10:01:00Z",
        user: { login: "reviewer" },
      },
    ],
    reviewersWithWriteAccess: new Set(["reviewer"]),
  });
  assert.equal(result.hasApproval, false);
  assert.equal(result.passed, false);
});

test("missing or malformed risk declaration must be corrected without requiring approval", () => {
  assert.deepEqual(parseDeclaredRisk("no risk field"), { valid: false, risk: null });
  const result = evaluate({ body: "- 위험도: low 또는 medium" });
  assert.equal(result.approvalRequired, false);
  assert.equal(result.classificationValid, false);
  assert.equal(result.passed, false);
});

test("truncated file lists fail closed", () => {
  const result = evaluate({ filesTruncated: true });
  assert.equal(result.approvalRequired, true);
  assert.equal(result.passed, false);
});

test("critical path rules cover production migrations, auth, infra, and workflow policy", () => {
  const matches = findHighRiskPaths([
    "backend/db/migrations/2026-10-23-change.sql",
    "backend/src/main/java/com/example/auth/Session.java",
    "infra/monitoring/prometheus.yml",
    ".github/workflows/ci.yml",
    "docs/repository-conventions/git.md",
    "backend/src/main/java/com/example/group/GroupService.java",
  ]);
  assert.deepEqual(matches.map((match) => match.path), [
    "backend/db/migrations/2026-10-23-change.sql",
    "backend/src/main/java/com/example/auth/Session.java",
    "infra/monitoring/prometheus.yml",
    ".github/workflows/ci.yml",
    "docs/repository-conventions/git.md",
  ]);
});

test("production review automation cannot self-merge by declaring low risk", () => {
  for (const script of ["review-gate", "publish-review-gate", "auto-assign-reviewer", "slack-review-notifications"]) {
    const result = evaluate({ body: "- 위험도: low", changedPaths: [".github/scripts/" + script + ".cjs"] });
    assert.equal(result.approvalRequired, true, script);
    assert.equal(result.passed, false, script);
  }
});

test("regression-test-only changes keep the ordinary risk policy", () => {
  const result = evaluate({ body: "- 위험도: low", changedPaths: [".github/scripts/review-gate.test.cjs"] });
  assert.equal(result.approvalRequired, false);
  assert.equal(result.passed, true);
});
