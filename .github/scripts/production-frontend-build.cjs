const { setTimeout: sleep } = require("node:timers/promises");

const repository = "woowacourse-teams/2026-jarihana";
const repositoryId = 1321030074;
const buildWorkflow = "frontend-prod-deploy.yml";
const workflowDirectory = ".github/workflows/";
const parentWorkflows = new Map([
  ["push", "backend-prod-deploy-v2.yml"],
  ["workflow_dispatch", "backend-prod-deploy.yml"],
]);
const liveStatuses = new Set(["queued", "requested", "waiting", "pending", "in_progress"]);

function positiveId(value) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid GitHub Actions identifier");
  }
  return Number(value);
}

async function mainRun(github, context, runId, previous) {
  const { owner, repo } = context.repo;
  if (`${owner}/${repo}` !== repository || context.ref !== "refs/heads/main" || process.env.GITHUB_RUN_ATTEMPT !== "1") {
    throw new Error("A production build requires the first main run in the release repository");
  }
  const options = { owner, repo, run_id: runId };
  if (previous?.etag) options.headers = { "if-none-match": previous.etag };
  let response;
  try {
    response = await github.rest.actions.getWorkflowRun(options);
  } catch (error) {
    if (error.status === 304 && previous?.etag) return previous;
    throw error;
  }
  if (response.status === 304 && previous?.etag) return previous;
  const run = response.data;
  if (run.id !== runId || run.head_branch !== "main" ||
      !/^[0-9a-f]{40}$/.test(run.head_sha) ||
      [run.repository, run.head_repository].some(item => item?.id !== repositoryId || item.full_name !== repository)) {
    throw new Error(`Unexpected identity for workflow run ${runId}`);
  }
  return { run, etag: response.headers?.etag };
}

// Resolve the checkout from the live release. A dispatch never takes a caller-selected SHA.
async function parentSourceSha({ github, context, parentRunId }) {
  const { run } = await mainRun(github, context, positiveId(parentRunId));
  const workflow = parentWorkflows.get(run.event);
  if (!workflow || run.path !== workflowDirectory + workflow || run.run_attempt !== 1 ||
      !liveStatuses.has(run.status) || run.conclusion !== null) {
    throw new Error("The parent is not an active production release");
  }
  return run.head_sha;
}

// GitHub may return a dispatch ID or a successful conclusion before the corresponding read is visible.
async function readPublished(read, wait, description) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const value = await read();
      if (value !== null) return value;
    } catch (error) {
      if (attempt === 3 || ![404, 500, 502, 503, 504].includes(error.status)) throw error;
    }
    if (attempt < 3) await wait(attempt * 1_000);
  }
  throw new Error(`${description} is unavailable`);
}

async function frontendRun(github, context, runId, previous) {
  const snapshot = await mainRun(github, context, runId, previous);
  const { run } = snapshot;
  if (run.path !== workflowDirectory + buildWorkflow || run.event !== "workflow_dispatch") {
    throw new Error("The dispatched run is not the production frontend build");
  }
  return snapshot;
}

// A completed or rerun child no longer belongs to this cleanup operation.
async function cancelFrontendBuild({ github, context, runId }) {
  const id = positiveId(runId);
  const { run } = await frontendRun(github, context, id);
  if (run.run_attempt !== 1 || run.status === "completed") return;
  if (!liveStatuses.has(run.status) || run.conclusion !== null) throw new Error("Unknown frontend build status");
  try {
    await github.rest.actions.cancelWorkflowRun({ ...context.repo, run_id: id });
  } catch (error) {
    if (error.status !== 409) throw error; // The child may finish after it was checked.
  }
}

async function buildFrontend({ github, context, onDispatch, wait = sleep }) {
  const parentRunId = positiveId(context.runId);
  const sha = await parentSourceSha({ github, context, parentRunId });
  if (sha !== context.sha) throw new Error("The checked-out release differs from its parent run");

  // Dispatch once. A lost response may mean GitHub already accepted this build.
  const response = await github.rest.actions.createWorkflowDispatch({
    ...context.repo, workflow_id: buildWorkflow, ref: "main",
    inputs: { parent_run_id: String(parentRunId) }, return_run_details: true,
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
    request: { retries: 0 },
  });
  if (response.status !== 200) throw new Error("GitHub did not return the dispatched build");
  const runId = positiveId(response.data?.workflow_run_id);
  if (onDispatch) onDispatch(runId, `https://github.com/${repository}/actions/runs/${runId}`);
  const deadline = performance.now() + 30 * 60_000;
  let snapshot;
  for (;;) {
    snapshot = await readPublished(() => frontendRun(github, context, runId, snapshot), wait, `Frontend build ${runId}`);
    const { run } = snapshot;
    if (run.run_attempt !== 1) throw new Error("The dispatched frontend build was rerun");
    if (run.status === "completed" && run.conclusion === "success") break;
    if (!liveStatuses.has(run.status) || run.conclusion !== null) {
      throw new Error(`Frontend build ${runId} ended with ${run.conclusion || run.status}`);
    }
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for frontend build ${runId}`);
    // Authenticated 304s preserve the API quota needed for the production plan.
    await wait(snapshot.etag ? 5_000 : 30_000);
  }

  const name = `frontend-release-${sha}-${parentRunId}`;
  const data = await readPublished(async () => {
    const { data } = await github.rest.actions.listWorkflowRunArtifacts({
      ...context.repo, run_id: runId, name, per_page: 2,
    });
    return data.total_count === 0 && data.artifacts.length === 0 ? null : data;
  }, wait, name);
  const [artifact] = data.artifacts;
  if (data.total_count !== 1 || data.artifacts.length !== 1 || artifact?.name !== name ||
      artifact.expired !== false || (artifact.workflow_run && artifact.workflow_run.id !== runId)) {
    throw new Error(`Expected one current artifact ${name} in frontend build ${runId}`);
  }
  return { run_id: runId, artifact_id: positiveId(artifact.id) };
}

module.exports = { buildFrontend, cancelFrontendBuild, parentSourceSha };
