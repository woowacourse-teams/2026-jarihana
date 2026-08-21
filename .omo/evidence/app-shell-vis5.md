# AppShell VIS-5 proportion and token audit

Date: 2026-08-21 KST

## Decision

The five authoritative desktop references place the top edge of the shared header at approximately `63, 1, 0, 0, 4px` for groups, my, detail, edit, and manage. Because the product requires one common AppShell, the robust common coordinate is the median (`1px`), represented by the existing spacing token `--space-0` rather than a route exception.

Changing the desktop header from a `32px` top gap to `0px` reduces the approximate summed absolute y-error from `154px` to `68px` and improves four of five reference families. The horizontally inset, rounded desktop header remains intact. Mobile remains full-width because the change stays inside `@media (min-width: 48rem)`.

Source observable: `frontend/src/app/AppShell.css:182-188` uses `margin: var(--space-0) auto`. The centered `1fr auto 1fr` navigation contract remains at lines 190-202; no route-specific shell rule was introduced.

## Token audit

- Promoted reusable typographic semantics in `frontend/src/shared/styles/tokens.css:35-39`: `--font-weight-semibold`, `--font-weight-bold`, `--font-weight-extrabold`, and `--tracking-brand`.
- Consumed them in `frontend/src/app/AppShell.css:41-46`, `61-69`, and `94-106`.
- Kept the menu glyph's `20/2/6/4px` stroke geometry local at `frontend/src/app/AppShell.css:138-153`. Those values draw one intrinsic three-stroke icon; they are neither repeated layout dimensions nor a reusable product scale, so global tokens would obscure rather than encode semantics.

## TDD evidence

### RED

- Scenario: desktop AppShell must use the majority-aligned top coordinate and shared typography tokens.
- Invocation: `npm test -- --runInBand tests/app/app-shell-css.test.js`
- Binary observable: exit `1`; `uses the inset Figma desktop shell and shared header geometry tokens` failed because source still contained `margin: var(--space-8) auto 0` and raw typography values.
- Contract artifact: `frontend/tests/app/app-shell-css.test.js:38-72`.

### GREEN and regression

- Scenario: focused CSS/token contract after implementation.
- Invocation: `npm test -- --runInBand tests/app/app-shell-css.test.js`
- Binary observable: exit `0`; 1 suite, 2 tests passed.
- Artifact: `frontend/tests/app/app-shell-css.test.js`.

- Scenario: complete app-shell/router/guard regression.
- Invocation: `npm test -- --runInBand tests/app`
- Binary observable: exit `0`; 11 suites, 44 tests passed.
- Artifact directory: `frontend/tests/app/`.

- Scenario: repository JavaScript/CSS lint gate.
- Invocation: `npm run lint -- --max-warnings=0`
- Binary observable: exit `0`, no warnings or errors.
- Source artifacts: `frontend/src/app/AppShell.css`, `frontend/src/shared/styles/tokens.css`, `frontend/tests/app/app-shell-css.test.js`.

- Scenario: owned-source formatting gate.
- Invocation: `npx prettier --check src/app src/shared/styles/tokens.css tests/app`
- Binary observable: exit `0`; `All matched files use Prettier code style!`.
- Source artifacts: same three paths above.

- Scenario: production Webpack compilation.
- Invocation: `npm run build`
- Binary observable: exit `0`; `webpack 5.109.2 compiled with 2 warnings` and emitted the production entrypoint. The two size-budget warnings are pre-existing asset/entrypoint advisories, not compile errors.
- Build artifact: `frontend/dist/index.html` (the stable entry manifest; hashed JS filenames can be replaced by concurrent lane builds in this shared worktree).

## Visual rerun boundary

Fresh same-size browser capture and independent pixel/reviewer reruns are owned by the root visual gate. This change deliberately supplies a single common y-coordinate for those reruns; it does not reuse the stale matched screenshots that were captured with the former 32px gap.
