# Management pages verification

Verified directly on 2026-08-21 from `/Users/ohjonghyuk0717/Desktop/jarihana/frontend`.

## Owned behavior tests

- Invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-pages.test.jsx`
- Exit status: `0`
- Binary observable: Jest reports `7 passed, 7 total` and `1 passed, 1 total` suites.
- Artifact: `owned-tests.log`
- Scenarios exercised: complete member DTO rendering without a fake expulsion action; confirmed leader transfer payload; exact recruitment creation payload; confirmed close payload `CLOSED`; approval payload `APPROVED` without a reason; rejection payload `REJECTED` with an optional reason; server status filter forwarding.

## Static diagnostics

- Invocation: `npx eslint src/pages/manage tests/pages/manage --max-warnings=0 --format json --output-file ../.omo/evidence/management-pages/eslint.json`
- Exit status: `0`
- Binary observable: all six entries in `eslint.json` have `errorCount: 0`, `fatalErrorCount: 0`, and `warningCount: 0`.
- Artifacts: `eslint.json`, `eslint.log`

## Contract/source audit

- Invocation: `rg -n "@media \\(max-width: 767px\\)|ConfirmDialog|recruitingStatus: \\"CLOSED\\"|status: \\"APPROVED\\"|status: \\"REJECTED\\"|내보내기" frontend/src/pages/manage frontend/tests/pages/manage`
- Exit status: `0`
- Binary observable: `contract-audit.log` records the responsive breakpoint, controlled confirmations, exact backend decision constants, and the assertion that no expulsion button exists.
- Artifact: `contract-audit.log`

## Repository build boundary

- Invocation: `npm run build`
- Exit status: `1`
- Binary observable: Webpack cannot resolve `frontend/src/index.jsx` because the integration-owned application entry does not exist yet.
- Artifact: `repository-build.log`

Therefore this evidence proves the bounded management-page assignment and its owned diagnostics, but it does **not** claim repository-wide completion. The parent integration lane must add the application entry and rerun the production build and browser QA.

## Router and mutation hardening

- RED invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-pages.test.jsx`
- RED observable: three failures proved pages still read undefined identifiers outside React Router and ConfirmDialog closed after a rejected decision.
- GREEN invocation: same focused Jest command after switching to `useParams`/`Link`, propagating mutation rejection, and updating the shared dialog event boundary.
- GREEN observable: `9 passed, 9 total`; artifact `router-action-tests.log`.
- Static invocation: `npx eslint src/pages/manage tests/pages/manage --max-warnings=0 --format json --output-file ../.omo/evidence/management-pages/router-action-eslint.json`
- Static observable: exit `0`; every audited file has zero errors and warnings in `router-action-eslint.json`.
- Safety scenario: a rejected 409 decision keeps the confirmation open, renders the mapped Korean conflict message, and never renders the supplied raw database message.

## Manage CSS token audit

- Invocation: `rg -n '#[0-9a-fA-F]{3,8}|rgb\\(|[0-9]+px|[0-9]+rem|var\\(--[a-z0-9-]+' src/pages/manage/manage.css`
- Artifact: `manage-css-token-audit.log`.
- Observable: every color, radius, spacing, and typography value uses a defined shared semantic token; the undefined-variable comparison returned no entries.
- Remaining raw structural values are layout geometry (`220/160/92/280/380/180px`), the 44px minimum target, 1px border width, 120px textarea minimum, and the 767px media boundary. Shared tokens do not currently define these concepts; they are reported rather than mapped to misleading semantic aliases.

## Contrast-safe text aliases

- RED invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-css.test.js`
- RED observable: the CSS contract test found `--color-brand-strong` and `--color-muted` still used as text colors.
- GREEN invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-css.test.js tests/pages/manage/manage-pages.test.jsx`
- GREEN observable: `2 passed` suites and `10 passed` tests in `contrast-tests.log`.
- Static invocation: `npx eslint src/pages/manage tests/pages/manage --max-warnings=0 --format json --output-file ../.omo/evidence/management-pages/contrast-eslint.json`
- Static observable: exit `0`; every entry records zero errors and warnings.
- Decision: management text now uses `--color-brand-ink` and `--color-muted-ink`; decorative surfaces retain their base brand tokens.

## Recruitment create re-entry lock

- RED invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-pages.test.jsx`
- RED observable: the rapid duplicate-submit scenario observed `mutateAsync` called twice while the first request was unresolved.
- GREEN invocation: `npm test -- --runTestsByPath tests/pages/manage/manage-css.test.js tests/pages/manage/manage-pages.test.jsx`
- GREEN observable: `2 passed` suites and `11 passed` tests in `create-lock-tests.log`.
- Static invocation: `npx eslint src/pages/manage tests/pages/manage --max-warnings=0 --format json --output-file ../.omo/evidence/management-pages/create-lock-eslint.json`
- Static observable: exit `0`; all managed files record zero errors and warnings.
- Implementation observable: `creatingRef` rejects synchronous re-entry before a second mutation call, `creating` immediately exposes the disabled/pending button state, and `finally` releases both locks after settlement.
- Formatter audit: the Korean date and date-time `Intl.DateTimeFormat` instances are constructed once at module scope and reused by every row.

## Figma management fidelity follow-up

Verified after the final source edit on 2026-08-21.

- Scenario: each management route renders the group name as the only page `h1`, a route-backed local management navigation with `aria-current`, and the Figma hierarchy. On the registrations route the links are ordered `모임 수정 → 멤버 관리 → 신청 관리 → 모집 설정`; the non-reference eyebrow is absent.
- Scenario: members render in a labelled semantic table on desktop and a token-driven two-column card layout below `47.9375rem`; registrations render inside the labelled `신청자 목록` panel.
- Invocation: `npm test -- --runInBand tests/pages/manage/manage-pages.test.jsx tests/pages/manage/manage-css.test.js`.
- Binary observable: exit `0`; Jest reports `2 passed` suites and `14 passed` tests.
- Artifact: `figma-fidelity-tests.log`.
- Invocation: `npm run lint -- --no-warn-ignored src/pages/manage tests/pages/manage`.
- Binary observable: exit `0`; ESLint emits no errors or warnings.
- Artifact: `figma-fidelity-lint.log`.
- Scenario: repeated borders, touch targets, and the mobile boundary use the shared `--border-thin`, `--touch-target`, and relative breakpoint contracts; Korean copy uses `word-break: keep-all` and navigation labels use `white-space: nowrap`.
- Invocation: the Node token audit recorded in `manage-token-audit.log` compares every `var(--token)` usage against `src/shared/styles/tokens.css` and rejects raw legacy border/touch/breakpoint values.
- Binary observable: `undefinedTokens: []`, raw `1px` borders `0`, raw `44px` `0`, raw `767px` `0`, `keepAll: true`.
- Artifact: `manage-token-audit.log`.
- Independent source-level review: the clone-fidelity reviewer confirmed that the previous product blockers (tab order/labels and extra eyebrow) are cleared; report `../management-pages-clone-fidelity.md`.
- Evidence boundary: fresh authenticated browser captures at 360/768/1440 remain an integration-owned visual evidence requirement and are not claimed by this scoped verification.
