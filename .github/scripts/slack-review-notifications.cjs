const fs = require("node:fs");
const path = require("node:path");
const {
  findHighRiskPaths,
  latestSubmittedReviews,
  parseDeclaredRisk,
} = require("./review-gate.cjs");

const GITHUB_API = "https://api.github.com";
const SLACK_API = "https://slack.com/api/chat.postMessage";
const TIME_ZONE = "Asia/Seoul";
const MAX_REMINDER_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ARTIFACT_PREFIX = "slack-review-reminder-";

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function repoParts() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY is missing or invalid");
  return { owner, repo };
}

async function githubGet(apiPath) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not available");
  const response = await fetch(`${GITHUB_API}${apiPath}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jarihana-review-notifications",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} for ${apiPath}`);
  }
  return response.json();
}

async function githubPages(pathForPage, maxPages = 100) {
  const result = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageItems = await githubGet(`${pathForPage}${pathForPage.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(pageItems)) throw new Error(`GitHub API returned an invalid list for ${pathForPage}`);
    result.push(...pageItems);
    if (pageItems.length < 100) return result;
  }
  return result;
}

function parseSlackUserMap() {
  let parsed;
  try {
    parsed = JSON.parse(process.env.SLACK_REVIEW_USER_IDS || "");
  } catch {
    throw new Error("SLACK_REVIEW_USER_IDS must be a JSON object keyed by GitHub login");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("SLACK_REVIEW_USER_IDS must be a JSON object keyed by GitHub login");
  }
  return new Map(
    Object.entries(parsed)
      .filter(([login, slackId]) => login && /^U[A-Z0-9]+$/.test(String(slackId)))
      .map(([login, slackId]) => [login.toLowerCase(), String(slackId)]),
  );
}

function slackChannel() {
  const channel = String(process.env.SLACK_REVIEW_CHANNEL_ID || "");
  if (!/^[CG][A-Z0-9]+$/.test(channel)) {
    throw new Error("SLACK_REVIEW_CHANNEL_ID must contain a Slack channel ID");
  }
  return channel;
}

async function postSlackMessage(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured in GitHub Actions secrets");
  const response = await fetch(SLACK_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: slackChannel(),
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Slack chat.postMessage failed: ${payload.error || response.status}`);
  }
}

function escapeSlackText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;");
}

function kstParts(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function dateString(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date, count) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + count));
  return dateString(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function isWeekend(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

const holidayCache = new Map();

async function publicHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Korean public-holiday calendar returned ${response.status} for ${year}`);
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error(`Korean public-holiday calendar returned invalid data for ${year}`);
  const holidays = new Set(
    items
      .filter((item) => item.global === true && Array.isArray(item.types) && item.types.includes("Public"))
      .map((item) => item.date)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date))),
  );
  if (holidays.size === 0) throw new Error(`Korean public-holiday calendar had no national holidays for ${year}`);
  holidayCache.set(year, holidays);
  return holidays;
}

async function holidaysFor(...years) {
  const all = new Set();
  for (const year of new Set(years)) {
    for (const date of await publicHolidays(year)) all.add(date);
  }
  return all;
}

async function isBusinessDay(instant) {
  const parts = kstParts(new Date(instant));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (isWeekend(date)) return false;
  return !(await publicHolidays(Number(parts.year))).has(date);
}

function nextBusinessDate(date, holidayDates) {
  let candidate = date;
  do {
    candidate = addDays(candidate, 1);
  } while (isWeekend(candidate) || holidayDates.has(candidate));
  return candidate;
}

async function calculateDeadline(instant) {
  const parts = kstParts(new Date(instant));
  let date = `${parts.year}-${parts.month}-${parts.day}`;
  let holidays = await holidaysFor(Number(parts.year), Number(parts.year) + 1);
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);

  if (isWeekend(date) || holidays.has(date)) {
    date = nextBusinessDate(date, holidays);
    holidays = await holidaysFor(Number(date.slice(0, 4)));
    while (isWeekend(date) || holidays.has(date)) {
      date = nextBusinessDate(date, holidays);
      holidays = await holidaysFor(Number(date.slice(0, 4)));
    }
    return { date, time: "10:30", epoch: Date.parse(`${date}T10:30:00+09:00`) };
  }

  if (minuteOfDay < 10 * 60 + 30) {
    return { date, time: "10:30", epoch: Date.parse(`${date}T10:30:00+09:00`) };
  }
  if (minuteOfDay < 17 * 60 + 30) {
    return { date, time: "17:30", epoch: Date.parse(`${date}T17:30:00+09:00`) };
  }

  date = nextBusinessDate(date, holidays);
  holidays = await holidaysFor(Number(date.slice(0, 4)));
  while (isWeekend(date) || holidays.has(date)) {
    date = nextBusinessDate(date, holidays);
    holidays = await holidaysFor(Number(date.slice(0, 4)));
  }
  return { date, time: "10:30", epoch: Date.parse(`${date}T10:30:00+09:00`) };
}

function deadlineKey(deadline) {
  return `${deadline.date.replaceAll("-", "")}-${deadline.time.replace(":", "")}`;
}

function deadlineLabel(deadline) {
  return `${deadline.date} ${deadline.time} KST`;
}

function requiredSlackId(login, map) {
  return map.get(String(login || "").toLowerCase());
}

async function requestedNotification(assignedReviewer) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not available");
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const pr = event.pull_request;
  const reviewer = assignedReviewer || (event.requested_reviewer && event.requested_reviewer.login);
  if (!pr || !reviewer) {
    console.log("No individual reviewer was included in this review_requested event");
    return;
  }
  if (reviewer.toLowerCase() === String(pr.user && pr.user.login || "").toLowerCase()) {
    console.log("Skipping a review request addressed to the PR author");
    return;
  }

  const userMap = parseSlackUserMap();
  const slackId = requiredSlackId(reviewer, userMap);
  if (!slackId) throw new Error(`No Slack user mapping exists for GitHub reviewer ${reviewer}`);

  let dueText = "PR 본문 확인";
  try {
    dueText = deadlineLabel(await calculateDeadline(pr.created_at));
  } catch (error) {
    console.warn(`Could not calculate the KST deadline: ${error.message}`);
  }
  const declaration = parseDeclaredRisk(pr.body);
  const risk = declaration.valid ? declaration.risk : "본문 확인 필요";
  const title = escapeSlackText(pr.title);
  const url = pr.html_url;
  const text = `<@${slackId}> 리뷰 요청이 도착했습니다: <${url}|#${pr.number} ${title}>\n위험도: ${risk} · 리뷰 마감: ${dueText}`;
  await postSlackMessage(text);
  console.log(`Sent a Slack review-request notification for PR #${pr.number} to ${reviewer}`);
}

async function listArtifacts(owner, repo) {
  const artifacts = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await githubGet(`/repos/${owner}/${repo}/actions/artifacts?per_page=100&page=${page}`);
    if (!result || !Array.isArray(result.artifacts)) throw new Error("GitHub returned an invalid artifact list");
    artifacts.push(...result.artifacts);
    if (result.artifacts.length < 100) return artifacts;
  }
  return artifacts;
}

function isOurReminderArtifact(artifact, name, defaultBranch) {
  return artifact.name === name &&
    artifact.expired !== true &&
    artifact.workflow_run &&
    artifact.workflow_run.head_branch === defaultBranch;
}

async function getChangedFiles(owner, repo, number) {
  const files = [];
  let filesTruncated = false;
  for (let page = 1; page <= 30; page += 1) {
    const items = await githubGet(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    if (!Array.isArray(items)) throw new Error(`GitHub returned invalid changed-file data for PR #${number}`);
    files.push(...items.map((item) => item.filename));
    if (items.length < 100) return { paths: files, filesTruncated };
    if (page === 30) filesTruncated = true;
  }
  return { paths: files, filesTruncated };
}

async function activeReviewRequests(owner, repo, pr) {
  const events = await githubPages(`/repos/${owner}/${repo}/issues/${pr.number}/timeline`);
  const hasHistory = events.some((event) => event.event === "review_requested" || event.event === "review_request_removed");
  if (!hasHistory) {
    return (pr.requested_reviewers || [])
      .filter((reviewer) => reviewer && reviewer.login)
      .map((reviewer) => ({ login: reviewer.login, requestedAt: pr.created_at }));
  }

  const active = new Map();
  for (const event of events.sort((left, right) => Date.parse(left.created_at || 0) - Date.parse(right.created_at || 0))) {
    const login = event.requested_reviewer && event.requested_reviewer.login;
    if (!login) continue;
    const key = login.toLowerCase();
    if (event.event === "review_requested") {
      active.set(key, { login });
    } else if (event.event === "review_request_removed") {
      active.delete(key);
    }
  }
  return [...active.values()];
}

function requiresApproval(body, changedFiles) {
  const declaration = parseDeclaredRisk(body);
  const highRiskPaths = findHighRiskPaths(changedFiles.paths);
  return changedFiles.filesTruncated || highRiskPaths.length > 0 || !declaration.valid || declaration.risk === "high";
}

async function hasCurrentHeadApproval(owner, repo, pr, reviews) {
  const author = String(pr.user && pr.user.login || "").toLowerCase();
  const approvals = latestSubmittedReviews(reviews).filter((review) =>
    String(review.state || "").toUpperCase() === "APPROVED" &&
    review.commit_id === pr.head.sha &&
    String(review.user && review.user.login || "").toLowerCase() !== author,
  );

  for (const review of approvals) {
    const login = review.user.login;
    try {
      const permission = await githubGet(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}/permission`);
      if (["admin", "maintain", "write"].includes(permission.permission)) return true;
    } catch (error) {
      console.warn(`Could not verify write permission for reviewer ${login}; treating approval as missing`);
    }
  }
  return false;
}

async function publicPullRequests(owner, repo) {
  const branches = ["develop", "main"];
  const all = await Promise.all(branches.map((base) => githubPages(
    `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(base)}`,
  )));
  const unique = new Map();
  for (const pr of all.flat()) unique.set(pr.number, pr);
  return [...unique.values()];
}

async function deadlineScan() {
  const now = Date.now();
  if (!(await isBusinessDay(now))) {
    output("matrix", JSON.stringify({ include: [] }));
    output("has_reminders", "false");
    console.log("Skipping deadline scan on a KST weekend or public holiday");
    return;
  }
  const { owner, repo } = repoParts();
  const defaultBranch = process.env.DEFAULT_BRANCH || "main";
  const userMap = parseSlackUserMap();
  const [pullRequests, artifacts] = await Promise.all([
    publicPullRequests(owner, repo),
    listArtifacts(owner, repo),
  ]);
  const artifactNames = new Set(
    artifacts
      .filter((artifact) => artifact.expired !== true && artifact.workflow_run && artifact.workflow_run.head_branch === defaultBranch)
      .map((artifact) => artifact.name),
  );
  const reminders = [];

  for (const listedPr of pullRequests) {
    if (listedPr.draft || Date.now() - Date.parse(listedPr.created_at) > MAX_REMINDER_AGE_MS + 14 * 24 * 60 * 60 * 1000) continue;
    const pr = await githubGet(`/repos/${owner}/${repo}/pulls/${listedPr.number}`);
    const [requests, reviews, changedFiles] = await Promise.all([
      activeReviewRequests(owner, repo, listedPr),
      githubPages(`/repos/${owner}/${repo}/pulls/${listedPr.number}/reviews`),
      getChangedFiles(owner, repo, listedPr.number),
    ]);
    if (pr.state !== "open" || pr.draft || !requiresApproval(pr.body, changedFiles)) continue;
    if (await hasCurrentHeadApproval(owner, repo, pr, reviews)) continue;

    const eligible = requests.filter((request) =>
      request.login.toLowerCase() !== String(pr.user && pr.user.login || "").toLowerCase() &&
      requiredSlackId(request.login, userMap),
    );
    if (eligible.length === 0) continue;

    const deadline = await calculateDeadline(pr.created_at);
    if (deadline.epoch > now || now - deadline.epoch > MAX_REMINDER_AGE_MS) continue;
    const key = deadlineKey(deadline);
    const artifactName = `${ARTIFACT_PREFIX}pr-${pr.number}-${key}`;
    if (artifactNames.has(artifactName)) continue;

    reminders.push({
      artifact_name: artifactName,
      deadline_key: key,
      deadline_label: deadlineLabel(deadline),
      pr_number: pr.number,
      reviewers: eligible.map((request) => request.login),
    });
  }

  output("matrix", JSON.stringify({ include: reminders }));
  output("has_reminders", reminders.length > 0 ? "true" : "false");
  console.log(`Found ${reminders.length} pending approval-required review reminder(s)`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function deadlineNotification() {
  const { owner, repo } = repoParts();
  const reminder = JSON.parse(process.env.REVIEW_REMINDER || "{}");
  const prNumber = Number(reminder.pr_number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error("REVIEW_REMINDER has an invalid PR number");
  if (!(await isBusinessDay(Date.now()))) {
    output("sent", "false");
    console.log("Skipping deadline delivery on a KST weekend or public holiday");
    return;
  }
  const defaultBranch = process.env.DEFAULT_BRANCH || "main";
  const artifactName = `${ARTIFACT_PREFIX}pr-${prNumber}-${reminder.deadline_key}`;
  const existingArtifacts = await listArtifacts(owner, repo);
  if (existingArtifacts.some((artifact) => isOurReminderArtifact(artifact, artifactName, defaultBranch))) {
    console.log(`Reminder artifact ${artifactName} already exists; skipping duplicate notification`);
    output("sent", "false");
    return;
  }

  const pr = await githubGet(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const [requests, reviews, changedFiles] = await Promise.all([
    activeReviewRequests(owner, repo, pr),
    githubPages(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`),
    getChangedFiles(owner, repo, prNumber),
  ]);
  if (pr.state !== "open" || pr.draft || !requiresApproval(pr.body, changedFiles)) {
    console.log(`PR #${prNumber} no longer needs an approval reminder`);
    output("sent", "false");
    return;
  }
  if (await hasCurrentHeadApproval(owner, repo, pr, reviews)) {
    console.log(`PR #${prNumber} now has an approval from a reviewer with write access`);
    output("sent", "false");
    return;
  }

  const currentDeadline = await calculateDeadline(pr.created_at);
  if (deadlineKey(currentDeadline) !== reminder.deadline_key || Date.now() - currentDeadline.epoch > MAX_REMINDER_AGE_MS) {
    console.log(`PR #${prNumber} no longer belongs to the scanned review slot`);
    output("sent", "false");
    return;
  }
  const activeLogins = new Set(requests.map((request) => request.login.toLowerCase()));
  const userMap = parseSlackUserMap();
  const reviewers = [...new Set(reminder.reviewers || [])]
    .filter((login) => activeLogins.has(String(login).toLowerCase()) && requiredSlackId(login, userMap));
  if (reviewers.length === 0) {
    console.log(`PR #${prNumber} has no active mapped reviewers`);
    output("sent", "false");
    return;
  }

  await sleep(1100);
  if (!(await isBusinessDay(Date.now()))) {
    output("sent", "false");
    console.log("The KST date changed to a non-business day; skipping deadline delivery");
    return;
  }
  const mentions = reviewers.map((login) => `<@${requiredSlackId(login, userMap)}>`).join(" ");
  const title = escapeSlackText(pr.title);
  const text = `${mentions} 리뷰 마감 시각입니다. 현재 head 커밋에 승인 리뷰가 없습니다: <${pr.html_url}|#${pr.number} ${title}>\n마감: ${reminder.deadline_label}`;
  await postSlackMessage(text);

  const markerPath = path.join(process.env.RUNNER_TEMP || ".", "slack-review-reminder.json");
  fs.writeFileSync(markerPath, JSON.stringify({ pr: prNumber, deadline: reminder.deadline_key }));
  output("sent", "true");
  output("artifact_name", artifactName);
  output("marker_path", markerPath);
  console.log(`Sent a Slack deadline reminder for PR #${prNumber}`);
}

async function main(mode = process.argv[2]) {
  if (mode === "requested") return requestedNotification();
  if (mode === "assigned") {
    const reviewer = process.env.ASSIGNED_REVIEWER;
    if (!reviewer) throw new Error("ASSIGNED_REVIEWER is required for a direct assignment notification");
    return requestedNotification(reviewer);
  }
  if (mode === "deadline-scan") return deadlineScan();
  if (mode === "deadline-notification") return deadlineNotification();
  throw new Error("Expected mode: requested, assigned, deadline-scan, or deadline-notification");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, requestedNotification };
