# Final security/privacy gate 3

- **recommendation:** APPROVE
- **gate:** PASS
- **blockers:** none
- **review date:** 2026-08-21 (Asia/Seoul)
- **scope:** current frontend worktree plus the backend security/OAuth authority paths needed to verify the frontend contract

## Original intent

Ship the current frontend without weakening cookie authentication, CSRF, OAuth state, redirect safety, server authorization, secret handling, or production/test separation. The latest product change is CSS token aliasing, while the E2E fixture change isolates capture state and must remain test-only.

## Desired outcome

The production browser client uses cookie credentials and the XSRF double-submit header; refreshes only an `UNAUTHENTICATED` 401 through one shared refresh and at most one request retry; never refreshes a 403; generates and server-validates a strong one-use OAuth state; permits only same-origin return targets; stores no JWT/client secret; uses no dangerous HTML execution sink; treats backend 403 as authoritative; exposes only explicitly public build variables; and ships no fixture/test code in `dist`.

## User outcome review

PASS. Direct inspection and fresh execution reproduce every stated security/privacy outcome. No current finding violates the requested criteria. The CSS token aliases are presentation-only. The E2E fixture remains under `frontend/tests/e2e/`, operates on the passed `pageInstance`, and no fixture marker or test file appears in the rebuilt production output.

## Criterion results

- **SEC-01 — cookie credentials and XSRF: PASS.** `frontend/src/shared/api/client.js` creates the transport with `credentials: "include"`, does not construct an Authorization header, and copies decoded `XSRF-TOKEN` into `X-XSRF-TOKEN` for POST/PUT/PATCH/DELETE. The focused wire test passed.
- **SEC-02 — bounded refresh behavior: PASS.** Refresh eligibility is exactly `ApiError`, HTTP 401, code `UNAUTHENTICATED`, retry enabled, and no prior retry. A single `refreshPromise` provides single-flight behavior and is cleared in `finally`; the original request is retried once. The concurrent, retry-ceiling, refresh-failure, and 403 cases passed. A 403 makes one request and no refresh.
- **SEC-03 — OAuth state: PASS.** `frontend/src/features/auth/oauth.js` generates 32 random bytes with Web Crypto, writes the state for ten minutes with `SameSite=Lax` and `Secure` on HTTPS, and supplies the identical value via `URLSearchParams`. Backend `GithubOAuthCommandController` consumes/clears the cookie and `GithubOAuthCommandService` rejects blank/mismatched state using `MessageDigest.isEqual` before code exchange.
- **SEC-04 — safe return targets: PASS.** `frontend/src/features/auth/returnTarget.js` rejects nonstrings, surrounding whitespace, non-root paths, protocol-relative paths, backslashes, and cross-origin resolution. Tampered storage is cleared, and the value is consumed once. Adversarial tests passed.
- **SEC-05 — no secrets, JWT storage, or dangerous sinks: PASS.** Static searches found no frontend bearer/Authorization construction, JWT/client-secret value, `localStorage`, dangerous HTML APIs, eval, or `new Function`. `sessionStorage` is limited to the validated return target. React renders server-facing text normally and mapped API errors do not expose backend detail.
- **SEC-06 — authoritative server 403: PASS.** The API client does not refresh 403. `LeaderAuthorityGuard` checks a returned server 403 before local identity comparison and renders the forbidden state. The dedicated guard test passed. Backend Spring Security and domain services remain the mutation authority.
- **SEC-07 — production/test isolation: PASS.** A fresh production build passed. Searches of `frontend/dist` found no `installApiFixture`, `api-fixture`, Playwright, fixture-state markers, test/spec paths, client-secret markers, or private-key markers. The fixture's capture isolation is test-only.
- **SEC-08 — public environment safety: PASS.** `frontend/webpack.config.mjs` injects only an explicit allowlist: GitHub client ID, redirect URI, OAuth cookie name/domain, and the development-tool flag. `frontend/.env.example` explicitly prohibits a GitHub client secret and contains no secret value. The production-config test passed.

## Fresh reproduced evidence

- `npm test -- --runTestsByPath tests/api/client.test.js tests/auth/oauth.test.js tests/auth/returnTarget.test.js tests/auth/config.test.js tests/app/leader-guard.test.jsx tests/config/webpack-production-jsx.test.js`: PASS — 6 suites, 26 tests.
- `npm run build`: PASS — Webpack production output generated; only asset-size performance warnings.
- Post-build fixture/secret/private-key scan over `frontend/dist`, source, config, and env example: PASS — no matches.
- Post-build production sink/token-storage/Authorization scan over `frontend/src`: PASS — no matches beyond the deliberately validated return-target `sessionStorage` usage found by the broader inspection.
- Production output inventory: assets, `index.html`, and `manifest.webmanifest` only; no test/spec/fixture path.

## Programming and remove-ai-slops direct pass

The security-sensitive implementation uses platform `Headers`, `URL`, Web Crypto, cookies, and Zod at appropriate boundaries. The focused tests assert observable requests, status handling, redirect acceptance/rejection, and production configuration. They are not deletion-only, tautological, implementation-mirroring, or tests that merely prove a requested removal. No unnecessary extraction, parser, or normalization creates false security confidence in this scope. The existing final code review explicitly records both the programming and remove-ai-slops perspectives and the same overfit/slop classes; its report does not substitute for this direct pass.

## Checked artifact paths

- `frontend/src/shared/api/client.js`
- `frontend/src/shared/api/cookies.js`
- `frontend/src/shared/api/errors.js`
- `frontend/src/features/auth/oauth.js`
- `frontend/src/features/auth/returnTarget.js`
- `frontend/src/features/auth/context.jsx`
- `frontend/src/pages/account/OAuthCallbackPage.jsx`
- `frontend/src/app/LeaderGuard.jsx`
- `frontend/webpack.config.mjs`
- `frontend/.env.example`
- `frontend/tests/api/client.test.js`
- `frontend/tests/auth/oauth.test.js`
- `frontend/tests/auth/returnTarget.test.js`
- `frontend/tests/auth/config.test.js`
- `frontend/tests/app/leader-guard.test.jsx`
- `frontend/tests/config/webpack-production-jsx.test.js`
- `frontend/tests/e2e/api-fixture.js`
- `frontend/tests/e2e/app.spec.js`
- `frontend/dist/**`
- `backend/src/main/java/com/project/jarihana/auth/command/controller/GithubOAuthCommandController.java`
- `backend/src/main/java/com/project/jarihana/auth/command/service/GithubOAuthCommandService.java`
- `backend/src/main/java/com/project/jarihana/common/auth/AuthCookieFactory.java`
- `backend/src/main/java/com/project/jarihana/common/auth/SecurityConfig.java`
- `.omo/evidence/e2e-fixture/final-verification.md`
- `.omo/evidence/final-reviews/final-code-review.md`
- `.omo/evidence/final-reviews/final-security-review.md`

## Exact evidence gaps

- No active ULW-loop plan/status was returned, so the requested fallback evidence location was used.
- A live GitHub OAuth round trip was not repeated in this gate; state generation and the backend validation/consumption path were verified through source and focused tests. This does not contradict a stated criterion.
- A new registry vulnerability query was outside this focused current-worktree gate; dependency advisories are not evidence of a failure in any stated criterion here.

## Blockers

None.
