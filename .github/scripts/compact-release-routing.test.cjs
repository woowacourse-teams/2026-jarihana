const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const vm = require("node:vm");

const directory = path.join(__dirname, "../workflows");
const files = ["backend-prod-deploy-v2", "backend-prod-deploy", "backend-bluegreen-deploy-v2",
  "backend-bluegreen-bootstrap-v2", "backend-bluegreen-prepare-v2", "backend-bluegreen-app-v2", "frontend-prod-deploy"];
const workflows = JSON.parse(execFileSync("ruby", [
  "-ryaml", "-rjson", "-e", 'puts JSON.generate(ARGV.map { |file| w = YAML.load_file(file); { jobs: w.fetch("jobs"), triggers: w.fetch(true), permissions: w["permissions"] } })',
  ...files.map(name => path.join(directory, name + ".yml")),
]));
const [automatic, manual, deploy, registration, preparation, app, frontend] = workflows.map(workflow => workflow.jobs);
const preparationOutputs = workflows[files.indexOf("backend-bluegreen-prepare-v2")].triggers.workflow_call.outputs;
const frontendWorkflow = workflows[files.indexOf("frontend-prod-deploy")];
const templates = { "backend-bluegreen-deploy-v2": deploy, "backend-bluegreen-app-v2": app,
  "backend-bluegreen-prepare-v2": preparation };

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
    .replace(/needs\.\*\.result/g, "results").replace(/\b(needs|steps|jobs)\.([\w-]+)\./g, '$1["$2"].');
  return vm.runInNewContext("(" + source + ")", {
    needs, results: Object.values(needs).map(n => n.result), always: () => true,
    cancelled: () => false, contains: (list, item) => list.includes(item), ...extra,
  }, { timeout: 200 });
}

function state(result = "success", outputs = {}) { return { result, outputs }; }
function canRun(job, results, context = {}) {
  const needs = Object.fromEntries([].concat(job.needs || []).map(id => [id, results[id]]));
  // Actions applies success() implicitly unless the condition contains a status check.
  if (!/\b(always|cancelled|failure|success)\(/.test(job.if || "") &&
    Object.values(needs).some(need => need.result !== "success")) return false;
  return !job.if || evaluate(job.if, needs, context);
}

function releaseContext(mode, eventName = "push") {
  const repository = "woowacourse-teams/2026-jarihana";
  const ref = "refs/heads/main";
  const caller = eventName === "push" ? "backend-prod-deploy-v2.yml" : "backend-prod-deploy.yml";
  return { inputs: { environment: "prod", mode }, github: { repository, ref, run_attempt: "1", event_name: eventName,
    workflow_ref: repository + "/.github/workflows/" + caller + "@" + ref, event: { inputs: { blue_green_mode: mode } } } };
}

function upstream({ frontend = false, control = "success", sealed = true, deferred = false, switched = true } = {}) {
  return { plan: state("success", { frontend_only: String(frontend), old: "A", target: frontend ? "A" : "B", digest: "sha256:" + "a".repeat(64) }),
    old: state(frontend ? "skipped" : "success"), target: state(frontend ? "skipped" : "success"),
    control: state(control, { cleanup_deferred: String(deferred), sealed: String(sealed),
      switch_started: String(switched), front_sealed: "false" }) };
}

test("자동 배포 그래프의 잡 13개, 수동 배포는 선택한 엔진과 모드로만 실행", () => {
  assert.equal(leaves(automatic).length, 13);
  assert.ok(!deploy.bootstrap && !deploy["finish-bootstrap"]);
  assert.equal(deploy.plan.uses, "./.github/workflows/backend-bluegreen-prepare-v2.yml");
  assert.equal(deploy.plan.with.mode, "deploy");
  assert.equal(deploy.guardian.name, "러너 대기 감시");
  assert.equal(deploy.result.name, "배포 결과");
  for (const graph of [preparation, deploy, registration]) {
    for (const job of Object.values(graph)) {
      for (const id of [].concat(job.needs || [])) assert.ok(graph[id], "Missing dependency " + id);
    }
  }
  for (const mode of ["deploy", "bootstrap"]) {
    const context = { inputs: { blue_green_mode: mode }, github: { event_name: "workflow_dispatch", ref: "refs/heads/main" } };
    for (const engine of ["V1", "V2"]) {
      const needs = { "release-enabled": state("success", { engine }) };
      assert.equal(evaluate(manual["blue-green"].if, needs, context), engine === "V1");
      assert.equal(evaluate(manual["blue-green-v2"].if, needs, context), engine === "V2" && mode === "deploy");
      assert.equal(evaluate(manual["bootstrap-v2"].if, needs, context), engine === "V2" && mode === "bootstrap");
    }
  }
  assert.equal(registration.prepare.with.mode, "bootstrap");
  assert.equal(registration["finish-bootstrap"].with.phase, "finish-bootstrap");
  assert.equal(evaluate(registration.interrupt.if, { plan: state(), "finish-bootstrap": state("failure") }), true);
});

test("일반 배포는 조정 러너에서 같은 checkout으로 digest 확인과 계획을 마치고 필요한 프론트 빌드만 요청한다", () => {
  const { prepare } = preparation;
  assert.deepEqual(Object.keys(preparation), ["prepare"]);
  const checkouts = prepare.steps.filter(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, "${{ github.sha }}");
  assert.equal(checkouts[0].with["fetch-depth"], 0);
  const resolveIndex = prepare.steps.findIndex(step => step.run?.includes("compact/resolve.sh"));
  const build = prepare.steps.find(step => step.id === "frontend_build");
  const download = prepare.steps.find(step => step.uses?.startsWith("actions/download-artifact@"));
  const plan = prepare.steps.find(step => step.run?.includes("coordinator.sh plan"));
  assert.ok(prepare.steps.indexOf(checkouts[0]) < resolveIndex && resolveIndex < prepare.steps.indexOf(build));
  assert.ok(prepare.steps.indexOf(build) < prepare.steps.indexOf(download) && prepare.steps.indexOf(download) < prepare.steps.indexOf(plan));
  assert.ok(!prepare.steps.some(step => step.run?.includes("npm ")));
  assert.match(build.with.script, /await buildFrontend\(/);
  assert.equal(download.with["run-id"], "${{ steps.frontend_build.outputs.run_id }}");
  assert.equal(download.with["artifact-ids"], "${{ steps.frontend_build.outputs.artifact_id }}");
  assert.equal(download.with["github-token"], "${{ github.token }}");
  assert.equal(download.with.path, "${{ env.BG_FRONTEND_DIST }}");
  assert.equal(download.with["merge-multiple"], true);
  assert.equal(plan.env.BG_IMAGE_DIGEST, "${{ steps.image.outputs.digest }}");
  assert.equal(plan.env.BG_FRONTEND_ONLY, "${{ steps.image.outputs.frontend_only }}");
  assert.equal(plan.env.BG_BACKEND_ONLY, "${{ steps.image.outputs.backend_only }}");
  for (const step of [build, download, plan]) assert.ok(!step["continue-on-error"]);
  assert.doesNotMatch(plan.if, /always\(|failure\(|cancelled\(/);
  for (const [mode, backendOnly] of [["deploy", "true"], ["deploy", "false"], ["bootstrap", "false"]]) {
    const outputs = { backend_only: backendOnly };
    const context = { ...releaseContext(mode, mode === "bootstrap" ? "workflow_dispatch" : "push"), steps: { image: { outputs } } };
    assert.equal(evaluate(prepare["runs-on"], {}, context),
      mode === "deploy" ? "jarihana-bluegreen-coordinator" : "ubuntu-24.04-arm");
    const runsFrontend = mode === "deploy" && backendOnly === "false";
    assert.equal(evaluate(build.if, {}, context), runsFrontend);
    context.steps.frontend_build = { outcome: runsFrontend ? "success" : "skipped" };
    assert.equal(evaluate(download.if, {}, context), runsFrontend);
    assert.equal(evaluate(plan.if, {}, context), mode === "deploy");
  }
  for (const outcome of ["failure", "cancelled"]) {
    assert.equal(evaluate(download.if, {}, { steps: { frontend_build: { outcome } } }), false);
  }
});

test("프론트 빌드는 부모가 승인한 SHA를 호스팅 러너에서 빌드하고 부모 실행에 해당하는 산출물을 올린다", () => {
  const { build } = frontend;
  const { workflow_dispatch: dispatch, workflow_call: reusable } = frontendWorkflow.triggers;
  assert.deepEqual(Object.keys(dispatch.inputs), ["parent_run_id"]);
  assert.equal(dispatch.inputs.parent_run_id.required, true);
  assert.deepEqual(Object.keys(reusable.inputs), ["source_sha"]);
  assert.equal(reusable.outputs.artifact_id.value, "${{ jobs.build.outputs.artifact_id }}");
  assert.equal(evaluate(build.if, {}, { github: { ref: "refs/heads/develop" } }), false);
  assert.ok(build.steps.some(step => step.run?.includes("npm run lint")));
  const compile = build.steps.find(step => step.run?.includes("npm run build"));
  const lookup = build.steps.find(step => step.id === "parent");
  const [checkout, pin] = build.steps.filter(step => step.uses?.startsWith("actions/checkout@"));
  const upload = build.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(lookup.env.PARENT_RUN_ID, "${{ inputs.parent_run_id }}");
  assert.match(lookup.with.script, /await parentSourceSha\(/);
  assert.ok(build.steps.indexOf(checkout) < build.steps.indexOf(lookup) && build.steps.indexOf(lookup) < build.steps.indexOf(pin));
  assert.ok(build.steps.indexOf(pin) < build.steps.indexOf(compile));
  const sha = "a".repeat(40);
  for (const [external, currentMain] of [[false, sha], [true, sha], [true, "b".repeat(40)]]) {
    const inputs = { source_sha: external ? "" : sha, parent_run_id: external ? "123" : "" };
    const steps = { parent: { outputs: { source_sha: external ? sha : "" } } };
    const context = { inputs, steps, github: { run_id: "456", sha: currentMain } };
    assert.equal(evaluate(build["runs-on"], {}, context), external ? "ubuntu-24.04-arm" : "ubuntu-latest");
    assert.equal(evaluate(lookup.if, {}, context), external);
    const fetchParent = evaluate(pin.if, {}, context);
    assert.equal(fetchParent, external && sha !== currentMain);
    assert.equal(evaluate((fetchParent ? pin : checkout).with.ref, {}, context), sha);
    assert.equal(evaluate(compile.env.APP_SENTRY_RELEASE, {}, context), sha);
    const artifactName = upload.with.name.replace(/\$\{\{.*?\}\}/g, expression => evaluate(expression, {}, context));
    assert.equal(artifactName, "frontend-release-" + sha + "-" + (external ? "123" : "456"));
  }
});

test("프론트 빌드에는 읽기 권한을 주고 운영 V2 계획만 빌드 실행을 요청할 수 있다", () => {
  assert.deepEqual(frontend.build.permissions || frontendWorkflow.permissions, { contents: "read", actions: "read" });
  for (const caller of [automatic.deploy, manual["blue-green-v2"], deploy.plan]) assert.equal(caller.permissions.actions, "write");
  const preparePermissions = preparation.prepare.permissions || workflows[files.indexOf("backend-bluegreen-prepare-v2")].permissions;
  const bootstrapPermissions = registration.prepare.permissions || workflows[files.indexOf("backend-bluegreen-bootstrap-v2")].permissions;
  assert.equal((preparePermissions || deploy.plan.permissions).actions, "write");
  assert.equal((preparePermissions || bootstrapPermissions).actions, "read");
});

test("조정 러너는 main의 운영 자동·수동 일반 배포에만 할당된다", () => {
  const runner = preparation.prepare["runs-on"];
  const hosted = "ubuntu-24.04-arm";
  const push = releaseContext("deploy");
  const dispatch = releaseContext("deploy", "workflow_dispatch");
  assert.equal(evaluate(runner, {}, dispatch), "jarihana-bluegreen-coordinator");
  for (const overrides of [{ ref: "refs/heads/develop" }, { repository: "other/repo" }, { run_attempt: "2" },
    { workflow_ref: dispatch.github.workflow_ref }, { event_name: "pull_request" }]) {
    assert.equal(evaluate(runner, {}, { ...push, github: { ...push.github, ...overrides } }), hosted);
  }
  assert.equal(evaluate(runner, {}, { ...dispatch, inputs: { environment: "dev", mode: "deploy" } }), hosted);
  assert.equal(evaluate(runner, {}, { ...dispatch, github: { ...dispatch.github, event: { inputs: { blue_green_mode: "bootstrap" } } } }), hosted);
});

test("별도 빌드를 포함한 정상 자동 배포는 백엔드 7개, 프론트 5개, 공동 배포 8개 잡을 사용한다", () => {
  const context = releaseContext("deploy");
  const dispatch = preparation.prepare.steps.find(step => step.id === "frontend_build");
  for (const [backendOnly, frontendOnly, parentCount, totalCount] of [
    [true, false, 7, 7], [false, true, 4, 5], [false, false, 7, 8],
  ]) {
    const steps = { image: { outputs: { backend_only: String(backendOnly), frontend_only: String(frontendOnly) } } };
    const buildRequested = evaluate(dispatch.if, {}, { ...context, steps });
    const results = Object.fromEntries(Object.keys(deploy).map(id => [id, state("skipped")]));
    Object.assign(results, upstream({ frontend: frontendOnly }));
    results.control.outputs.front_sealed = String(frontendOnly);
    results["after-switch"] = frontendOnly ? state("skipped") : state("success", { stopped: "true" });
    const active = Object.values(deploy).filter(job => canRun(job, results, context)).length;
    assert.equal(active, parentCount);
    assert.equal(active + (buildRequested ? leaves(frontend).length : 0), totalCount);
  }
});

test("프론트 빌드 실패·취소·건너뜀은 프론트 계획을 막고, 실패한 계획으로는 배포를 시작하지 않는다", () => {
  for (const result of ["success", "failure", "cancelled", "skipped"]) {
    for (const id of ["old", "target", "control", "interrupt"]) {
      const needs = Object.fromEntries([].concat(deploy[id].needs).map(needed => [needed, state("skipped")]));
      assert.equal(canRun(deploy[id], { ...needs, plan: state(result, { digest: "" }) }), false, id);
      if (result !== "success") {
        assert.equal(canRun(deploy[id], { ...needs, plan: state(result, upstream().plan.outputs) }), false, id);
      }
    }
  }
});

test("일반 배포는 완료한 계획의 digest와 슬롯만 전달하고 최초 등록은 이미지 digest를 전달한다", () => {
  const empty = { digest: "", old: "", target: "" };
  const resolved = "sha256:" + "1".repeat(64);
  const backend = { digest: resolved, old: "A", target: "B" };
  const frontend = { digest: "sha256:" + "2".repeat(64), old: "B", target: "B" };
  for (const [mode, planned, expected] of [
    ["deploy", backend, backend], ["deploy", frontend, frontend], ["deploy", empty, empty],
    ["bootstrap", empty, { ...empty, digest: resolved }],
  ]) {
    const steps = { image: { outputs: { digest: resolved } }, phase: { outputs: planned } };
    const outputs = Object.fromEntries(Object.keys(empty).map(key =>
      [key, evaluate(preparation.prepare.outputs[key], {}, { steps, inputs: { mode } })]));
    const jobs = { prepare: { outputs } };
    for (const key of Object.keys(empty)) assert.equal(evaluate(preparationOutputs[key].value, {}, { jobs }), expected[key], key);
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
  assert.deepEqual(deploy["grant-rollback-old"].needs, ["plan", "release-candidate"]);
  assert.deepEqual(deploy["resume-old"].needs, ["plan", "grant-rollback-old"]);
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
