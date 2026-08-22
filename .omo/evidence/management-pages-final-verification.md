# Management pages final direct verification

Date: 2026-08-21 (Asia/Seoul)

Scope: `frontend/src/pages/manage/**` and `frontend/tests/pages/manage/**`.

## Direct command results

All commands below were executed from `frontend/` without a shell pipeline, so each observed process status is the command's own exit status.

| Criterion | Invocation | Exit | Binary observable | Captured artifact |
| --- | --- | ---: | --- | --- |
| Owned behavior and DOM contracts | `npm test -- --runInBand tests/pages/manage/manage-pages.test.jsx tests/pages/manage/manage-css.test.js` | 0 | 2 suites passed; 16 tests passed | `management-pages/direct-tests.log` |
| Owned lint | `npm run lint -- --no-warn-ignored src/pages/manage tests/pages/manage` | 0 | ESLint completed with no error/warning report | `management-pages/direct-lint.log` |
| Owned formatting | `npx prettier --check src/pages/manage tests/pages/manage` | 0 | `All matched files use Prettier code style!` | `management-pages/direct-format.log` |
| CSS/token contract | Node audit comparing all `var(--*)` uses with shared token declarations | 0 | undefined tokens 0; raw 1px/44px/767px 0; keep-all true; side rail true | `management-pages/direct-token-audit.log` |
| Production integration compile | `npm run build` | 0 | Webpack 5.109.2 compiled successfully | `management-pages/direct-production-build.log` |
| Exact verified source identity | `shasum -a 256` over all changed management UI and tests | 0 | seven SHA-256 records | `management-pages/direct-source-sha256.log` |

The production build emits two existing bundle/asset size warnings (`main` and a profile illustration). It has no compilation error and the warnings are outside the management-page ownership; this report does not misstate them as zero warnings.

## Scenario judgment

- Members: semantic dense table, cursor continuation, real role/course/generation/joined data, leader transfer only, and no unsupported expulsion action.
- Recruitments: exact create/close payloads, immediate duplicate-submit lock, status-tolerant cards, cursor continuation, and safe dialog failure behavior.
- Registrations: exact filter/approve/reject payloads, applicant panel, Figma-order route tabs, and a two-column final2 hierarchy.
- Operations rail: `useInfiniteGroupMembers(groupId)` supplies the real loaded member count/list; `useRecruitment(groupId, recruitmentId)` supplies real status, approved count, capacity, and join method. No fabricated fallback count exists.
- Isolation: member/recruitment rail pending and error states do not block the applicant list or decision buttons; fixed Korean errors are shown and raw `error.message` strings are never rendered.
- Responsive/token contract: mobile becomes one column below `47.9375rem`; Korean uses `word-break: keep-all`; local tabs use `white-space: nowrap`; repeated borders and touch targets use shared semantic tokens.

## Evidence integrity

`management-pages/direct-evidence-integrity.log` confirms that the prior direct artifacts were read back as non-empty and all required pass markers were true. The current production build and source checksum artifacts were subsequently read back and are non-empty (`1908` and `736` bytes respectively).

## Boundary

This file proves executable source, behavior, static, token, formatting, and production compilation criteria. It does not claim a fresh authenticated pixel comparison at 360/768/1440; that browser-level visual comparison remains a separate integration QA artifact.
