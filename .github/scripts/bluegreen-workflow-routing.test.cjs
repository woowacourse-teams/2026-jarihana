const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Evaluate conditions from the real workflow. The native GitHub probe validates
// the scheduler behavior that this local model cannot establish on its own.
const workflow = fs.readFileSync(path.join(__dirname, "../workflows/backend-bluegreen-deploy.yml"), "utf8");
const jobs = {};
let current;
let inJobs = false;
for (const line of workflow.split("\n")) {
  if (line === "jobs:") { inJobs = true; continue; }
  if (!inJobs) continue;
  const job = line.match(/^  ([a-z][a-z0-9-]*):$/);
  if (job) { current = jobs[job[1]] = { id: job[1], needs: [], condition: "" }; continue; }
  const field = line.match(/^    (needs|if): (.+)$/);
  if (!field || !current) continue;
  if (field[1] === "if") {
    assert.ok(!["|", ">", "|-", ">-"].includes(field[2]), "Extend the routing test parser for multiline conditions");
    current.condition = field[2];
  } else current.needs = field[2].replace(/^\[|\]$/g, "").split(",").map((name) => name.trim());
}
const backendPath = ["prepare", "grant-handoff", "handoff", "switch", "activate", "grant-observe", "observe-app", "observe-http", "seal", "complete-target", "grant-stop", "stop-old", "stop-ec2"];
const frontendPath = ["frontend-publish", "frontend-observe", "frontend-seal"];
assert.ok(jobs.resolve && jobs.plan && jobs.result && backendPath.every((id) => jobs[id]), "Incomplete workflow graph");
for (const job of Object.values(jobs)) for (const id of job.needs) assert.ok(jobs[id], `Unknown dependency ${id}`);

function ancestors(id, found = new Set()) {
  for (const dependency of jobs[id].needs) {
    if (!found.has(dependency)) { found.add(dependency); ancestors(dependency, found); }
  }
  return [...found];
}
function outputs(id, options) {
  if (id === "resolve") return { frontend_only: String(options.frontendOnly ?? false), backend_only: String(options.backendOnly ?? true) };
  if (id === "seal") return { cleanup_deferred: String(options.cleanupDeferred ?? false) };
  if (id === "rollback-http") return { rollback_ready: "true" };
  return {};
}
function canRun(id, completed, options = {}) {
  const job = jobs[id];
  const previous = ancestors(id).map((parent) => completed[parent].result);
  const succeeded = () => !options.cancelled && previous.every((result) => result === "success");
  if (!job.condition) return succeeded();
  const explicitStatus = /\b(?:always|cancelled|success|failure)\s*\(/.test(job.condition);
  if (!explicitStatus && !succeeded()) return false;
  const needs = Object.fromEntries(job.needs.map((parent) => [parent, completed[parent]]));
  const expression = job.condition.replace(/needs\.\*\.result/g, "needResults")
    .replace(/needs\.([a-z][a-z0-9-]*)\./g, 'needs["$1"].');
  return Boolean(vm.runInNewContext(`(${expression})`, {
    inputs: { environment: "prod", mode: "deploy", ...options.inputs },
    needs,
    needResults: Object.values(needs).map((dependency) => dependency.result),
    always: () => true,
    cancelled: () => Boolean(options.cancelled),
    success: succeeded,
    failure: () => previous.includes("failure"),
    contains: (values, value) => values.includes(value),
  }, { timeout: 100 }));
}
function route(options = {}) {
  const completed = {};
  const pending = new Set(Object.keys(jobs));
  while (pending.size) {
    let progressed = false;
    for (const id of pending) {
      if (!jobs[id].needs.every((parent) => completed[parent])) continue;
      const result = canRun(id, completed, options) ? (options.fail === id ? "failure" : "success") : "skipped";
      completed[id] = { result, outputs: outputs(id, options) };
      pending.delete(id); progressed = true;
    }
    assert.ok(progressed, "Workflow dependency cycle");
  }
  return completed;
}
function expectResults(result, ids, expected) {
  for (const id of ids) assert.equal(result[id].result, expected, `${id} must be ${expected}`);
}

test("backend-only skips frontend build but completes every backend deployment phase", () => {
  const result = route({ backendOnly: true });
  assert.equal(result["frontend-build"].result, "skipped");
  assert.equal(result.plan.result, "success");
  expectResults(result, backendPath, "success");
  expectResults(result, frontendPath, "skipped");
  assert.equal(result.interrupt.result, "skipped");
});

test("combined release retains frontend build and the complete backend path", () => {
  const result = route({ backendOnly: false });
  assert.equal(result["frontend-build"].result, "success");
  expectResults(result, backendPath, "success");
  expectResults(result, frontendPath, "skipped");
});

test("frontend-only never prepares or stops a backend instance", () => {
  const result = route({ frontendOnly: true, backendOnly: false });
  expectResults(result, frontendPath, "success");
  expectResults(result, backendPath, "skipped");
  assert.equal(result.interrupt.result, "skipped");
});

test("failed plan cannot start backend mutation or recovery", () => {
  const result = route({ fail: "plan" });
  expectResults(result, backendPath, "skipped");
  assert.equal(result["frontend-recover"].result, "skipped");
});

test("failed prepare blocks handoff and switching but keeps frontend recovery available", () => {
  const result = route({ fail: "prepare" });
  assert.equal(result.prepare.result, "failure");
  expectResults(result, backendPath.slice(1), "skipped");
  assert.equal(result["frontend-recover"].result, "success");
  assert.equal(result.interrupt.result, "success");
});

test("failed worker observation blocks seal and old-instance stop while rollback can run", () => {
  const result = route({ fail: "observe-app" });
  assert.equal(result["observe-http"].result, "success");
  expectResults(result, ["seal", "complete-target", "grant-stop", "stop-old", "stop-ec2"], "skipped");
  expectResults(result, ["rollback-http", "release-candidate", "grant-rollback-old", "resume-old", "finish-rollback"], "success");
});

test("cleanup_deferred preserves the serving target and prevents old-instance stop", () => {
  const result = route({ cleanupDeferred: true });
  assert.equal(result.seal.result, "success");
  expectResults(result, ["complete-target", "grant-stop", "stop-old", "stop-ec2", "rollback-http"], "skipped");
  assert.equal(result.interrupt.result, "success");
});

for (const id of backendPath) {
  test(`${id} rejects cancellation and every unsuccessful direct prerequisite`, () => {
    const completed = Object.fromEntries(Object.keys(jobs).map((name) => [name, { result: "success", outputs: outputs(name, {}) }]));
    completed["frontend-build"].result = "skipped";
    assert.equal(canRun(id, completed), true, "Intentional frontend-build skip is allowed");
    assert.equal(canRun(id, completed, { cancelled: true }), false, "Cancellation must stop deployment");
    for (const parent of jobs[id].needs) for (const result of ["failure", "cancelled", "skipped"]) {
      completed[parent].result = result;
      assert.equal(canRun(id, completed), false, `${parent}=${result} must block ${id}`);
      completed[parent].result = "success";
    }
  });
}
