# UI primitives lane evidence

## TDD RED

Scenario: field, tab, overlay, toast, cursor and recovery-state behavioral suites imported the not-yet-created public UI module.

Invocation:

`PATH=/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node ./node_modules/jest/bin/jest.js --no-watchman --runInBand --runTestsByPath tests/ui/fields.test.jsx tests/ui/tabs.test.jsx tests/ui/overlays.test.jsx tests/ui/toast-and-states.test.jsx`

Observable: 4 suites failed because `src/shared/ui/index.js` did not exist. This was the intended feature-absence failure after the Jest toolchain and DOM peer were available.

## TDD GREEN

Scenario: accessible field linkage, pending button, controlled/uncontrolled tabs and arrow keys, modal focus trap/Escape/scroll/focus restore, toast max-three live region, opaque cursor pass-through, and recovery actions.

Invocation: same Node 24 Jest command as RED.

Observable: `Test Suites: 4 passed, 4 total`; `Tests: 10 passed, 10 total`; process exit 0.

## Static diagnostics

Scenario: all owned JSX/JS and tests.

Invocation:

`PATH=/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node ./node_modules/eslint/bin/eslint.js src/shared/ui src/pages/ShowcasePage.jsx tests/ui`

Observable: no stdout/stderr; process exit 0.

## Main landmark integration regression

Scenario: AppShell owns the sole `main` landmark, so `/__showcase` must not create a nested second main.

Change: `ShowcasePage` now renders its `PageContainer` as the default `div`.

Observable after change: the complete owned Jest command reports 4/4 suites and 10/10 tests passed; the owned ESLint invocation exits 0 with no output.

## Design-system audit

Scenario: file-size and raw-color compliance for owned source.

Invocation: nonblank LOC count with `awk`; raw color search with `rg` outside `tokens.css`.

Observable: largest JS/JSX file is `Overlay.jsx` at 199 nonblank non-comment lines; no raw hex/rgb values outside `tokens.css`; no TypeScript files or escape hatches.

## Integration note

Invocation: `npm run build` under Node 24.

Observable at lane handoff: Webpack reached the entry resolution stage and failed because integration-owned `src/index.jsx` had not landed yet. Root agent explicitly classified entry/build as integration-owned and requested lane handoff after owned tests/lint passed.

## Overlay and navigation hardening follow-up

RED scenarios:

- Controlled Modal, Drawer, and ConfirmDialog failed to restore focus to an external opener.
- ConfirmDialog exposed no internal pending state and leaked a rejected `onConfirm` promise.
- ToastProvider left its active timeout alive after unmount.
- GroupCard's default anchor did not invoke an injected client-link navigation contract.

GREEN invocation:

`PATH=/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node ./node_modules/jest/bin/jest.js --no-watchman --runInBand --runTestsByPath tests/ui/cards.test.jsx tests/ui/fields.test.jsx tests/ui/tabs.test.jsx tests/ui/overlays.test.jsx tests/ui/toast-and-states.test.jsx`

Observable: `Test Suites: 5 passed, 5 total`; `Tests: 17 passed, 17 total`; exit 0. Owned ESLint also exited 0 with no output.

Behavior now observed: controlled focus capture/restore, success-only async close, internal busy state, rejection alert without unhandled promise, toast timeout cleanup, and polymorphic `GroupCard as={Link}` client navigation.

Token audit: comparing every `var(--token)` under `src/**/*.css` with all CSS custom-property definitions returned an empty undefined-token set. Raw color search under `src/shared` excluding `tokens.css` returned no matches. Compatibility aliases for prior page CSS (`--font-size-*`, `--space-7`, `--header-height`) are now defined centrally.

## WCAG contrast hardening

RED: `tests/ui/contrast.test.js` failed because the AA text-role tokens did not exist.

GREEN: preserved Figma base tokens and added `--color-brand-ink: #08736f` plus `--color-muted-ink: #666666`; shared text roles now consume their semantic aliases. Contrast against surface/canvas/brand-soft respectively is brand 5.69/5.22/5.11 and muted 5.74/5.27/5.16, all above WCAG AA 4.5:1.

Invocation: complete owned Jest run including `contrast.test.js`.

Observable: `Test Suites: 6 passed, 6 total`; `Tests: 19 passed, 19 total`; exit 0. Owned ESLint exited 0 with no output. Direct base-token references left in shared UI are border/focus/accent decoration, not text.

## React state-updater purity follow-up

RED: the StrictMode toast test recorded four timer clears before the fourth toast was present in the committed DOM (`[false,false,false,false]`), proving timer side effects ran while React replayed the `setToasts` updater.

GREEN: `show` now uses a pure state projection only. A post-commit effect compares committed toast ids and clears displaced timers; the existing unmount cleanup and explicit dismiss cleanup remain.

Verification:

- Complete owned Jest: 6/6 suites, 20/20 tests, exit 0.
- Owned ESLint: exit 0, no output.
- React Doctor `--scope files --include-untracked --blocking error`: 127 files scanned, `errorCount: 0`; the previous Toast state-updater diagnostic is absent. Remaining 32 diagnostics are warnings outside this follow-up or the existing custom-modal recommendation.
- Machine report: `.omo/evidence/react-doctor-ui-followup.json`.

## Skeleton ARIA follow-up

RED: targeted Jest produced 2 failures. A labelled skeleton had no accessible role, while an unlabelled decorative skeleton was not hidden from the accessibility tree.

GREEN: a labelled Skeleton now owns `role="status"` and its accessible name; repeated visual segments after the first are hidden. The default unlabelled Skeleton is explicitly decorative with `aria-hidden="true"`.

Verification: `tests/ui/toast-and-states.test.jsx` reports 7/7 tests passed; targeted ESLint for `States.jsx` and the test exits 0 with no output.

## Final showcase Korean/CJK pass

Source evidence: `.omo/evidence/visual-qa/showcase-mobile-360.png` and `.omo/evidence/final-reviews/visual-pass-b.md` showed `스터디` split as `스터`/`디` and `없어요` as `없어`/`요`.

RED: `tests/ui/cjk-layout.test.js` produced 6/6 failures for missing Korean-safe title/description wrapping, shrink-safe mobile grid rules, and the raw inline skeleton height.

GREEN changes:

- Shared group/recruitment card titles and state titles/descriptions use `word-break: keep-all` with `overflow-wrap: anywhere` as the true overflow fallback.
- Cards, card bodies, states, and showcase grid children can shrink with `min-width: 0`; the 360–767 showcase grid reflows to `minmax(0, 1fr)` without horizontal clipping.
- Showcase skeleton height moved from JSX inline style to `.ui-showcase__skeleton` backed by `--showcase-skeleton-height`.

Verification:

- UI Jest: 7/7 suites, 28/28 tests, exit 0.
- ESLint across shared UI, ShowcasePage, and UI tests: exit 0.
- Prettier check across shared UI/styles, ShowcasePage, and UI tests: all matched files formatted.
- Production Webpack build: exit 0. Webpack reports only the existing asset-size advisory for the profile PNG and main bundle.
- Screenshot recapture is explicitly integration-owned by the root visual-QA lane.

## Round 2 shared token fidelity

RED: `tests/ui/design-token-contract.test.js` failed on repeated raw `0.0625rem` and `2.75rem` values in `ui.css`.

GREEN: all shared border-width, 1px press/indicator offsets, and touch geometry now reference the existing `--border-thin` and `--touch-target` tokens. Computed values remain exactly 1px and 44px. A direct `rg '0\.0625rem|2\.75rem' src/shared/styles/ui.css` returns no matches.

Verification:

- UI Jest: 8/8 suites, 29/29 tests, exit 0.
- Shared UI/tests ESLint: exit 0.
- Focused Prettier check: clean.
- Production Webpack build: exit 0; only existing main/profile asset-size advisories remain.
