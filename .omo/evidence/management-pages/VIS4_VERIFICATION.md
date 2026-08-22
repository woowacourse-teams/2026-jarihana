# Management VIS-4 source verification

Verified directly on 2026-08-21 from `frontend/` after the final source edit.

## Red → green

- RED invocation: `npm test -- --runInBand tests/pages/manage/manage-pages.test.jsx tests/pages/manage/manage-css.test.js`.
- RED exit: `1`.
- RED observable: the DOM had only the old `신청 상태` select, no compact `거절` filter button or operational-dashboard region; the CSS contract also lacked the dashboard canvas/status-filter/tablet-reflow rules.
- RED artifact: `vis4-red.log`.
- GREEN invocation: the same focused Jest command after implementation.
- GREEN exit: `0`.
- GREEN observable: Jest reports `2 passed` suites and `18 passed` tests.
- GREEN artifact: `vis4-green-tests.log`.

## VIS-4 source criteria

- Registration management now uses a full-width light `--color-canvas` bleed inside the page area and removes the redundant page heading/stat card.
- The left applicant surface is unboxed at tablet/desktop: compact route-backed status pill buttons precede avatar rows separated by `--border-thin`; real approve/reject actions and backend messages remain unchanged.
- The desktop layout uses a denser approximately 60/40 applicant/operations split and keeps the real member and recruitment panels in the wider rail.
- At `64rem` and below the main management grids reflow to one column before labels/actions become narrow. Action buttons use semantic no-wrap behavior. At `47.9375rem` the applicant rows return to bordered cards, filters form two columns, and global `word-break: keep-all` remains active.
- Geometry reused within this page is named through local semantic custom properties; all colors remain shared semantic tokens.

## Static and integration checks

| Check | Invocation | Exit | Observable | Artifact |
| --- | --- | ---: | --- | --- |
| ESLint | `npm run lint -- --no-warn-ignored src/pages/manage tests/pages/manage` | 0 | no error/warning output | `vis4-lint.log` |
| Prettier | `npx prettier --check src/pages/manage tests/pages/manage` | 0 | all matched files formatted | `vis4-format.log` |
| Token/responsive audit | Node source audit | 0 | undefined tokens/raw colors/raw legacy border/touch/breakpoint values all zero; canvas, unboxed rows, tablet reflow, mobile cardification and keep-all all true | `vis4-token-audit.log` |
| Production build | `npm run build` | 0 | Webpack compiled | `vis4-build.log` |

Webpack reports two existing application bundle/asset size warnings. They are recorded in the build artifact and are outside this management-page fidelity change; no compilation error occurred.

## Boundary

This closes the VIS-4 source/layout gap and the management-specific 768px density issue. Fresh 360/768/1440 screenshots and the pixel-diff verdict are intentionally left to the root integration lane, as assigned.
