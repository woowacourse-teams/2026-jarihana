const assert = require("node:assert/strict");
const test = require("node:test");
const { buildFrontend, cancelFrontendBuild, parentSourceSha } = require("./production-frontend-build.cjs");

const repo = { owner: "woowacourse-teams", repo: "2026-jarihana" };
const identity = { id: 1321030074, full_name: `${repo.owner}/${repo.repo}` };
const context = { repo, ref: "refs/heads/main", runId: 101, sha: "a".repeat(40) };
// actions/github-script@v7 exposes the current attempt only as an environment variable.
test.beforeEach(() => { process.env.GITHUB_RUN_ATTEMPT = "1"; });
const parent = {
  id: 101, run_attempt: 1, head_sha: context.sha, head_branch: "main", repository: identity,
  head_repository: identity, path: ".github/workflows/backend-prod-deploy-v2.yml", event: "push",
  status: "in_progress", conclusion: null,
};
const child = {
  ...parent, id: 202, path: ".github/workflows/frontend-prod-deploy.yml", event: "workflow_dispatch",
  head_sha: "b".repeat(40), status: "completed", conclusion: "success",
};
const artifact = { id: 303, name: `frontend-release-${context.sha}-101`, expired: false, workflow_run: { id: 202 } };

function fixture({ release = parent, builds = [child], artifacts = [artifact], dispatch } = {}) {
  const requests = [];
  const actions = {
    async getWorkflowRun({ run_id }) {
      if (run_id === 101) return { data: release };
      assert.equal(run_id, 202);
      return { data: builds.shift() };
    },
    async createWorkflowDispatch(options) {
      requests.push(options);
      if (dispatch) return dispatch();
      return { status: 200, data: { workflow_run_id: 202 } };
    },
    async listWorkflowRunArtifacts(options) {
      assert.deepEqual(options, { ...repo, run_id: 202, name: artifact.name, per_page: 2 });
      return { data: { total_count: artifacts.length, artifacts } };
    },
  };
  return { github: { rest: { actions } }, context, wait: async () => {}, requests };
}

test("main can advance while the build still publishes an artifact for the exact release SHA", async () => {
  const queued = { ...child, status: "queued", conclusion: null };
  const runner = fixture({ builds: [queued, child] });
  const dispatches = [];
  const waits = [];
  runner.wait = async ms => { waits.push(ms); };
  runner.onDispatch = (id, url) => dispatches.push({ id, url });
  assert.deepEqual(await buildFrontend(runner), { run_id: 202, artifact_id: 303 });
  assert.deepEqual(dispatches, [{ id: 202, url: "https://github.com/woowacourse-teams/2026-jarihana/actions/runs/202" }]);
  assert.deepEqual(waits, [30_000]);
  assert.deepEqual(runner.requests.map(({ workflow_id, ref, inputs, return_run_details }) =>
    [workflow_id, ref, inputs, return_run_details]), [
    ["frontend-prod-deploy.yml", "main", { parent_run_id: "101" }, true],
  ]);
});

test("authenticated polling reuses a verified response on GitHub's 304 until the build completes", async () => {
  const runner = fixture();
  const actions = runner.github.rest.actions;
  const getRun = actions.getWorkflowRun;
  const etag = 'W/"queued"';
  const waits = [];
  runner.wait = async ms => { waits.push(ms); };
  let reads = 0;
  actions.getWorkflowRun = async options => {
    if (options.run_id === 101) return getRun(options);
    assert.equal(options.run_id, 202);
    if (++reads === 1) {
      assert.equal(options.headers, undefined);
      return { data: { ...child, status: "queued", conclusion: null }, headers: { etag } };
    }
    assert.deepEqual(options.headers, { "if-none-match": etag });
    if (reads === 2) throw Object.assign(new Error("Not Modified"), { status: 304 });
    return { data: child, headers: { etag: '"completed"' } };
  };
  assert.deepEqual(await buildFrontend(runner), { run_id: 202, artifact_id: 303 });
  assert.equal(reads, 3);
  assert.deepEqual(waits, [5_000, 5_000]);
});

test("the child resolves the source from a live automatic or manual main release", async () => {
  const manual = { ...parent, path: ".github/workflows/backend-prod-deploy.yml", event: "workflow_dispatch" };
  for (const release of [parent, manual]) {
    assert.equal(await parentSourceSha({ ...fixture({ release }), parentRunId: "101" }), context.sha);
  }
  for (const change of [
    { id: 102 }, { run_attempt: 2 }, { event: "pull_request" }, { head_branch: "develop" },
    { path: ".github/workflows/frontend-prod-deploy.yml" }, { head_sha: "invalid" },
    { status: "completed", conclusion: "cancelled" }, { status: "unknown" },
    { repository: { ...identity, id: 900 } }, { head_repository: { ...identity, full_name: "other/fork" } },
  ]) {
    const runner = fixture({ release: { ...parent, ...change } });
    await assert.rejects(parentSourceSha({ ...runner, parentRunId: "101" }));
    assert.equal(runner.requests.length, 0);
  }
  await assert.rejects(parentSourceSha({ ...fixture(), parentRunId: "101a" }));
  await assert.rejects(buildFrontend({ ...fixture(), context: { ...context, sha: child.head_sha } }));
  process.env.GITHUB_RUN_ATTEMPT = "2";
  await assert.rejects(parentSourceSha({ ...fixture(), parentRunId: "101" }));
});

test("a lost dispatch response never triggers another build", async () => {
  for (const dispatch of [
    () => { throw new Error("connection closed"); }, () => ({ status: 204 }),
    () => ({ status: 200, data: { workflow_run_id: 0 } }),
  ]) {
    const runner = fixture({ dispatch });
    await assert.rejects(buildFrontend(runner));
    assert.equal(runner.requests.length, 1);
  }
});

test("newly dispatched runs and artifacts can appear after a read without another dispatch", async () => {
  const runner = fixture();
  const actions = runner.github.rest.actions;
  const getRun = actions.getWorkflowRun;
  let childReads = 0;
  actions.getWorkflowRun = async options => {
    if (options.run_id === 202 && ++childReads === 1) throw Object.assign(new Error("Not Found"), { status: 404 });
    return getRun(options);
  };
  const listArtifacts = actions.listWorkflowRunArtifacts;
  let listReads = 0;
  actions.listWorkflowRunArtifacts = async options => {
    if (++listReads === 1) return { data: { total_count: 0, artifacts: [] } };
    return listArtifacts(options);
  };
  assert.deepEqual(await buildFrontend(runner), { run_id: 202, artifact_id: 303 });
  assert.equal(runner.requests.length, 1);
  assert.equal(childReads, 2);
  assert.equal(listReads, 2);
});

test("unpublished artifacts have a bounded retry and ambiguous or forbidden reads stop immediately", async () => {
  for (const [status, artifacts, expected] of [[200, [], 3], [503, [], 3], [403, [], 1], [200, [artifact, artifact], 1]]) {
    const runner = fixture({ artifacts });
    const actions = runner.github.rest.actions;
    const listArtifacts = actions.listWorkflowRunArtifacts;
    let reads = 0;
    actions.listWorkflowRunArtifacts = async options => {
      reads++;
      if (status !== 200) throw Object.assign(new Error("GitHub API rejected read"), { status });
      return listArtifacts(options);
    };
    await assert.rejects(buildFrontend(runner));
    assert.equal(reads, expected);
    assert.equal(runner.requests.length, 1);
  }
});

test("foreign, retried or unsuccessful child runs cannot supply a release artifact", async () => {
  for (const change of [
    { run_attempt: 2 }, { id: 203 }, { path: parent.path }, { event: "push" },
    { head_branch: "test" }, { head_repository: null }, { conclusion: "failure" },
    { conclusion: "cancelled" }, { status: "unknown", conclusion: null },
  ]) {
    await assert.rejects(buildFrontend(fixture({ builds: [{ ...child, ...change }] })));
  }
  for (const artifacts of [
    [], [artifact, artifact], [{ ...artifact, name: "other" }], [{ ...artifact, expired: true }],
    [{ ...artifact, workflow_run: { id: 777 } }], [{ ...artifact, id: 0 }],
  ]) {
    await assert.rejects(buildFrontend(fixture({ artifacts })));
  }
});

test("cleanup cancels only the live first attempt of the identified build", async () => {
  const active = { ...child, status: "in_progress", conclusion: null };
  for (const [run, expected] of [[active, 1], [child, 0], [{ ...active, run_attempt: 2 }, 0]]) {
    const runner = fixture({ builds: [run] });
    const cancellations = [];
    runner.github.rest.actions.cancelWorkflowRun = async options => {
      cancellations.push(options);
      throw Object.assign(new Error("Run completed during cancellation"), { status: 409 });
    };
    await cancelFrontendBuild({ ...runner, runId: "202" });
    assert.deepEqual(cancellations, expected ? [{ ...repo, run_id: 202 }] : []);
  }
  const foreign = fixture({ builds: [{ ...active, path: parent.path }] });
  let cancelled = false;
  foreign.github.rest.actions.cancelWorkflowRun = async () => { cancelled = true; };
  await assert.rejects(cancelFrontendBuild({ ...foreign, runId: 202 }));
  assert.equal(cancelled, false);
});
