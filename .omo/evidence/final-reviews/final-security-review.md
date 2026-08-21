# Final security review

- **recommendation:** APPROVE / PASS
- **severity:** no critical or high findings
- **scope:** `/Users/ohjonghyuk0717/Desktop/jarihana/frontend` source, Webpack/env configuration, package manifest and lockfile, unit/security tests, E2E fixture source, generated production bundle, and relevant deployment documentation

## Original intent

Ship a React JavaScript/JSX SPA against the existing Spring backend without weakening the backend's cookie-auth, CSRF, OAuth-state, schema-boundary, or authorization contracts. The production topology is same-origin; frontend guards are UX only and backend 401/403 decisions remain authoritative.

## Desired outcome

The browser sends only cookies (never bearer tokens), sends the readable CSRF cookie as the mutation header, refreshes only an `UNAUTHENTICATED` 401 with single-flight/one-retry behavior, safely handles OAuth state and post-login return paths, rejects malformed API data, does not expose secrets or test fixtures in production, and preserves backend authorization failures.

## User outcome review

PASS. Direct source inspection and reproduced tests support the intended security outcome. No critical/high vulnerability tied to the stated criteria was found.

## Criteria and evidence

- **SEC-01 cookie auth / CSRF:** PASS. `frontend/src/shared/api/client.js` fixes `credentials: "include"`, has no Authorization construction, and copies `XSRF-TOKEN` to `X-XSRF-TOKEN` for POST/PUT/PATCH/DELETE. Reproduced in `frontend/tests/api/client.test.js`.
- **SEC-02 refresh races:** PASS. Refresh is gated to `401 + UNAUTHENTICATED`, uses one shared promise, retries the original request once, and preserves 403. Concurrent, retry ceiling, failed refresh, and 403 cases passed.
- **SEC-03 OAuth/state/secrets:** PASS. `frontend/src/features/auth/oauth.js` uses 32 bytes from `crypto.getRandomValues`, URLSearchParams, a 10-minute `SameSite=Lax` state cookie, and Secure on HTTPS. `frontend/webpack.config.mjs` allowlists public variables; no client secret is defined. Backend remains the state verifier. OAuth tests passed.
- **SEC-04 redirect/XSS/error leakage:** PASS. `frontend/src/features/auth/returnTarget.js` rejects cross-origin, protocol-relative, whitespace-padded, and backslash-bearing values before navigation. No dangerous HTML/eval/document-write sink exists in application source. React text rendering is used, and user error messages map from known codes rather than rendering server details.
- **SEC-05 authorization:** PASS. Client guards do not manufacture authorization. Leader data is obtained through backend API calls, and server 403 is surfaced without refresh. Mutation APIs retain server responses as authority.
- **SEC-06 boundary parsing:** PASS. API envelopes and response data are parsed through strict Zod schemas; malformed responses become a generic mapped error rather than being trusted/rendered.
- **SEC-07 production/test separation:** PASS. A fresh `npm run build` completed. Searches of `frontend/dist` found no `installApiFixture`, `api-fixture`, Playwright, test-result, or fixture marker. Production aliases disable the diagnostic modules and the production-mode configuration test passed.
- **SEC-08 supply chain/config:** PASS with note. Dependency versions are exact and lockfile-backed; no git/file/link dependencies were found. The supplied execution context reports `npm audit` at 0 vulnerabilities. A fresh audit could not be independently queried because registry DNS/network access was unavailable.

## Reproduced verification

- `npm run build`: PASS (Webpack production build; only bundle-size warnings)
- Focused Jest security/auth suite: **7 suites, 35 tests passed**
- Production bundle fixture-marker search: PASS, no matches
- Static sink/secret/config searches: PASS for critical/high findings
- Fresh `npm audit --audit-level=high`: unavailable (`ENOTFOUND registry.npmjs.org`); exact evidence gap noted below

## Direct programming and remove-ai-slops pass

The security-sensitive production code is narrowly factored and uses native URL, Headers, cookies, crypto, and Zod boundaries. The reviewed tests assert observable wire behavior and adversarial target classes; they are not deletion-only, tautological, implementation-mirroring, or tests that merely verify a requested removal. No unnecessary parsing/normalization or security abstraction created false confidence. The production-mode test checks executable configuration rather than prose. No slop/maintenance issue rises to a stated security criterion failure.

## Blockers

None.

## Nonblocking notes / exact evidence gaps

- The registry was unreachable during this review, so the prior `npm audit: 0 vulnerabilities` result could not be freshly reproduced. Evidence pointer: command output from `npm audit --audit-level=high`, `getaddrinfo ENOTFOUND registry.npmjs.org`. This is not contrary evidence and does not fail a stated criterion.
- The OAuth state cookie is intentionally readable by JavaScript because the browser creates it; XSS would therefore compromise OAuth state as it would the rest of the SPA. No application XSS sink was found. A deployment CSP and security headers remain useful defense in depth at the reverse proxy, but were not a stated frontend criterion.
- `APP_OAUTH_COOKIE_NAME` and `APP_OAUTH_COOKIE_DOMAIN` are trusted deployment-time inputs and are interpolated into cookie attributes. Operators should keep them to a simple cookie token and an approved domain; this is not attacker-controlled at runtime.
- Remote backend-provided image URLs are rendered by `<img>` and may reveal client IP/referrer to that host. Constrain image origins/server data if the product requires a stricter privacy policy; no critical/high code-execution sink was found.

## Checked artifact paths

- `frontend/src/shared/api/client.js`
- `frontend/src/shared/api/cookies.js`
- `frontend/src/shared/api/errors.js`
- `frontend/src/shared/api/schemas.js`
- `frontend/src/features/auth/{api.js,bootstrap.js,context.jsx,oauth.js,returnTarget.js,schemas.js}`
- `frontend/src/app/{AuthGuard.jsx,LeaderGuard.jsx,SignupGuard.jsx,routeAccess.js,routes.js,AppRouter.jsx,developmentTools.js}`
- all `frontend/src/features/**`, `frontend/src/entities/**`, and page/UI render paths via static sink and secret searches
- `frontend/webpack.config.mjs`, `frontend/babel.config.cjs`, `frontend/public/index.html`, `frontend/.env.example`, `frontend/README.md`
- `frontend/package.json`, `frontend/package-lock.json`
- `frontend/tests/api/client.test.js`, `frontend/tests/auth/**`, guard tests, production Webpack test, and `frontend/tests/e2e/**`
- generated `frontend/dist/**`
