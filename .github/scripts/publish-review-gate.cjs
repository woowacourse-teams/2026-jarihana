"use strict";

const { evaluateReviewGate, latestSubmittedReviews } = require("./review-gate.cjs");

const CHECK_NAME = "Conditional Review Gate";
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
  // A check from an older workflow run can disappear from the PR's required checks
  // when a newer run replaces its suite. Publish a new check for every evaluation.
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

async function evaluatePull({ github, core, owner, repo, pullNumber }) {
  const pull = (await github.rest.pulls.get({
    owner, repo, pull_number: pullNumber,
  })).data;
  if (pull.state !== "open" || !BASE_BRANCHES.includes(pull.base.ref)) return;

  // Set failure before reading dependencies so an error cannot leave the old success in place.
  const check = await createBlockedCheck({ github, owner, repo, pull });
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
    return;
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
}

async function publishReviewGate({ github, context, core }) {
  const { owner, repo } = context.repo;
  const lists = await Promise.all(BASE_BRANCHES.map((base) =>
    github.paginate(github.rest.pulls.list, { owner, repo, state: "open", base, per_page: 100 }),
  ));
  const pullNumbers = [...new Set(lists.flat().map((pull) => pull.number))];
  for (const pullNumber of pullNumbers) {
    try {
      await evaluatePull({ github, core, owner, repo, pullNumber });
    } catch (error) {
      core.setFailed("Could not evaluate PR #" + pullNumber + ": " + error.message);
    }
  }
  if (pullNumbers.length === 0) core.info("No open PRs target develop or main.");
}

module.exports = { publishReviewGate };
