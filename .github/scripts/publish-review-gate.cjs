"use strict";

const { evaluateReviewGate, latestSubmittedReviews } = require("./review-gate.cjs");

const CHECK_NAME = "Conditional Review Gate";
const STATUS_CONTEXT = "Review Approval Policy";
const BASE_BRANCHES = ["develop", "main"];

function pullSnapshot(pull) {
  return JSON.stringify({
    state: pull.state,
    draft: Boolean(pull.draft),
    body: pull.body || "",
    head: pull.head.sha,
    base: pull.base.sha,
    baseRef: pull.base.ref,
    author: pull.user.login.toLowerCase(),
  });
}

function reviewSnapshot(reviews) {
  return JSON.stringify(reviews.map((review) => ({
    id: review.id,
    state: review.state,
    commit: review.commit_id,
    user: review.user?.login?.toLowerCase(),
    submittedAt: review.submitted_at,
  })).sort((left, right) => Number(left.id) - Number(right.id)));
}

async function writeCheck(github, check, data) {
  if (!check) return;
  return github.rest.checks.update({
    owner: check.owner,
    repo: check.repo,
    check_run_id: check.id,
    name: CHECK_NAME,
    external_id: check.externalId,
    details_url: check.url,
    status: "completed",
    ...data,
  });
}

async function createBlockedCheck({ github, owner, repo, pull }) {
  const externalId = "conditional-review-gate:" + pull.number + ":" + pull.head.sha;
  // Compatibility output during migration only. GitHub can attach even a new
  // check to an older Actions suite; the new policy uses commit statuses.
  const created = await github.rest.checks.create({
    owner, repo, name: CHECK_NAME, head_sha: pull.head.sha,
    external_id: externalId, details_url: pull.html_url,
    status: "completed",
    conclusion: "failure",
    output: {
      title: "Re-evaluating review policy",
      summary: "Risk and approval state are being checked again. The previous success is no longer valid.",
    },
  });
  return { owner, repo, externalId, url: pull.html_url, id: created.data.id };
}

async function evaluatePull({ github, core, owner, repo, pullNumber, legacyChecks }) {
  const pull = (await github.rest.pulls.get({
    owner, repo, pull_number: pullNumber,
  })).data;
  if (pull.state !== "open" || !BASE_BRANCHES.includes(pull.base.ref)) return;

  // Set failure before reading dependencies so an error cannot leave the old success in place.
  const check = legacyChecks ? await createBlockedCheck({ github, owner, repo, pull }) : null;
  const [files, reviews] = await Promise.all([
    github.paginate(github.rest.pulls.listFiles, {
      owner, repo, pull_number: pullNumber, per_page: 100,
    }),
    github.paginate(github.rest.pulls.listReviews, {
      owner, repo, pull_number: pullNumber, per_page: 100,
    }),
  ]);

  const latestApprovers = new Set(latestSubmittedReviews(reviews)
    .filter((review) =>
      review.state === "APPROVED" &&
      review.commit_id === pull.head.sha &&
      review.user.login.toLowerCase() !== pull.user.login.toLowerCase(),
    )
    .map((review) => review.user.login.toLowerCase()));
  const reviewersWithWriteAccess = new Set();
  for (const username of latestApprovers) {
    try {
      const permission = await github.rest.repos.getCollaboratorPermissionLevel({
        owner, repo, username,
      });
      if (["admin", "maintain", "write"].includes(permission.data.permission)) {
        reviewersWithWriteAccess.add(username);
      }
    } catch {
      core.warning("Could not verify reviewer permissions; the approval will not count.");
    }
  }

  const result = evaluateReviewGate({
    body: pull.body,
    changedPaths: files.map((file) => file.filename),
    filesTruncated: files.length >= 3000,
    headSha: pull.head.sha,
    author: pull.user.login,
    reviews,
    reviewersWithWriteAccess,
  });

  // Events may arrive while this scan is running. Never publish success for an outdated snapshot.
  const [currentPull, currentReviews] = await Promise.all([
    github.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    github.paginate(github.rest.pulls.listReviews, {
      owner, repo, pull_number: pullNumber, per_page: 100,
    }),
  ]);
  if (pullSnapshot(currentPull.data) !== pullSnapshot(pull) ||
      reviewSnapshot(currentReviews) !== reviewSnapshot(reviews)) {
    await writeCheck(github, check, {
      conclusion: "failure",
      output: {
        title: "Review policy inputs changed",
        summary: "The PR or its reviews changed during evaluation. Wait for the next event-driven evaluation.",
      },
    });
    core.warning("PR #" + pullNumber + " changed during evaluation; keeping the gate blocked.");
    return { pull, reviews, passed: false, title: "Review policy inputs changed" };
  }

  const title = !result.classificationValid
    ? "Risk declaration needs correction"
    : result.approvalRequired
      ? (result.passed ? "Required approval found" : "Approval required")
      : "Self-merge allowed";
  await writeCheck(github, check, {
    conclusion: result.passed ? "success" : "failure",
    output: { title, summary: result.reasons.map((reason) => "- " + reason).join("\n") },
  });
  core.info("Published " + (result.passed ? "success" : "failure") + " for PR #" + pullNumber + ".");
  return { pull, reviews, passed: result.passed, title };
}

async function openPulls(github, owner, repo) {
  const lists = await Promise.all(BASE_BRANCHES.map((base) =>
    github.paginate(github.rest.pulls.list, { owner, repo, state: "open", base, per_page: 100 }),
  ));
  return [...new Map(lists.flat().map((pull) => [pull.number, pull])).values()];
}

function groupsByHead(pulls) {
  const groups = new Map();
  for (const pull of pulls) {
    if (!pull.head?.sha) throw new Error("Open PR #" + pull.number + " has no head SHA");
    const group = groups.get(pull.head.sha) || [];
    group.push(pull);
    groups.set(pull.head.sha, group);
  }
  return groups;
}

function membership(pulls = []) {
  return pulls.map((pull) => pull.number).sort((a, b) => a - b).join(",");
}

async function publishReviewGate({ github, context, core, legacyChecks = process.env.REVIEW_GATE_LEGACY_CHECKS !== "false" }) {
  const { owner, repo } = context.repo;
  const changedHead = context.eventName === "pull_request_target"
    ? context.payload?.pull_request?.head?.sha
    : context.eventName === "workflow_run" ? context.payload?.workflow_run?.head_sha : undefined;
  const runUrl = context.runId
    ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${owner}/${repo}/actions/runs/${context.runId}`
    : context.payload?.pull_request?.html_url;
  let pulls;
  try {
    pulls = await openPulls(github, owner, repo);
  } catch (error) {
    // A change event identifies its affected head even when listing PRs fails.
    if (changedHead) await github.rest.repos.createCommitStatus({
      owner, repo, sha: changedHead, context: STATUS_CONTEXT, state: "failure",
      description: "Could not list open PRs for the changed head", target_url: runUrl,
    });
    core.setFailed("Could not list open PRs: " + error.message);
    return;
  }
  const groups = groupsByHead(pulls);
  const results = new Map();
  const latest = new Map();

  async function status(sha, state, description) {
    // Ignore target_url when comparing: scheduled scans must not exhaust GitHub's
    // 1,000-status limit for a SHA/context just because the run URL changed.
    const previous = latest.get(sha);
    if (previous?.creator?.login === "github-actions[bot]" &&
        previous.state === state && previous.description === description) return;
    await github.rest.repos.createCommitStatus({
      owner, repo, sha, state, context: STATUS_CONTEXT, description,
      target_url: runUrl || groups.get(sha)[0].html_url,
    });
    latest.set(sha, { state, description, creator: { login: "github-actions[bot]" } });
  }

  // Invalidate only the PR head affected by a change event. Unchanged recovery
  // scans publish only state changes; any read/evaluation error still blocks.
  for (const [sha] of groups) {
    try {
      const combined = await github.rest.repos.getCombinedStatusForRef({ owner, repo, ref: sha, per_page: 100 });
      latest.set(sha, combined.data.statuses.find((item) => item.context === STATUS_CONTEXT));
      if (!latest.get(sha) || sha === changedHead) {
        await status(sha, "failure", "Re-evaluating risk and current-head approvals");
      }
    } catch (error) {
      await status(sha, "failure", "Could not read the previous review policy status");
      core.setFailed("Could not initialize review status: " + error.message);
      results.set(sha, null);
    }
  }

  for (const [sha, members] of groups) {
    if (results.has(sha)) continue;
    const evaluated = [];
    for (const pull of members) {
      try {
        const result = await evaluatePull({ github, core, owner, repo, pullNumber: pull.number, legacyChecks });
        if (!result || result.pull.head.sha !== sha) throw new Error("PR head or state changed during evaluation");
        evaluated.push(result);
      } catch (error) {
        core.setFailed("Could not evaluate PR #" + pull.number + ": " + error.message);
      }
    }
    results.set(sha, evaluated.length === members.length ? evaluated : null);
  }

  // A commit status is shared by all PRs with that SHA. Require every open PR's
  // policy to pass, and recheck membership and inputs before publishing success.
  let currentGroups;
  try {
    currentGroups = groupsByHead(await openPulls(github, owner, repo));
  } catch (error) {
    for (const [sha] of groups) await status(sha, "failure", "Could not recheck open PRs before publishing review policy");
    core.setFailed(error.message);
    return;
  }
  for (const [sha, members] of groups) {
    const evaluated = results.get(sha);
    let stable = membership(members) === membership(currentGroups.get(sha));
    if (evaluated) {
      for (const result of evaluated) {
        try {
          const [pull, reviews] = await Promise.all([
            github.rest.pulls.get({ owner, repo, pull_number: result.pull.number }),
            github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number: result.pull.number, per_page: 100 }),
          ]);
          if (pullSnapshot(pull.data) !== pullSnapshot(result.pull) ||
              reviewSnapshot(reviews) !== reviewSnapshot(result.reviews)) stable = false;
        } catch (error) {
          stable = false;
          core.setFailed("Could not recheck review policy inputs: " + error.message);
        }
      }
    }
    const passed = stable && evaluated && evaluated.every((result) => result.passed);
    const description = !stable ? "PR membership or review policy inputs changed; awaiting re-evaluation"
      : !evaluated ? "Review policy evaluation failed; inspect workflow logs"
        : evaluated.map((result) => `#${result.pull.number}: ${result.title}`).join("; ").slice(0, 140);
    await status(sha, passed ? "success" : "failure", description);
  }
  if (pulls.length === 0) core.info("No open PRs target develop or main.");
}

module.exports = { publishReviewGate, STATUS_CONTEXT };
