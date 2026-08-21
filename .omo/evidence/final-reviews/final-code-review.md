# Final code-quality review

**Verdict:** PASS  
**codeQualityStatus:** WATCH  
**recommendation:** APPROVE  
**Review scope:** complete uncommitted `frontend/` implementation; backend inspected read-only for controller/DTO contract alignment.

## Blocking findings

### CRITICAL

None.

### HIGH / MAJOR

None.

The production API paths and request methods align with the backend controllers. The shared client sends cookie credentials, adds the XSRF header to mutations, validates envelopes and domain payloads, limits refresh to one `401/UNAUTHENTICATED` retry, and shares the refresh promise. No production token storage, Authorization header, fake success action, or secret was found.

## Non-blocking findings

### MEDIUM

1. **Oversized UI modules conflict with the `remove-ai-slops` size perspective.** `src/pages/group-editor/GroupManagePage.jsx` is 325 pure LOC, `src/pages/manage/ManageRegistrationsPage.jsx` is 291, `src/pages/groups/GroupDetailPage.jsx` is 276, and `src/shared/ui/Overlay.jsx` is 266 (measured with the skill's nonblank/noncomment rule). These are each working, cohesive enough for this delivery, and have relevant component/E2E coverage, so this is not a release blocker. They should be split by responsibility before the next substantial feature change to keep future edits reviewable.

2. **Image path transformation is extra boundary behavior not established by the backend DTO.** `src/entities/group/index.js:52-60` rewrites a non-root-relative `representativeImageUrl`, and `tests/domain/domain-contracts.test.js:98-125` locks that transformation. The backend DTO exposes the URL verbatim. This is not demonstrably harmful and its current live-backend verification passed, but it is unnecessary production normalization unless an upstream contract explicitly permits both forms. Prefer either documenting that compatibility requirement or displaying the server-provided URL unchanged.

### LOW

1. **A few internal fallback/demo links remain raw anchors:** `src/pages/index.js:22` and `src/pages/ShowcasePage.jsx:209,224-225`. They are not in the primary application flows (the actual group cards use React Router's `Link`), but replacing them with router links would preserve SPA state consistently.

## Verification independently performed

- `git diff --check` passed.
- `npm run lint -- --max-warnings=0` passed.
- `npm run typecheck` passed (the project intentionally maps this JavaScript boundary check to ESLint).
- `npm test -- --runInBand` passed: **39 suites, 252 tests**.
- `npm run build` passed. Its only output was Webpack's non-blocking size advisory for the 388 KiB image and 419 KiB main asset.
- Inspected `.omo/evidence/e2e-fixture/final-verification.md`: **66/66** Playwright scenarios, route/capture coverage, and zero serious/critical axe findings are recorded.
- Inspected `.omo/evidence/live-backend-qa.md` and the backend controller/DTO source. The frontend's API endpoints and schemas are consistent with those contracts.
- Searched production frontend files for token/secret leakage, `Authorization`/Bearer token use, local/session token storage, direct production `fetch`, and production mocks; none found. Session storage is limited to a sanitized return target.

## Skill-perspective check

Ran: `omo:programming` and `omo:remove-ai-slops` were loaded before maintainability/test assessment.

- **Programming perspective:** no TypeScript escape hatches apply to this JS/JSX-only override. No brittle prompt/prose tests, production direct-fetch bypasses, or untyped TypeScript suppressions were found. Component tests use mocks at UI seams, while the API client, contract, and browser tests cover observable behavior; this is sufficient for the delivered surface.
- **Remove-ai-slops perspective:** no deletion-only tests, tests merely asserting a requested removal, tautological tests, or production fake data/actions were found. The two MEDIUM observations above are the applicable slop concerns: oversized modules and an arguably unneeded normalization path with an implementation-coupled test.

## Evidence caveat

`react-doctor-ui-followup.json` is `ok: true` with **0 errors**, but it contains 32 warnings (mostly barrel-import and generic advisory rules). Those warnings do not contradict the stated zero-error gate and are not treated as blocking correctness defects. The build warnings are similarly advisory, not failures.

