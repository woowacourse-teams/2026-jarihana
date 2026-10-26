const HIGH_RISK_PATH_RULES = [
  {
    reason: "review approval or notification automation",
    pattern: /^\.github\/scripts\/(?:review-gate|publish-review-gate|auto-assign-reviewer|slack-review-notifications)\.cjs$/i,
  },
  {
    reason: "DB migration",
    pattern: /^backend\/(?:db\/migrations\/|src\/main\/resources\/db\/migration\/)/i,
  },
  {
    reason: "backend authentication or security implementation",
    pattern: /^backend\/src\/main\/java\/.*\/(?:auth|security)(?:\/|$)/i,
  },
  {
    reason: "backend token, OAuth, or security configuration",
    pattern: /^backend\/src\/main\/java\/.*(?:Jwt|Token|OAuth|Security|AuthCookie)[^/]*\.java$/i,
  },
  {
    reason: "frontend authentication or security implementation",
    pattern: /^frontend\/src\/.*\/(?:auth|security|oauth|token)(?:\/|$)/i,
  },
  {
    reason: "infrastructure or deployment configuration",
    pattern: /^(?:infra\/|\.github\/workflows\/|backend\/Dockerfile$|frontend\/netlify\.toml$)/i,
  },
  {
    reason: "production runtime configuration",
    pattern: /^backend\/src\/main\/resources\/application(?:-[^/]+)?\.ya?ml$/i,
  },
  {
    reason: "review policy or ownership configuration",
    pattern: /^(?:.*\/)?CODEOWNERS$|^docs\/repository-conventions\/(?:code-review\.md|review-owners\.yml|git\.md)$|^(?:.*\/)?AGENTS\.md$|^\.github\/pull_request_template\.md$/i,
  },
];

const VALID_RISKS = new Set(["low", "medium", "high"]);

function parseDeclaredRisk(body) {
  const matchingLines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*위험도:\s*(낮음|중간|높음|low|medium|high)\s*$/i))
    .filter(Boolean);

  if (matchingLines.length !== 1) {
    return { valid: false, risk: null };
  }

  const rawRisk = matchingLines[0][1].toLowerCase();
  const risk = {
    낮음: "low",
    중간: "medium",
    높음: "high",
  }[rawRisk] || rawRisk;

  return { valid: VALID_RISKS.has(risk), risk };
}

function findHighRiskPaths(paths) {
  const matches = [];

  for (const rawPath of paths) {
    const filePath = String(rawPath).replaceAll("\\", "/");
    for (const rule of HIGH_RISK_PATH_RULES) {
      if (rule.pattern.test(filePath)) {
        matches.push({ path: filePath, reason: rule.reason });
        break;
      }
    }
  }

  return matches;
}

function latestSubmittedReviews(reviews) {
  const latestByReviewerAndCommit = new Map();

  for (const review of reviews || []) {
    const login = review && review.user && review.user.login;
    if (!login || !review.commit_id || !review.submitted_at) continue;

    const key = login.toLowerCase() + ":" + review.commit_id;
    const previous = latestByReviewerAndCommit.get(key);
    const submittedAt = Date.parse(review.submitted_at) || 0;
    const previousSubmittedAt = previous ? Date.parse(previous.submitted_at) || 0 : -1;
    const reviewId = Number(review.id) || 0;
    const previousReviewId = previous ? Number(previous.id) || 0 : -1;

    if (
      !previous ||
      submittedAt > previousSubmittedAt ||
      (submittedAt === previousSubmittedAt && reviewId > previousReviewId)
    ) {
      latestByReviewerAndCommit.set(key, review);
    }
  }

  return [...latestByReviewerAndCommit.values()];
}

function evaluateReviewGate({
  body,
  changedPaths,
  filesTruncated = false,
  headSha,
  author,
  reviews,
  reviewersWithWriteAccess,
}) {
  const declaration = parseDeclaredRisk(body);
  const highRiskPaths = findHighRiskPaths(changedPaths);
  const reasons = [];
  let approvalRequired = false;

  if (highRiskPaths.length > 0) {
    approvalRequired = true;
    const reportedPaths = highRiskPaths
      .slice(0, 20)
      .map((match) => match.path + " (" + match.reason + ")");
    if (highRiskPaths.length > reportedPaths.length) {
      reportedPaths.push("외 " + (highRiskPaths.length - reportedPaths.length) + "개 경로");
    }
    reasons.push(
      "고위험 경로: " + reportedPaths.join(", "),
    );
  }

  if (!declaration.valid) {
    reasons.push("위험도를 low, medium, high 중 하나로 선언해야 함");
  } else if (declaration.risk === "high") {
    approvalRequired = true;
    reasons.push("PR 작성 AI가 고위험으로 분류");
  }

  if (filesTruncated) {
    approvalRequired = true;
    reasons.push("변경 파일 목록이 GitHub API 최대 조회 한도에 도달");
  }

  const eligibleReviewers = reviewersWithWriteAccess instanceof Set
    ? reviewersWithWriteAccess
    : new Set(reviewersWithWriteAccess || []);
  const hasApproval = latestSubmittedReviews(reviews).some((review) => {
    const login = review && review.user && review.user.login;
    return (
      review &&
      String(review.state || "").toUpperCase() === "APPROVED" &&
      review.commit_id === headSha &&
      login &&
      login.toLowerCase() !== String(author || "").toLowerCase() &&
      eligibleReviewers.has(login.toLowerCase())
    );
  });

  if (declaration.valid && !approvalRequired) {
    reasons.push("저·중위험이며 자동 고위험 경로가 없어 셀프 머지 가능");
  } else if (declaration.valid && !hasApproval) {
    reasons.push("현재 PR 작성자가 아닌 쓰기 권한자의 최신 커밋 승인 없음");
  } else if (declaration.valid) {
    reasons.push("현재 head 커밋에 대한 작성자 외 쓰기 권한자 승인 확인");
  }

  return {
    approvalRequired,
    classificationValid: declaration.valid,
    declaration,
    hasApproval,
    highRiskPaths,
    passed: declaration.valid && (!approvalRequired || hasApproval),
    reasons,
  };
}

module.exports = {
  evaluateReviewGate,
  findHighRiskPaths,
  latestSubmittedReviews,
  parseDeclaredRisk,
};
