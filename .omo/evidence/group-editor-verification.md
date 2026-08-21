# Group editor verification

Verified: 2026-08-21 Asia/Seoul

## Scenarios and observables

1. New `SESSION` group submission
   - Scenario: enter type/name/introduction/description/date/start/end and submit.
   - Observable: `useCreateGroup().mutateAsync` receives the exact backend body with
     `recurringSchedule: null` and the complete `sessionSchedule`.
   - Test: `submits the exact SESSION create body when the session form is valid`.

2. Recurring schedule validation and unsupported image action
   - Scenario: submit a recurring group without a selected weekday.
   - Observable: inline alert is shown, mutation is not called, no upload input exists, and the
     default-image notice is present.
   - Test: `requires an activity day for recurring groups and never exposes a fake upload`.

3. Supported group overview modification
   - Scenario: edit the group name and save.
   - Observable: the mutation body contains only `name`, `introduction`, and `description`.
   - Test: `edits only the backend-supported overview fields`.

4. Lifecycle boundary
   - Scenario: act immediately before and immediately after the 24-hour deadline.
   - Observable: before the boundary only delete is called; after it only terminate is called
     with `{status: "ENDED"}`.
   - Tests: `uses termination after the 24-hour deletion window`,
     `deletes within 24 hours and replaces a recurring schedule exactly`.

5. Mutation failure
   - Scenario: backend rejects overview modification with a safe `userMessage`.
   - Observable: a danger toast displays the safe message and navigation does not occur.
   - Test: `surfaces a safe mutation failure without navigating away`.

## Commands run

```text
/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/jest/bin/jest.js --runInBand --no-watchman tests/pages/group-editor/group-editor-pages.test.jsx --json --outputFile=../.omo/evidence/group-editor-green.json

Result: 1 suite passed; 6 tests passed; 0 failed.

/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/eslint/bin/eslint.js src/pages/group-editor tests/pages/group-editor --no-warn-ignored --format json --output-file ../.omo/evidence/group-editor-eslint.json

Result: 0 errors; 0 warnings.

/Users/ohjonghyuk0717/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/webpack/bin/webpack.js --config ../.omo/evidence/group-editor-webpack.config.mjs --mode production

Result: webpack 5.109.2 compiled successfully in 2001 ms.
Binary observable: `/tmp/jarihana-group-editor-build/assets/main.76aeefbc.js` plus four hashed
Figma SVG assets.
```

## Evidence artifacts

- `group-editor-green.json`: Jest machine-readable passing result.
- `group-editor-eslint.json`: ESLint machine-readable zero-error/zero-warning result.
- `group-editor-webpack.config.mjs`: isolated production-build harness for the owned entry.
- `group-editor-red.json` and `group-editor-error-red.json`: failing-first TDD observations.

Verdict: the owned group-editor implementation passes its behavioral tests, lint gate, and isolated
production compilation gate.

## AppShell landmark follow-up

- Changed all `NewGroupPage` and `GroupManagePage` root/loading/error wrappers from `main` to `div`.
- Machine observable after the edit: `nestedMainTags: 0` across both page modules.
- Re-ran the owned Jest suite: 6 passed, 0 failed.
- Re-ran owned ESLint: 0 errors, 0 warnings.
- Updated machine-readable artifacts: `group-editor-green.json`, `group-editor-eslint.json`.

## Integration audit follow-up

TDD defects found and fixed:

- Management back action incorrectly navigated to its current `/manage` route. A failing test first
  observed `/groups/17/manage`; the action now navigates to public detail `/groups/17`.
- A valid create form accepted two submissions while the first request was unresolved. A failing
  deferred-promise test observed two mutation calls; `useSubmissionLock` now provides immediate local
  locking in addition to TanStack Query pending state. The same lock protects overview, schedule,
  schedule removal, delete, and terminate mutations.
- Create failures now use only the mapped `userMessage` or a fixed safe fallback. Raw `message` is
  never exposed.

Final direct verification:

- Jest artifact `group-editor-integration-green.json`: 8 passed, 0 failed.
- ESLint artifact `group-editor-eslint.json`: 0 errors, 0 warnings.
- Isolated production bundle: Webpack 5.109.2 succeeded in 1417 ms;
  `/tmp/jarihana-group-editor-build/assets/main.6cc4aaa4.js` exists.
- CSS audit: 0 undefined custom-property references and 0 raw hex/rgb/px values. Repeated page
  geometry now uses scoped `--group-editor-*` aliases.
- Failing-first artifact: `group-editor-integration-red.json` records both defects before the fix.

## Contrast token follow-up

- Replaced text-role `--color-brand-strong` with `--color-brand-ink`.
- Replaced text-role `--color-muted` with `--color-muted-ink`.
- Preserved `--color-brand-soft` for the decorative hero surface.
- Jest artifact `group-editor-contrast-green.json`: 8 passed, 0 failed.
- ESLint: 0 errors, 0 warnings.
- Isolated production bundle: Webpack 5.109.2 succeeded in 1337 ms;
  `/tmp/jarihana-group-editor-build/assets/main.bb0f3633.js` exists.

## Final2 edit-frame fidelity follow-up

Reference: `.omo/evidence/figma/group-edit-438-3012.png`.

- Rebuilt `/groups/10/manage` as the final2 hierarchy: compact back action, mint two-column
  information/representative-image hero, read-only type tag, full-width description editor with
  right-aligned action, then schedule and lifecycle panels.
- Backend-supported fields and request bodies are unchanged; type and representative image remain
  explicitly read-only.
- Added `word-break: keep-all` at narrow viewports. Fresh 360px evidence keeps “프론트엔드” intact
  instead of splitting it as “프론트/엔드”.
- Replaced repeated border, touch-target, spacing, radius, font, and color values with shared or
  scoped tokens. Audit result: 0 undefined tokens and 0 raw hex/rgb/px values.
- TDD artifact `group-editor-fidelity-red.json` records the old nested description hierarchy.
- Jest artifact `group-editor-fidelity-green.json`: 9 passed, 0 failed.
- ESLint artifact `group-editor-eslint.json`: 0 errors, 0 warnings.
- Full application production build completed; only existing global asset-size warnings remained.
- Real Chromium fixture scenarios: manage at 360px, manage at 1440px, and create→edit mutation flow;
  3 passed in 3.8s.
- Fresh screenshots:
  - `.omo/evidence/visual-qa/group-manage-mobile-360.png`
  - `.omo/evidence/visual-qa/group-manage-desktop-1440.png`
