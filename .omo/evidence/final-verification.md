# 자리하나 frontend final verification

Date: 2026-08-21 (Asia/Seoul)

## Delivered surface

- React 19 application written only in JavaScript/JSX.
- Webpack/Babel build and Jest/Playwright test tooling; no TypeScript or Vite files.
- Sixteen routes covering public discovery/detail/recruitment, OAuth/signup/account, group create/edit, leader management, showcase, and not-found recovery.
- Schema-validated backend contracts, opaque cursor handling, cookie credentials, XSRF, 401-only single-flight refresh, OAuth state/return-target guards, and authoritative 403 handling.
- Token-driven shared AppShell, fields/buttons/cards/badges/tabs, modal/drawer/confirmation, toast, skeleton and state surfaces.
- Figma final2 layout language at 360/768/1440 while preserving backend-authoritative data and omitting unsupported image upload/direct join/profile mutation.

## Final automated gates

Runtime: Node.js `v24.19.0`.

| gate | result |
|---|---|
| `npm ci --dry-run --ignore-scripts --no-audit` | exit 0; lockfile resolves; npm reports non-fatal Babel 7 syntax-plugin peer overrides under the Babel 8/Jest graph |
| `npm run lint -- --max-warnings=0` | exit 0 |
| `npm run typecheck` | exit 0 (the project intentionally uses ESLint for JS/JSX static checks) |
| `npm test` | 41 suites, 255 tests passed |
| `npm run test:coverage` | 78.68% statements, 71.12% branches, 67.01% functions, 81.15% lines; 255 tests passed |
| `npm run build` | exit 0; production bundle emitted |
| `npx prettier --check .` | exit 0 |
| `npm run react-doctor` | exit 0; 0 errors, 37 non-blocking warnings |
| `npm audit --json` | exit 0; 0 vulnerabilities at all severities |

The production build has two non-blocking performance advisories: the 388 KiB profile illustration and the 419 KiB main entry exceed Webpack's default 244 KiB advisory threshold.

## Browser and visual QA

- `npm run test:e2e`: exit 0, 66/66 scenarios passed against an isolated production preview.
- Sixteen desktop axe scans: zero critical or serious violations.
- Exactly 48 route/viewport captures plus eight matched captures are non-empty and newer than the latest product source.
- The final 360px evidence preserves Korean words and balanced headings, including `세션` and the signup title.
- Eight raster-risk captures were regenerated in isolated Chromium processes. Exact SHA256/byte-identical unique-path copies disambiguate path-keyed preview caching without modifying the canonical 56 files.

Independent final approvals:

- Visual Pass A: `.omo/evidence/final-reviews/final5-visual-pass-a.md` — PASS.
- Visual Pass B: `.omo/evidence/final-reviews/final4-visual-pass-b.md` — PASS.
- Pixel/structure: `.omo/evidence/final-reviews/final4-pixel-compare.md` — APPROVE.
- Clone/design-system code fidelity: `.omo/evidence/final-reviews/final4-code-fidelity.md` — APPROVE.
- Code quality: `.omo/evidence/final-reviews/final4-code-quality.md` — APPROVE, no critical/high blockers.
- Security/privacy: `.omo/evidence/final-reviews/final3-security.md` — PASS; the only later product change was presentation-only Korean wrapping.

Primary browser evidence: `.omo/evidence/e2e-fixture/final-verification.md`.

## Real backend manual QA

The production preview was exercised without mocks against the real local backend:

- `/groups`: eight groups rendered.
- `Spring Boot` search: one result.
- `STUDY` filter: four results.
- no-match search: explicit empty state.
- `/groups/1` navigation and direct reload: successful.
- 1440px and 360px: zero document overflow, zero broken images, zero failed requests.
- `/api/groups`, `/api/groups/1`, and `/images/default-group.png`: HTTP 200 through the frontend proxy.
- Anonymous auth-bootstrap 401s were observed and classified as expected.
- Four real-backend screenshots are newer than the final source.

Evidence: `.omo/evidence/live-backend-qa.md` and `.omo/evidence/live-backend-manual-qa.md`.

The Java backend process started for QA was stopped after verification; no frontend preview listener remains. Backend source was not modified.

## Static integrity audits

- TypeScript/Vite files: 0.
- Undefined CSS custom properties: 0.
- Raw CSS colours outside `shared/styles/tokens.css`: 0.
- Repeated token-equivalent `0.0625rem`/`2.75rem` in shared UI CSS: 0.
- Test fixture markers in production `dist`: 0.
- `react-focus-lock` dependency residue: 0.
- Backend worktree changes: 0.
- `git diff --check`: exit 0.

## Deliberate verification boundary

Real GitHub OAuth and real authenticated leader mutations were not executed because no live OAuth credentials/test member were available. Those flows are covered by schema/API tests and production-browser fixtures, but are not claimed as live-credential verification. Production deployment should keep frontend and backend same-origin (or explicitly configure credentialed CORS and cookie domain/SameSite/Secure policy).
