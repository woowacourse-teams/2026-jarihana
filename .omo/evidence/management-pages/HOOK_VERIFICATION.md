# Management pages stop-hook verification

Directly verified on 2026-08-21 after the final management-page source edit.

## 1. Behavior and DOM contracts

- Scenario: group-context H1 and route-backed local tabs; Figma tab order and current state; semantic member table; applicant panel; live member/recruitment side rail; independent safe side-rail errors; mutation payloads, pending locks, and safe failure dialogs.
- Invocation: `npm test -- --runInBand tests/pages/manage/manage-pages.test.jsx tests/pages/manage/manage-css.test.js`
- Exit: `0`
- Binary observable: Jest reports `2 passed` suites, `16 passed` tests, `0` snapshots.
- Artifact: `direct-tests.log`

## 2. Static diagnostics

- Scenario: all owned JSX/JS/CSS and tests satisfy the repository ESLint configuration.
- Invocation: `npm run lint -- --no-warn-ignored src/pages/manage tests/pages/manage`
- Exit: `0`
- Binary observable: ESLint completed without errors or warnings.
- Artifact: `direct-lint.log`

## 3. Formatting

- Scenario: every owned management source and test matches the repository formatter.
- Invocation: `npx prettier --check src/pages/manage tests/pages/manage`
- Exit: `0`
- Binary observable: `All matched files use Prettier code style!`
- Artifact: `direct-format.log`

## 4. CSS/token and responsive contract

- Scenario: every CSS variable is defined in shared tokens; legacy raw repeated border/touch/breakpoint values are absent; Korean copy keeps whole words; the final2 two-column registration rail contract exists.
- Invocation: Node audit comparing `src/pages/manage/manage.css` variable usage with `src/shared/styles/tokens.css` definitions and checking the explicit responsive selectors.
- Exit: `0`
- Binary observable: `undefinedTokens: []`, raw `1px` borders `0`, raw `44px` `0`, raw `767px` `0`, `keepAll: true`, `sideRail: true`, semantic borders `14`, touch-target uses `3`.
- Artifact: `direct-token-audit.log`

## Judgment

All four commands above were executed without a shell pipeline, so the captured process exit code is the verification command's own exit code rather than a logging command's status. All owned, executable management-page success criteria pass. The registrations screen now mirrors the final2 hierarchy with a left applicant panel and right operations rail populated only by `useInfiniteGroupMembers(groupId)` and `useRecruitment(groupId, recruitmentId)` data. Side-query failures are isolated and show fixed Korean messages, never raw `error.message` content. Fresh authenticated 360/768/1440 browser screenshots remain an integration-level visual evidence requirement and are not claimed here.

The independent evidence-integrity invocation read every artifact back from disk and exited `0`. Its JSON reports all artifacts non-empty and every expected binary pass marker `true`; artifact: `direct-evidence-integrity.log`.
