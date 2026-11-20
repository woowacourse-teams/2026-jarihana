const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const vm = require("node:vm");

const directory = path.join(__dirname, "../workflows");
const files = ["backend-prod-deploy-v2", "backend-prod-deploy", "backend-bluegreen-deploy-v2",
  "backend-bluegreen-bootstrap-v2", "backend-bluegreen-prepare-v2", "backend-bluegreen-app-v2"];
const [automatic, manual, deploy, registration, build, app] = JSON.parse(execFileSync("ruby", [
  "-ryaml", "-rjson", "-e", 'puts JSON.generate(ARGV.map { |file| YAML.load_file(file).fetch("jobs") })',
  ...files.map(name => path.join(directory, name + ".yml")),
]));
const templates = { "backend-bluegreen-deploy-v2": deploy, "backend-bluegreen-app-v2": app,
  "backend-bluegreen-prepare-v2": build };

function leaves(jobs) {
  return Object.values(jobs).flatMap(job => {
    if (!job.uses) return [job];
    const called = templates[path.basename(job.uses, ".yml")];
    assert.ok(called, job.uses);
    return leaves(called);
  });
}

function evaluate(expression, needs, extra = {}) {
  const source = expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, "")
    .replace(/needs\.\*\.result/g, "results").replace(/needs\.([\w-]+)\./g, 'needs["$1"].');
  return vm.runInNewContext("(" + source + ")", {
    needs, results: Object.values(needs).map(n => n.result), always: () => true,
    cancelled: () => false, contains: (list, item) => list.includes(item), ...extra,
  }, { timeout: 200 });
}

function state(result = "success", outputs = {}) { return { result, outputs }; }
function upstream({ frontend = false, control = "success", sealed = true, deferred = false, switched = true } = {}) {
  return { prepare: state("success", { frontend_only: String(frontend) }), plan: state(),
    old: state(frontend ? "skipped" : "success"), target: state(frontend ? "skipped" : "success"),
    control: state(control, { cleanup_deferred: String(deferred), sealed: String(sealed),
      switch_started: String(switched), front_sealed: "false" }) };
}

test("자동 그래프의 실제 잡 14개, 수동 V2의 일반 배포와 최초 등록은 한 경로씩 실행", () => {
  assert.equal(leaves(automatic).length, 14);
  assert.ok(!deploy.bootstrap && !deploy["finish-bootstrap"]);
  for (const graph of [deploy, registration]) {
    for (const job of Object.values(graph)) {
      for (const id of [].concat(job.needs || [])) assert.ok(graph[id], "Missing dependency " + id);
    }
  }
  for (const mode of ["deploy", "bootstrap"]) {
    const context = { inputs: { blue_green_mode: mode }, github: { event_name: "workflow_dispatch", ref: "refs/heads/main" } };
    const needs = { "release-enabled": state("success", { engine: "V2" }) };
    assert.equal(evaluate(manual["blue-green-v2"].if, needs, context), mode === "deploy");
    assert.equal(evaluate(manual["bootstrap-v2"].if, needs, context), mode === "bootstrap");
  }
  assert.equal(registration.prepare.with.mode, "bootstrap");
  assert.equal(registration["finish-bootstrap"].with.phase, "finish-bootstrap");
  assert.equal(evaluate(registration.interrupt.if, { plan: state(), "finish-bootstrap": state("failure") }), true);
});

test("프론트 빌드와 업로드는 프론트 변경이 있는 일반 배포에서만 실행", () => {
  const steps = build.prepare.steps;
  const buildSteps = steps.slice(steps.findIndex(step => step.uses?.startsWith("actions/setup-node@")));
  assert.ok(buildSteps.some(step => step.run?.includes("npm run lint")));
  assert.ok(buildSteps.some(step => step.run?.includes("npm run build")));
  assert.equal(buildSteps.at(-1).id, "artifact");
  for (const [mode, backendOnly, expected] of [["deploy", "true", false], ["deploy", "false", true], ["bootstrap", "false", false]]) {
    for (const step of buildSteps) assert.equal(evaluate(step.if, {}, {
      inputs: { mode }, steps: { image: { outputs: { backend_only: backendOnly } } },
    }), expected, step.name);
  }
});

test("정상 종료, 전환 실패, 확정 후 장애, 종료 보류, 취소에서 전환 후 처리 분기", () => {
  const job = deploy["after-switch"];
  for (const [up, branch] of [[upstream(), "stop"], [upstream({ control: "failure", sealed: false }), "rollback"],
    [upstream({ frontend: true }), null], [upstream({ deferred: true }), null],
    [upstream({ control: "failure" }), null], [upstream({ control: "failure", sealed: false, switched: false }), null]]) {
    assert.equal(evaluate(job.if, up), Boolean(branch));
    if (branch) for (const id of ["stop", "rollback"]) {
      assert.equal(evaluate(job.steps.find(s => s.id === id).if, up), branch === id);
    }
    assert.equal(evaluate(job.if, up, { cancelled: () => true }), false);
  }
});

test("API 복구가 실패해도 프론트 복구는 독립 실행, 성공한 HTTP 복구만 워커 반납을 허가", () => {
  const up = upstream({ control: "failure", sealed: false });
  assert.ok(deploy["frontend-recover"]["runs-on"]);
  for (const result of ["success", "failure", "skipped"]) {
    const needs = { ...up, "after-switch": state(result, { rollback_ready: String(result === "success") }) };
    assert.equal(evaluate(deploy["frontend-recover"].if, needs), true);
    assert.equal(evaluate(deploy["release-candidate"].if, needs), result === "success");
  }
  assert.deepEqual(deploy["grant-rollback-old"].needs, ["prepare", "plan", "release-candidate"]);
  assert.deepEqual(deploy["resume-old"].needs, ["prepare", "plan", "grant-rollback-old"]);
  assert.equal(evaluate(deploy["frontend-recover"].if, { ...upstream(), "after-switch": state("failure") }), false);
});

test("API 경로만 복구된 상태를 배포 성공으로 판정하지 않고 중단 기록을 남긴다", () => {
  const up = upstream({ control: "failure", sealed: false });
  const needs = { ...up, "after-switch": state("success", { stopped: "false" }), "finish-rollback": state("skipped"),
    "frontend-recover": state() };
  assert.equal(evaluate(deploy.interrupt.if, needs), true);
  assert.notEqual(evaluate(deploy.result.steps[0].env.DEPLOY, needs), "success");
  needs["finish-rollback"] = state();
  assert.equal(evaluate(deploy.interrupt.if, needs), false);
  assert.notEqual(evaluate(deploy.result.steps[0].env.DEPLOY, needs), "success");
  needs["after-switch"] = state("success", { stopped: "true" });
  assert.equal(evaluate(deploy.result.steps[0].env.DEPLOY, needs), "success");
});
