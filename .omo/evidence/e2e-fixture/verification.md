# Playwright E2E fixture verification

## Owned artifacts

- `frontend/playwright.config.js`
- `frontend/tests/e2e/api-fixture.js`
- `frontend/tests/e2e/app.spec.js`

## Deterministic collection gate

Invocation (Node 24 runtime on `PATH`):

```text
npx --no-install eslint playwright.config.js tests/e2e
npx --no-install playwright test --list
```

Binary observable:

- ESLint exited `0` with no diagnostics.
- Playwright exited `0` and collected 58 Chromium tests from one spec.
- The matrix contains all 16 registered routes at 360, 768, and 1440 pixel widths, plus ten interaction/error scenarios.

## Final actual-browser run

Invocation:

```text
npx --no-install playwright test --workers=4 --reporter=line
```

Observed surface:

- Playwright Chromium 151 launched against an isolated production-mode Webpack preview on `127.0.0.1:4174`.
- `.last-run.json` records `status: passed` and no failed tests: all 58 scenarios passed.
- Test-only interception returned strict API envelopes and `unexpectedResponses` remained empty.
- Desktop runs passed axe with zero critical or serious violations.
- All 16 routes rendered at 360, 768, and 1440 pixels with one main landmark and no horizontal overflow.
- 48 non-empty route screenshots were written under `.omo/evidence/visual-qa/`.
- Anonymous return-target persistence, signup continuation, registration create/withdraw with logical focus fallback, group create/edit, leader transfer/recruitment close/registration approval, mobile drawer keyboard behavior, and 403/404/network recovery all passed.
