"use strict";

const fs = require("node:fs");
const { randomInt } = require("node:crypto");
const { findHighRiskPaths, parseDeclaredRisk, isTitleOnlyEdit, latestSubmittedReviews } = require("./review-gate.cjs");

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";

function repoParts() {
  const parts = String(process.env.GITHUB_REPOSITORY || "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("GITHUB_REPOSITORY is missing or invalid");
  }
  return { owner: parts[0], repo: parts[1] };
}

async function githubRequest(method, apiPath, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not available");
  const response = await fetch(API_ROOT + apiPath, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "jarihana-auto-reviewer-assignment",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && payload.message ? payload.message : response.status;
    throw new Error("GitHub API returned " + detail + " for " + apiPath);
  }
  return payload;
}

async function githubPages(apiPath) {
  const results = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = apiPath.includes("?") ? "&" : "?";
    const pageItems = await githubRequest(
      "GET",
      apiPath + separator + "per_page=100&page=" + page,
    );
    if (!Array.isArray(pageItems)) {
      throw new Error("GitHub returned an invalid list for " + apiPath);
    }
    results.push(...pageItems);
    if (pageItems.length < 100) return results;
  }
  return results;
}

function parseReviewOwners(source) {
  const team = [];
  const modules = [];
  let section = "";
  let currentModule = null;
  let readingCandidatePaths = false;

  for (const line of source.split(/\r?\n/)) {
    if (line === "team:") {
      section = "team";
      currentModule = null;
      readingCandidatePaths = false;
      continue;
    }
    if (line === "modules:") {
      section = "modules";
      currentModule = null;
      readingCandidatePaths = false;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(line)) {
      section = "";
      currentModule = null;
      readingCandidatePaths = false;
      continue;
    }

    if (section === "team") {
      const teamMatch = line.match(/^\s+-\s+github:\s*([A-Za-z0-9-]+)\s*$/);
      if (teamMatch) team.push(teamMatch[1]);
      continue;
    }

    if (section !== "modules") continue;

    const moduleMatch = line.match(/^  ([A-Z]):\s*$/);
    if (moduleMatch) {
      currentModule = {
        id: moduleMatch[1],
        primary: "",
        backup: "",
        candidatePaths: [],
      };
      modules.push(currentModule);
      readingCandidatePaths = false;
      continue;
    }
    if (!currentModule) continue;

    const primaryMatch = line.match(/^    primary:\s*([A-Za-z0-9-]+)\s*$/);
    if (primaryMatch) {
      currentModule.primary = primaryMatch[1];
      readingCandidatePaths = false;
      continue;
    }
    const backupMatch = line.match(/^    backup:\s*([A-Za-z0-9-]+)\s*$/);
    if (backupMatch) {
      currentModule.backup = backupMatch[1];
      readingCandidatePaths = false;
      continue;
    }
    const pathsMatch = line.match(/^    candidate_paths:\s*(.*)$/);
    if (pathsMatch) {
      readingCandidatePaths = pathsMatch[1].trim() === "";
      continue;
    }
    const pathMatch = line.match(/^      -\s+(.+?)\s*$/);
    if (readingCandidatePaths && pathMatch) {
      currentModule.candidatePaths.push(pathMatch[1]);
      continue;
    }
    if (/^    [A-Za-z_][A-Za-z0-9_-]*:/.test(line)) {
      readingCandidatePaths = false;
    }
  }

  if (team.length === 0 || modules.length === 0) {
    throw new Error("review-owners.yml did not contain a team and module map");
  }
  return { team, modules };
}

function canonicalLogin(login, team) {
  const normalized = String(login || "").toLowerCase();
  return team.find((member) => member.toLowerCase() === normalized) || null;
}

function extractRecommendation(body, team) {
  const lines = String(body || "").split(/\r?\n/);
  const explicit = lines.find((line) => /^\s*-\s*자동 배정 리뷰어\s*:/i.test(line));
  const legacy = lines.find((line) =>
    /^\s*-\s*승인 필요 여부/i.test(line) && /리뷰어|추천/i.test(line),
  );
  const candidateLine = explicit || legacy;
  if (!candidateLine) return null;

  const tokens = candidateLine.matchAll(/@?([A-Za-z0-9-]+)/g);
  for (const token of tokens) {
    const login = canonicalLogin(token[1], team);
    if (login) return login;
  }
  return null;
}

function matchesGlob(path, pattern) {
  const prefix = pattern.replace(/\*.*$/, "");
  if (!prefix) return false;
  return path.startsWith(prefix);
}

function isFrontendOrInfrastructure(path) {
  return path.startsWith("frontend/") ||
    path.startsWith("infra/") ||
    path.startsWith(".github/workflows/") ||
    path === "backend/Dockerfile" ||
    path === "frontend/netlify.toml";
}

function routeToModule(paths, modules) {
  let selected = null;
  for (const changedPath of paths) {
    // Corresponding Java tests belong to the same module as the production package.
    const candidatePath = changedPath.replace(/^backend\/src\/test\/java\//, "backend/src/main/java/");
    const matched = modules.filter((module) =>
      module.candidatePaths.some((pattern) => matchesGlob(candidatePath, pattern)),
    );
    // An unmapped path or an overlap must not disappear from the ownership decision.
    if (matched.length !== 1 || (selected && selected !== matched[0])) return null;
    selected = matched[0];
  }
  return selected;
}

async function leastLoadedReviewer(owner, repo, team, author) {
  const loads = new Map(team.map((login) => [login.toLowerCase(), 0]));
  const pullLists = await Promise.all(["develop", "main"].map((base) =>
    githubPages(
      "/repos/" + owner + "/" + repo + "/pulls?state=open&base=" + encodeURIComponent(base),
    ),
  ));
  const uniquePulls = new Map();
  for (const pull of pullLists.flat()) uniquePulls.set(pull.number, pull);

  for (const pull of uniquePulls.values()) {
    if (pull.draft) continue;
    for (const reviewer of pull.requested_reviewers || []) {
      const key = String(reviewer.login || "").toLowerCase();
      if (loads.has(key)) loads.set(key, loads.get(key) + 1);
    }
  }

  const eligible = team.filter((login) => login.toLowerCase() !== author.toLowerCase());
  if (eligible.length === 0) return null;
  const minimum = Math.min(...eligible.map((login) => loads.get(login.toLowerCase())));
  const tied = eligible.filter((login) => loads.get(login.toLowerCase()) === minimum);
  return tied[randomInt(tied.length)];
}

function mappedModuleReviewer(module, team, author) {
  const primary = canonicalLogin(module.primary, team);
  const backup = canonicalLogin(module.backup, team);
  if (primary && primary.toLowerCase() !== author.toLowerCase()) return primary;
  if (backup && backup.toLowerCase() !== author.toLowerCase()) return backup;
  return null;
}

async function hasCurrentHeadApproval(owner, repo, pull) {
  const reviews = await githubPages(`/repos/${owner}/${repo}/pulls/${pull.number}/reviews`);
  const author = String(pull.user.login).toLowerCase();
  for (const review of latestSubmittedReviews(reviews)) {
    const login = review.user.login;
    if (String(review.state).toUpperCase() !== "APPROVED" ||
        review.commit_id !== pull.head.sha || login.toLowerCase() === author) continue;
    const result = await githubRequest(
      "GET", `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
    );
    if (["admin", "maintain", "write"].includes(result.permission)) return true;
  }
  return false;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not available");
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  if (isTitleOnlyEdit(event)) {
    console.log("Title-only edit; reviewer assignment is unchanged.");
    return;
  }
  const pull = event.pull_request;
  if (!pull || !pull.number) throw new Error("This event does not contain a pull request");
  if (pull.draft) {
    console.log("Draft PR; reviewer assignment is deferred until it is ready.");
    return;
  }

  const { owner, repo } = repoParts();
  const ownersPath = process.env.REVIEW_OWNERS_PATH || "docs/repository-conventions/review-owners.yml";
  const owners = parseReviewOwners(fs.readFileSync(ownersPath, "utf8"));
  const files = await githubPages(
    "/repos/" + owner + "/" + repo + "/pulls/" + pull.number + "/files",
  );
  const paths = files.map((file) => file.filename);
  const filesTruncated = files.length >= 3000;
  const declaration = parseDeclaredRisk(pull.body);
  const highRiskPaths = findHighRiskPaths(paths);
  const approvalRequired = filesTruncated || highRiskPaths.length > 0 ||
    (declaration.valid && declaration.risk === "high");

  if (!approvalRequired) {
    console.log("Low/medium PR without an automatic high-risk path; no reviewer request created.");
    return;
  }
  if (!declaration.valid && highRiskPaths.length === 0 && !filesTruncated) {
    console.log("::warning::Risk declaration is missing or invalid. Fix it before requesting a reviewer.");
    return;
  }

  const currentRequests = await githubRequest(
    "GET",
    "/repos/" + owner + "/" + repo + "/pulls/" + pull.number + "/requested_reviewers",
  );
  if ((currentRequests.users || []).length > 0 || (currentRequests.teams || []).length > 0) {
    console.log("A reviewer is already requested; preserving the existing request.");
    return;
  }

  // Pending requests disappear after a submitted review. Check the live PR head,
  // not the event's potentially older head, before asking for another review.
  const livePull = await githubRequest("GET", `/repos/${owner}/${repo}/pulls/${pull.number}`);
  if (livePull.state !== "open" || livePull.draft) {
    console.log("The PR is no longer open and ready; no reviewer request created.");
    return;
  }
  if (await hasCurrentHeadApproval(owner, repo, livePull)) {
    console.log("The current PR head already has a valid approval; no reviewer request created.");
    return;
  }

  const author = String(pull.user && pull.user.login || "");
  const sharedAreaOnly = !filesTruncated && paths.length > 0 && paths.every(isFrontendOrInfrastructure);
  const suggested = extractRecommendation(pull.body, owners.team);
  let reviewer = null;
  let reason = "";

  if (sharedAreaOnly) {
    reviewer = await leastLoadedReviewer(owner, repo, owners.team, author);
    reason = "frontend/infrastructure shared-area load balancing";
  } else if (suggested && suggested.toLowerCase() !== author.toLowerCase()) {
    reviewer = suggested;
    reason = "PR authoring AI recommendation";
  } else {
    const module = filesTruncated ? null : routeToModule(paths, owners.modules);
    if (module) {
      reviewer = mappedModuleReviewer(module, owners.team, author);
      reason = "module " + module.id + " primary/backup mapping";
    }
  }

  if (!reviewer) {
    console.log("::warning::No unambiguous reviewer could be selected. Add a valid team reviewer to the PR template field or request one manually.");
    return;
  }
  if (reviewer.toLowerCase() === author.toLowerCase()) {
    console.log("::warning::The selected reviewer is the PR author; no request was created.");
    return;
  }

  await githubRequest(
    "POST",
    "/repos/" + owner + "/" + repo + "/pulls/" + pull.number + "/requested_reviewers",
    { reviewers: [reviewer] },
  );
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "assigned_reviewer=" + reviewer + "\n");
  }
  console.log("Requested reviewer " + reviewer + " for high-risk PR #" + pull.number + " (" + reason + ").");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
